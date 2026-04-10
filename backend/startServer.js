console.log("🔥 SERVER FILE RUNNING");

const dotenv = require("dotenv");
const mongoose = require("mongoose");
const app = require("./app");
const { startMongo } = require("./db/mongoRunner");

const {
  startAutoBackup,
  runStartupBackupCheck,
} = require("./services/backupScheduler");

const path = require("path");

// ✅ .env load
dotenv.config({ path: path.join(__dirname, ".env") });

const startApp = async () => {
  try {
    console.log("🚀 Starting application...");

    // 1️⃣ Mongo start
    console.log("📦 Starting MongoDB...");
    await startMongo();
    console.log("✅ MongoDB started");

    // 2️⃣ DB connect
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ MongoDB connected");

    // 3️⃣ Backup system
    await runStartupBackupCheck();
    startAutoBackup();
    console.log("📦 Backup system initialized");

    // 4️⃣ Server start
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 URL: http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Startup Error:", err.message);

    // 🔥 detail error بھی دکھاؤ
    if (err.stack) {
      console.error(err.stack);
    }
  }
};

startApp();
