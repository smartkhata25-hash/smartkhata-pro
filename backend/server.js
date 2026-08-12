require("dotenv").config();

const mongoose = require("mongoose");

const app = require("./app");

const repairBaseAccountsV1 = require("./scripts/repairBaseAccountsV1");

const {
  startAutoBackup,
  runStartupBackupCheck,
} = require("./services/backupScheduler");

const PORT = Number(process.env.PORT) || 5000;

let server = null;
let shuttingDown = false;

async function connectDatabase() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("✅ MongoDB connected");
  console.log("📦 Database:", mongoose.connection.name);
}

async function startServer() {
  try {
    await connectDatabase();

    // ✅ One-time repair migration
    try {
      const migrationResult = await repairBaseAccountsV1();

      if (migrationResult?.skipped) {
        console.log(
          "⏭️ Base account repair migration skipped:",
          migrationResult.reason,
        );
      } else if (migrationResult?.success) {
        console.log("✅ Base account repair migration completed successfully");
      } else {
        console.error(
          "⚠️ Base account repair migration did not complete successfully",
        );
      }
    } catch (migrationError) {
      console.error(
        "❌ Base account repair migration error:",
        migrationError.message,
      );
    }

    server = app.listen(PORT, () => {
      console.log(`🚀 Server started on port ${PORT}`);
    });

    startAutoBackup();

    if (process.env.ENABLE_STARTUP_BACKUP === "true") {
      setImmediate(async () => {
        try {
          await runStartupBackupCheck();
        } catch (error) {
          console.error("❌ Startup backup check failed:", error.message);
        }
      });
    }
  } catch (error) {
    console.error("❌ Server startup failed:", error.message);

    process.exit(1);
  }
}
async function gracefulShutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log(`⏳ ${signal} received. Shutting down...`);

  try {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    console.log("✅ Server shutdown completed");

    process.exit(0);
  } catch (error) {
    console.error("❌ Shutdown error:", error.message);

    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  gracefulShutdown("SIGTERM");
});

process.on("SIGINT", () => {
  gracefulShutdown("SIGINT");
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled Promise Rejection:", error);
});

process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);

  gracefulShutdown("uncaughtException");
});

startServer();
