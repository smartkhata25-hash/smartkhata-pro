const User = require("../models/User");
const SystemMigration = require("../models/SystemMigration");

const createBaseAccountsForUser = require("../utils/createBaseAccounts");
const createDefaultExpenseTitlesForUser = require("../utils/createDefaultExpenseTitles");
const fixLegacyExpenseTitles = require("../utils/fixLegacyExpenseTitles");

const MIGRATION_KEY = "BASE_ACCOUNTS_REPAIR_V1";

// اگر migration running حالت میں رہ جائے تو
// 30 منٹ بعد اسے دوبارہ safely چلنے دیا جا سکتا ہے۔
const STALE_RUNNING_MINUTES = 30;

const repairBaseAccountsV1 = async () => {
  console.log("🔎 Checking migration:", MIGRATION_KEY);

  try {
    // =========================================================
    // 1. CHECK EXISTING MIGRATION STATUS
    // =========================================================

    let migration = await SystemMigration.findOne({
      key: MIGRATION_KEY,
    });

    // ✅ پہلے کامیابی سے مکمل ہو چکی ہے
    if (migration?.status === "completed") {
      console.log(`✅ Migration already completed: ${MIGRATION_KEY}`);
      console.log("⏭️ No repair required.");

      return {
        skipped: true,
        reason: "already_completed",
      };
    }

    // =========================================================
    // 2. HANDLE ALREADY RUNNING MIGRATION
    // =========================================================

    if (migration?.status === "running") {
      const startedAt = migration.startedAt
        ? new Date(migration.startedAt)
        : null;

      if (startedAt) {
        const runningForMs = Date.now() - startedAt.getTime();

        const staleAfterMs = STALE_RUNNING_MINUTES * 60 * 1000;

        if (runningForMs < staleAfterMs) {
          console.log(`⏭️ Migration is already running: ${MIGRATION_KEY}`);

          return {
            skipped: true,
            reason: "already_running",
          };
        }

        console.warn(
          `⚠️ Previous migration run appears stale. Retrying safely: ${MIGRATION_KEY}`,
        );
      }
    }

    // =========================================================
    // 3. GET ALL USERS
    // =========================================================

    const users = await User.find({}).select("_id").lean();

    const totalUsers = users.length;

    console.log(`👥 Total users found: ${totalUsers}`);

    // =========================================================
    // 4. CREATE / RESET MIGRATION RECORD
    // =========================================================

    migration = await SystemMigration.findOneAndUpdate(
      {
        key: MIGRATION_KEY,
      },
      {
        $set: {
          status: "running",

          startedAt: new Date(),

          completedAt: null,

          failedAt: null,

          errorMessage: "",

          totalUsers,

          processedUsers: 0,

          successfulUsers: 0,

          failedUsers: 0,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    // =========================================================
    // 5. PROCESS USERS ONE BY ONE
    // =========================================================

    let processedUsers = 0;
    let successfulUsers = 0;
    let failedUsers = 0;

    const failedUserIds = [];

    for (const user of users) {
      const userId = user._id;

      try {
        // ✅ STEP 1
        // Missing Base Accounts create کریں
        await createBaseAccountsForUser(userId);

        // ✅ STEP 2
        // Missing Default Expense Titles create کریں
        await createDefaultExpenseTitlesForUser(userId);

        // ✅ STEP 3
        // Legacy Expense Titles کو درست account پر منتقل کریں
        await fixLegacyExpenseTitles(userId);

        successfulUsers += 1;

        console.log(`✅ User repaired successfully: ${userId.toString()}`);
      } catch (userError) {
        failedUsers += 1;

        failedUserIds.push(userId.toString());

        console.error(
          `❌ Repair failed for user ${userId.toString()}:`,
          userError.message,
        );
      }

      processedUsers += 1;

      // Progress save کرتے رہیں
      await SystemMigration.updateOne(
        {
          _id: migration._id,
        },
        {
          $set: {
            processedUsers,
            successfulUsers,
            failedUsers,
          },
        },
      );
    }

    // =========================================================
    // 6. IF ANY USER FAILED
    // =========================================================

    if (failedUsers > 0) {
      const errorMessage =
        `${failedUsers} user(s) failed during migration. ` +
        `Failed User IDs: ${failedUserIds.join(", ")}`;

      await SystemMigration.updateOne(
        {
          _id: migration._id,
        },
        {
          $set: {
            status: "failed",

            failedAt: new Date(),

            errorMessage,

            processedUsers,

            successfulUsers,

            failedUsers,
          },
        },
      );

      console.error("❌ Migration finished with errors.");
      console.error(`👥 Total Users: ${totalUsers}`);
      console.error(`✅ Successful: ${successfulUsers}`);
      console.error(`❌ Failed: ${failedUsers}`);

      return {
        success: false,
        totalUsers,
        processedUsers,
        successfulUsers,
        failedUsers,
        failedUserIds,
      };
    }

    // =========================================================
    // 7. MIGRATION COMPLETED SUCCESSFULLY
    // =========================================================

    await SystemMigration.updateOne(
      {
        _id: migration._id,
      },
      {
        $set: {
          status: "completed",

          completedAt: new Date(),

          failedAt: null,

          errorMessage: "",

          processedUsers,

          successfulUsers,

          failedUsers: 0,
        },
      },
    );

    console.log("");
    console.log("======================================");
    console.log("✅ BASE ACCOUNT REPAIR COMPLETED");
    console.log("======================================");
    console.log(`👥 Total Users: ${totalUsers}`);
    console.log(`✅ Successful: ${successfulUsers}`);
    console.log("❌ Failed: 0");
    console.log(`🔒 Migration: ${MIGRATION_KEY}`);
    console.log("======================================");
    console.log("");

    return {
      success: true,
      totalUsers,
      processedUsers,
      successfulUsers,
      failedUsers: 0,
    };
  } catch (error) {
    console.error(`❌ Migration crashed: ${MIGRATION_KEY}`, error.message);

    try {
      await SystemMigration.findOneAndUpdate(
        {
          key: MIGRATION_KEY,
        },
        {
          $set: {
            status: "failed",

            failedAt: new Date(),

            errorMessage: error.message || "Unknown migration error",
          },
        },
        {
          upsert: true,
        },
      );
    } catch (statusError) {
      console.error(
        "❌ Could not save migration failure status:",
        statusError.message,
      );
    }

    return {
      success: false,
      error: error.message,
    };
  }
};

module.exports = repairBaseAccountsV1;
