const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");
const uploadBackup = require("../middleware/backupUploadMiddleware");

const {
  createBackupController,
  restoreBackupController,
  getBackupStatusController,
  downloadBackupController,
  restoreLocalBackupController,
  getCloudBackupListController,
  getBackupProgressController,
} = require("../controllers/backupController");

router.get("/status", protect, getBackupStatusController);

router.post("/create", protect, createBackupController);

router.get("/download", protect, downloadBackupController);

router.post("/restore", protect, restoreBackupController);

router.post(
  "/local/restore",
  protect,
  uploadBackup.single("backup"),
  restoreLocalBackupController,
);

router.get("/cloud-list", protect, getCloudBackupListController);

router.get("/progress", protect, getBackupProgressController);

module.exports = router;
