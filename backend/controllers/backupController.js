const path = require("path");
const fs = require("fs");

const { createBackup, getBackupStatus } = require("../services/backupService");
const { restoreBackup } = require("../services/restoreService");
const {
  createLocalBackup,
} = require("../services/localBackup/localBackupService");
const {
  restoreFromLocalBackup,
} = require("../services/localBackup/localRestoreService");
const {
  shouldShowBackupReminder,
} = require("../services/localBackup/backupReminderService");

/* ======================================================
   BACKUP DIRECTORY
====================================================== */

const BACKUP_DIR = path.join(__dirname, "../backups");

/* ======================================================
   CREATE BACKUP
====================================================== */

exports.createBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
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

    const result = await restoreBackup(userId);

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

exports.downloadBackupController = (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.status(404).json({
        success: false,
        message: "No backups found",
      });
    }

    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".zip"))
      .map((file) => {
        const filePath = path.join(BACKUP_DIR, file);
        const stats = fs.statSync(filePath);

        return {
          file,
          path: filePath,
          created: stats.mtime,
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created));

    if (files.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Backup file not found",
      });
    }

    const latestBackup = files[0];

    res.download(latestBackup.path, latestBackup.file, (err) => {
      if (err) {
        console.error("Download error:", err);
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
   CREATE LOCAL BACKUP
====================================================== */

exports.createLocalBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    const result = await createLocalBackup(userId);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: "Local backup created",
      path: result.path,
    });
  } catch (error) {
    console.error("❌ Local Backup Controller Error:", error);

    return res.status(500).json({
      success: false,
      message: "Local backup failed",
    });
  }
};

/* ======================================================
   RESTORE FROM LOCAL FILE
====================================================== */

exports.restoreLocalBackupController = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { filePath } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
    }

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: "File path is required",
      });
    }

    const result = await restoreFromLocalBackup(userId, filePath);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: "Local backup restored successfully",
    });
  } catch (error) {
    console.error("❌ Local Restore Controller Error:", error);

    return res.status(500).json({
      success: false,
      message: "Local restore failed",
    });
  }
};

/* ======================================================
   BACKUP REMINDER STATUS
====================================================== */

exports.getBackupReminderController = (req, res) => {
  try {
    const shouldRemind = shouldShowBackupReminder();

    return res.json({
      success: true,
      remind: shouldRemind,
    });
  } catch (error) {
    console.error("❌ Reminder Error:", error);

    return res.status(500).json({
      success: false,
      message: "Reminder check failed",
    });
  }
};
