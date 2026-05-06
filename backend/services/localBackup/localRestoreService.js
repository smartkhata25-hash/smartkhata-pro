const fs = require("fs");
const path = require("path");

const { restoreBackup } = require("../restoreService");

const unzipper = require("unzipper");

const { BACKUP_DIR } = require("../../config/backupPaths");

/* =====================================================
   RESTORE FROM LOCAL FILE
===================================================== */

async function restoreFromLocalBackup(userId, filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        message: "Backup file not found",
      };
    }

    /* =====================================================
       ZIP VALIDATION
    ===================================================== */

    let isValidBackup = false;

    await fs
      .createReadStream(filePath)
      .pipe(unzipper.Parse())
      .on("entry", (entry) => {
        if (entry.path === "meta.json") {
          isValidBackup = true;
        }

        entry.autodrain();
      })
      .promise();

    if (!isValidBackup) {
      return {
        success: false,
        message: "Invalid backup file (meta.json missing)",
      };
    }

    /* =====================================================
       COPY TO BACKUP DIRECTORY
    ===================================================== */

    const uniqueName = `smartkhata-backup-${userId}-${Date.now()}.zip`;

    const tempPath = path.join(BACKUP_DIR, uniqueName);

    fs.copyFileSync(filePath, tempPath);

    /* =====================================================
       RESTORE CALL
    ===================================================== */

    const result = await restoreBackup(userId);

    return result;
  } catch (error) {
    console.error("❌ Local Restore Error:", error);

    return {
      success: false,
      message: "Restore failed (invalid or corrupt backup)",
    };
  }
}

module.exports = {
  restoreFromLocalBackup,
};
