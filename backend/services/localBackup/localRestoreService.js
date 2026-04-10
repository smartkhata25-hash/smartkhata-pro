const fs = require("fs");
const path = require("path");

const { restoreBackup } = require("../restoreService");

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

    // temp میں copy کریں
    const tempPath = path.join(
      __dirname,
      "../../backups",
      path.basename(filePath),
    );

    fs.copyFileSync(filePath, tempPath);

    // restore call کریں
    const result = await restoreBackup(userId);

    return result;
  } catch (error) {
    console.error("❌ Local Restore Error:", error);

    return {
      success: false,
      message: error.message,
    };
  }
}

module.exports = {
  restoreFromLocalBackup,
};
