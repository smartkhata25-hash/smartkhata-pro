const fs = require("fs");
const path = require("path");

const { restoreBackup } = require("../restoreService");

const MAX_LOCAL_BACKUP_SIZE = 500 * 1024 * 1024;

function validateLocalBackupFile(filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Backup file path is required");
  }

  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error("Backup file not found");
  }

  const stats = fs.statSync(resolvedPath);

  if (!stats.isFile()) {
    throw new Error("Selected backup is not a file");
  }

  if (stats.size <= 0) {
    throw new Error("Backup file is empty");
  }

  if (stats.size > MAX_LOCAL_BACKUP_SIZE) {
    throw new Error("Backup file exceeds the maximum allowed size of 500 MB");
  }

  if (path.extname(resolvedPath).toLowerCase() !== ".zip") {
    throw new Error("Only ZIP backup files are allowed");
  }

  return resolvedPath;
}

async function restoreFromLocalBackup(userId, filePath) {
  let resolvedPath = null;

  try {
    if (!userId) {
      return {
        success: false,
        message: "User ID is required",
      };
    }

    resolvedPath = validateLocalBackupFile(filePath);

    const result = await restoreBackup(userId, {
      localFilePath: resolvedPath,
    });

    return result;
  } catch (error) {
    console.error("❌ Local Restore Error:", error.message);

    return {
      success: false,
      message: error.message || "Local backup restore failed",
    };
  }
}

module.exports = {
  restoreFromLocalBackup,
};
