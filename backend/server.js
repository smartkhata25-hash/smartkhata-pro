const mongoose = require("mongoose");
const dotenv = require("dotenv");
const app = require("./app");

const {
  startAutoBackup,
  runStartupBackupCheck,
} = require("./services/backupScheduler");

dotenv.config();

// MongoDB connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB connected");

    if (process.env.ENABLE_STARTUP_BACKUP === "true") {
      await runStartupBackupCheck();
    }
    startAutoBackup();

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));
  })
  .catch((err) => console.log(err));
