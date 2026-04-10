const fs = require("fs");
const path = require("path");
const os = require("os");

const { createBackup } = require("../backupService");

/* =====================================================
   DEFAULT LOCAL BACKUP PATH
===================================================== */

function getDefaultBackupPath() {
  const homeDir = os.homedir();

  const backupPath = path.join(homeDir, "Documents", "SmartKhata", "Backups");

  if (!fs.existsSync(backupPath)) {
    fs.mkdirSync(backupPath, { recursive: true });
  }

  return backupPath;
}

/* =====================================================
   CREATE LOCAL BACKUP
===================================================== */

async function createLocalBackup(userId) {
  try {
    // Step 1: normal backup create کریں
    const result = await createBackup(userId);

    if (!result.success) {
      return result;
    }

    const sourceFile = result.path;

    // Step 2: local folder path
    const localDir = getDefaultBackupPath();

    const fileName = path.basename(sourceFile);

    const destination = path.join(localDir, fileName);

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
