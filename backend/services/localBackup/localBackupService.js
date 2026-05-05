const fs = require("fs");
const path = require("path");
const os = require("os");

const { createBackup } = require("../backupService");

/* =====================================================
   DEFAULT LOCAL BACKUP PATH
===================================================== */

function getDefaultBackupPath() {
  const baseDir =
    process.env.NODE_ENV === "production"
      ? "/tmp"
      : path.join(os.homedir(), "Documents");

  const backupPath = path.join(baseDir, "SmartKhata", "Backups");

  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  return backupPath;
}

/* =====================================================
   CREATE LOCAL BACKUP
===================================================== */

async function createLocalBackup(userId) {
  console.log("🔥 Local backup function STARTED");
  try {
    // Step 1: normal backup create کریں
    const result = await createBackup(userId);
    console.log("📦 Backup result:", result);

    if (!result.success) {
      return result;
    }

    const sourceFile = result.path;
    console.log("📁 Source file:", sourceFile);

    // Step 2: local folder path
    const localDir = getDefaultBackupPath();
    console.log("📂 Local directory:", localDir);

    const fileName = path.basename(sourceFile);

    const destination = path.join(localDir, fileName);
    console.log("📌 Destination file:", destination);

    // Step 3: copy file to local folder
    fs.copyFileSync(sourceFile, destination);

    return {
      success: true,
      message: "Local backup created successfully",
      path: destination,
    };
  } catch (error) {
    console.error("❌ Local Backup Error:", error);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  createLocalBackup,
};
