const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const mongoose = require("mongoose");

const { createBackup } = require("./backupService");

const User = require("../models/User");

const os = require("os");

const BACKUP_DIR = path.join(
  os.homedir(),
  "Documents",
  "SmartKhata",
  "Backups",
);

/* =========================================================
   Get latest backup time
========================================================= */

function getLatestBackupTime() {
  if (!fs.existsSync(BACKUP_DIR)) return null;

  const files = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((file) => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);

      return {
        file,
        created: stats.mtime,
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  if (files.length === 0) return null;

  return files[0].created;
}

/* =========================================================
   Check if backup needed today
========================================================= */

function backupNeededToday() {
  const lastBackup = getLatestBackupTime();

  if (!lastBackup) return true;

  const today = new Date();
  const last = new Date(lastBackup);

  return (
    today.getFullYear() !== last.getFullYear() ||
    today.getMonth() !== last.getMonth() ||
    today.getDate() !== last.getDate()
  );
}

/* =========================================================
   Backup all users
========================================================= */

async function backupAllUsers() {
  try {
    const users = await User.find({}, "_id");

    if (!users.length) {
      return;
    }

    for (const user of users) {
      try {
        await createBackup(user._id);
      } catch (err) {
        console.error(`Backup failed for ${user._id}:`, err.message);
      }
    }

    console.log("📦 All user backups completed");
  } catch (err) {
    console.error("Backup scheduler error:", err.message);
  }
}

/* =========================================================
   AUTO BACKUP JOB (2 PM)
========================================================= */

function startAutoBackup() {
  console.log("📦 Auto Backup Scheduler Started");

  // ⏳ DELAYED BACKUP (10 minutes after server start)
  setTimeout(
    async () => {
      try {
        console.log("⏳ Running delayed startup backup...");

        if (backupNeededToday()) {
          await backupAllUsers();
        } else {
          console.log("✅ Backup already exists today, skipping...");
        }

        console.log("✅ Delayed backup completed");
      } catch (err) {
        console.error("❌ Delayed backup failed:", err.message);
      }
    },
    10 * 60 * 1000,
  ); // 10 minutes

  // 🕑 DAILY BACKUP (2 PM)
  cron.schedule("0 14 * * *", async () => {
    try {
      console.log("⏳ Running scheduled backup...");

      if (backupNeededToday()) {
        await backupAllUsers();
      } else {
        console.log("✅ Backup already exists today, skipping...");
      }

      console.log("✅ Scheduled backup completed");
    } catch (err) {
      console.error("❌ Scheduled backup failed:", err.message);
    }
  });
}

/* =========================================================
   SERVER START BACKUP CHECK
========================================================= */

async function runStartupBackupCheck() {
  try {
    console.log("⏳ Startup check running...");

    console.log("✅ Startup backup skipped");
  } catch (err) {
    console.error("❌ Startup backup failed:", err.message);
  }
}

module.exports = {
  startAutoBackup,
  runStartupBackupCheck,
};
