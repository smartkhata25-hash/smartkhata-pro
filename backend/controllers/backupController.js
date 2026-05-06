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

// CREATE BACKUP

exports.createBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }
    if (isRunning(userId)) {
      return res.status(400).json({
        success: false,
        message: "Another backup/restore already running",
      });
    }
    const result = await createBackup(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: "Backup created successfully",
      file: path.basename(result.path),
    });
  } catch (error) {
    console.error("❌ Backup Error:", error);

    return res.status(500).json({
      success: false,
      message: "Backup failed",
    });
  }
};

/* ======================================================
   RESTORE BACKUP
====================================================== */

exports.restoreBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const { fileName } = req.body;

    if (isRunning(userId)) {
      return res.status(400).json({
        success: false,
        message: "Another backup/restore already running",
      });
    }
    const result = await restoreBackup(userId, fileName);
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: "Backup restored successfully",
    });
  } catch (error) {
    console.error("❌ Restore Error:", error);

    return res.status(500).json({
      success: false,
      message: "Restore failed",
    });
  }
};

/* ======================================================
   BACKUP STATUS
====================================================== */

exports.getBackupStatusController = (req, res) => {
  try {
    const status = getBackupStatus();

    return res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error("❌ Backup Status Error:", error);

    return res.status(500).json({
      success: false,
      message: "Could not get backup status",
    });
  }
};

/* ======================================================
   DOWNLOAD LATEST BACKUP
====================================================== */

exports.downloadBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const result = await getCloudBackupList(userId);

    if (!result.success || !result.files.length) {
      return res.status(404).json({
        success: false,
        message: "No cloud backups found",
      });
    }

    // latest backup
    const latestBackup = result.files[0];

    const downloaded = await downloadBackupFromCloud(userId, latestBackup.name);

    if (!downloaded.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to download backup from cloud",
      });
    }

    return res.download(downloaded.path, latestBackup.name, (err) => {
      if (err) {
        console.error("❌ Download error:", err);
      }

      // cleanup temp file after download
      try {
        if (fs.existsSync(downloaded.path)) {
          fs.unlinkSync(downloaded.path);
        }
      } catch (cleanupError) {
        console.error("❌ Cleanup error:", cleanupError);
      }
    });
  } catch (error) {
    console.error("❌ Download Backup Error:", error);

    return res.status(500).json({
      success: false,
      message: "Backup download failed",
    });
  }
};

/* ======================================================
   RESTORE FROM LOCAL FILE
====================================================== */

exports.restoreLocalBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const filePath = req.file?.path;

    if (!userId) {
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
      return res.status(400).json({
        success: false,
        message: "Another backup/restore already running",
      });
    }
    const result = await restoreFromLocalBackup(userId, filePath);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    // cleanup uploaded ZIP after successful restore
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (cleanupError) {
      console.error("❌ Uploaded ZIP cleanup failed:", cleanupError);
    }

    return res.json({
      success: true,
      message: "Backup restored successfully",
    });
  } catch (error) {
    console.error("❌ Local Restore Controller Error:", error);

    // cleanup uploaded ZIP if restore failed
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch (cleanupError) {
      console.error("❌ Failed ZIP cleanup:", cleanupError);
    }

    return res.status(500).json({
      success: false,
      message: "Local restore failed",
    });
  }
};

exports.getCloudBackupListController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const result = await getCloudBackupList(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      files: result.files,
    });
  } catch (error) {
    console.error("❌ Cloud list controller error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cloud backups",
    });
  }
};

/* ======================================================
   GET BACKUP/RESTORE PROGRESS
====================================================== */

exports.getBackupProgressController = (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const progressData = getProgress(userId);

    return res.json({
      success: true,
      data: progressData,
    });
  } catch (error) {
    console.error("❌ Progress Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to get progress",
    });
  }
};
