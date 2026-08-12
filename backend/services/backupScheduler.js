const cron = require("node-cron");

const User = require("../models/User");

const { createBackup } = require("./backupService");
const { getCloudBackupList } = require("./cloudListService");
const { isRunning } = require("./backupProgressService");

const TIMEZONE = "Asia/Karachi";
const STARTUP_DELAY_MS = 10 * 60 * 1000;
const RETRY_DELAY_MS = 30 * 60 * 1000;
const MAX_BACKUP_ATTEMPTS = 2;

let schedulerStarted = false;
let backupAllUsersRunning = false;
let retryTimer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getPakistanDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}`;
}

async function hasCloudBackupToday(userId) {
  try {
    const result = await getCloudBackupList(userId, 10);

    if (!result.success || !Array.isArray(result.files)) {
      return false;
    }

    const today = getPakistanDateKey();

    return result.files.some((file) => {
      if (!file.lastModified) {
        return false;
      }

      return getPakistanDateKey(new Date(file.lastModified)) === today;
    });
  } catch (error) {
    console.error(`❌ Backup check failed for ${userId}:`, error.message);

    return false;
  }
}

async function getBusinessOwners() {
  return User.find(
    {
      isDeleted: { $ne: true },
      $or: [
        { accountRole: "owner" },
        { accountRole: { $exists: false } },
        { accountRole: null },
      ],
    },
    "_id",
  ).lean();
}

async function createUserBackup(userId) {
  if (isRunning(userId)) {
    return {
      success: false,
      busy: true,
      message: "Backup/restore already running",
    };
  }

  if (await hasCloudBackupToday(userId)) {
    return {
      success: true,
      skipped: true,
      message: "Cloud backup already exists today",
    };
  }

  let lastError = null;

  for (let attempt = 1; attempt <= MAX_BACKUP_ATTEMPTS; attempt += 1) {
    try {
      console.log(`☁️ Automatic backup for ${userId} - attempt ${attempt}`);

      const result = await createBackup(userId);

      if (result.success) {
        return {
          success: true,
          skipped: false,
          result,
        };
      }

      lastError = new Error(result.message || "Backup failed");
    } catch (error) {
      lastError = error;
    }

    if (attempt < MAX_BACKUP_ATTEMPTS) {
      await sleep(5000);
    }
  }

  return {
    success: false,
    busy: false,
    message: lastError?.message || "Automatic backup failed",
  };
}

function scheduleFailedBackupRetry() {
  if (retryTimer) {
    return;
  }

  retryTimer = setTimeout(async () => {
    retryTimer = null;

    try {
      console.log("🔄 Running automatic backup retry...");

      await backupAllUsers({
        reason: "retry",
      });
    } catch (error) {
      console.error("❌ Automatic backup retry failed:", error.message);
    }
  }, RETRY_DELAY_MS);
}

async function backupAllUsers({ reason = "scheduled" } = {}) {
  if (backupAllUsersRunning) {
    console.log(
      "⚠️ Automatic backup batch already running, skipping duplicate run",
    );

    return {
      success: false,
      skipped: true,
      reason: "batch_already_running",
    };
  }

  backupAllUsersRunning = true;

  const summary = {
    reason,
    total: 0,
    created: 0,
    skipped: 0,
    busy: 0,
    failed: 0,
  };

  try {
    const users = await getBusinessOwners();

    summary.total = users.length;

    if (users.length === 0) {
      console.log("ℹ️ No business owners found for backup");

      return {
        success: true,
        ...summary,
      };
    }

    for (const user of users) {
      const userId = user._id.toString();

      try {
        const result = await createUserBackup(userId);

        if (result.success && result.skipped) {
          summary.skipped += 1;

          console.log(`✅ Backup already exists today for ${userId}`);

          continue;
        }

        if (result.success) {
          summary.created += 1;

          console.log(`✅ Automatic backup completed for ${userId}`);

          continue;
        }

        if (result.busy) {
          summary.busy += 1;

          console.log(`⚠️ Backup skipped because user ${userId} is busy`);

          continue;
        }

        summary.failed += 1;

        console.error(
          `❌ Automatic backup failed for ${userId}:`,
          result.message,
        );
      } catch (error) {
        summary.failed += 1;

        console.error(
          `❌ Automatic backup failed for ${userId}:`,
          error.message,
        );
      }
    }

    console.log("📦 Automatic backup batch completed:", summary);

    if (summary.failed > 0 || summary.busy > 0) {
      scheduleFailedBackupRetry();
    }

    return {
      success: summary.failed === 0,
      ...summary,
    };
  } catch (error) {
    console.error("❌ Backup scheduler error:", error.message);

    scheduleFailedBackupRetry();

    return {
      success: false,
      ...summary,
      message: error.message,
    };
  } finally {
    backupAllUsersRunning = false;
  }
}

function startAutoBackup() {
  if (schedulerStarted) {
    console.log("⚠️ Auto Backup Scheduler already started");
    return;
  }

  schedulerStarted = true;

  console.log("📦 Auto Backup Scheduler Started - Asia/Karachi");

  setTimeout(async () => {
    try {
      console.log("⏳ Running delayed startup backup check...");

      await backupAllUsers({
        reason: "delayed_startup",
      });
    } catch (error) {
      console.error("❌ Delayed startup backup failed:", error.message);
    }
  }, STARTUP_DELAY_MS);

  cron.schedule(
    "0 14 * * *",
    async () => {
      try {
        console.log("⏳ Running daily 2 PM automatic backup...");

        await backupAllUsers({
          reason: "daily_2pm",
        });
      } catch (error) {
        console.error("❌ Scheduled backup failed:", error.message);
      }
    },
    {
      timezone: TIMEZONE,
    },
  );
}

async function runStartupBackupCheck() {
  try {
    console.log("⏳ Startup backup check running...");

    return await backupAllUsers({
      reason: "startup",
    });
  } catch (error) {
    console.error("❌ Startup backup check failed:", error.message);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  startAutoBackup,
  runStartupBackupCheck,
  backupAllUsers,
};
