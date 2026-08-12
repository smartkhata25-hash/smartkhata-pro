const path = require("path");
const fs = require("fs");

const { createBackup, getBackupStatus } = require("../services/backupService");

const { restoreBackup } = require("../services/restoreService");

const {
  restoreFromLocalBackup,
} = require("../services/localBackup/localRestoreService");

const {
  getCloudBackupList,
  downloadBackupFromCloud,
} = require("../services/cloudListService");

const { getProgress, isRunning } = require("../services/backupProgressService");

function getUserId(req) {
  return req.user?.id || req.userId || null;
}

function cleanupFile(filePath) {
  if (!filePath) return;

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error("❌ File cleanup failed:", error.message);
  }
}

function validateBackupFileName(fileName) {
  if (!fileName || typeof fileName !== "string") {
    return null;
  }

  const cleanName = path.basename(fileName.trim());

  if (
    !cleanName ||
    cleanName !== fileName.trim() ||
    path.extname(cleanName).toLowerCase() !== ".zip"
  ) {
    return null;
  }

  return cleanName;
}

exports.createBackupController = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (isRunning(userId)) {
      return res.status(409).json({
        success: false,
        message: "Another backup or restore is already running",
      });
    }

    const result = await createBackup(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || "Backup creation failed",
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message || "Backup created successfully",
      file: result.path ? path.basename(result.path) : null,
    });
  } catch (error) {
    console.error("❌ Backup Controller Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Backup creation failed",
    });
  }
};

exports.restoreBackupController = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (isRunning(userId)) {
      return res.status(409).json({
        success: false,
        message: "Another backup or restore is already running",
      });
    }

    const fileName = validateBackupFileName(req.body?.fileName);

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: "A valid backup file must be selected",
      });
    }

    const result = await restoreBackup(userId, fileName);

    if (!result.success) {
      const statusCode = result.critical ? 500 : 422;

      return res.status(statusCode).json({
        success: false,
        message: result.message || "Restore failed",
        rollbackAttempted: Boolean(result.rollbackAttempted),
        rollbackSucceeded: Boolean(result.rollbackSucceeded),
        critical: Boolean(result.critical),
      });
    }

    return res.status(200).json({
      success: true,
      verified: result.verified === true,
      source: result.source || "cloud",
      message: result.message || "Backup restored successfully",
    });
  } catch (error) {
    console.error("❌ Restore Controller Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Restore failed",
    });
  }
};

exports.getBackupStatusController = (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const status = getBackupStatus(userId);

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("❌ Backup Status Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Could not get backup status",
    });
  }
};

exports.downloadBackupController = async (req, res) => {
  let downloadedPath = null;

  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const requestedFileName = req.query?.fileName
      ? validateBackupFileName(req.query.fileName)
      : null;

    if (req.query?.fileName && !requestedFileName) {
      return res.status(400).json({
        success: false,
        message: "Invalid backup file name",
      });
    }

    let fileName = requestedFileName;

    if (!fileName) {
      const result = await getCloudBackupList(userId);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: result.message || "Failed to fetch cloud backups",
        });
      }

      if (!result.files?.length) {
        return res.status(404).json({
          success: false,
          message: "No cloud backups found",
        });
      }

      fileName = result.files[0].name;
    }

    const downloaded = await downloadBackupFromCloud(userId, fileName);

    if (!downloaded.success) {
      return res.status(500).json({
        success: false,
        message: downloaded.message || "Failed to download backup",
      });
    }

    downloadedPath = downloaded.path;

    if (!downloadedPath || !fs.existsSync(downloadedPath)) {
      return res.status(500).json({
        success: false,
        message: "Downloaded backup file not found",
      });
    }

    return res.download(downloadedPath, fileName, (error) => {
      if (error) {
        console.error("❌ Backup download response failed:", error.message);
      }

      cleanupFile(downloadedPath);
    });
  } catch (error) {
    console.error("❌ Download Backup Error:", error.message);

    cleanupFile(downloadedPath);

    if (res.headersSent) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: "Backup download failed",
    });
  }
};

exports.restoreLocalBackupController = async (req, res) => {
  const filePath = req.file?.path || null;

  try {
    const userId = getUserId(req);

    if (!userId) {
      cleanupFile(filePath);

      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: "Backup ZIP file is required",
      });
    }

    if (isRunning(userId)) {
      cleanupFile(filePath);

      return res.status(409).json({
        success: false,
        message: "Another backup or restore is already running",
      });
    }

    const result = await restoreFromLocalBackup(userId, filePath);

    cleanupFile(filePath);

    if (!result.success) {
      const statusCode = result.critical ? 500 : 422;

      return res.status(statusCode).json({
        success: false,
        message: result.message || "Local restore failed",
        rollbackAttempted: Boolean(result.rollbackAttempted),
        rollbackSucceeded: Boolean(result.rollbackSucceeded),
        critical: Boolean(result.critical),
      });
    }

    return res.status(200).json({
      success: true,
      verified: result.verified === true,
      source: result.source || "local-file",
      message: result.message || "Backup restored successfully",
    });
  } catch (error) {
    console.error("❌ Local Restore Controller Error:", error.message);

    cleanupFile(filePath);

    return res.status(500).json({
      success: false,
      message: "Local restore failed",
    });
  }
};

exports.getCloudBackupListController = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const result = await getCloudBackupList(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || "Failed to fetch cloud backups",
      });
    }

    return res.status(200).json({
      success: true,
      files: result.files || [],
    });
  } catch (error) {
    console.error("❌ Cloud List Controller Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cloud backups",
    });
  }
};

exports.getBackupProgressController = (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const progressData = getProgress(userId);

    return res.status(200).json({
      success: true,
      data: progressData,
    });
  } catch (error) {
    console.error("❌ Backup Progress Error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to get backup progress",
    });
  }
};
