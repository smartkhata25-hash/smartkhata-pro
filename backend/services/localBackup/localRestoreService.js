const fs = require("fs");
const path = require("path");

const { restoreBackup } = require("../restoreService");
const unzipper = require("unzipper");

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

    // ❗ STEP 1: ZIP validation
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

    // ❗ STEP 2: temp میں copy کریں
    const tempPath = path.join(
      __dirname,
      "../../backups",
      path.basename(filePath),
    );

    fs.copyFileSync(filePath, tempPath);

    // ❗ STEP 3: restore call
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
