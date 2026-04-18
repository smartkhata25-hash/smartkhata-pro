const express = require("express");
const router = express.Router();

const protect = require("../middleware/authMiddleware");

const {
  createBackupController,
  restoreBackupController,
  getBackupStatusController,
  downloadBackupController,
  createLocalBackupController,
  restoreLocalBackupController,
  getBackupReminderController,
  getCloudBackupListController,
} = require("../controllers/backupController");

router.get("/status", protect, getBackupStatusController);

router.post("/create", protect, createBackupController);

router.get("/download", protect, downloadBackupController);

router.post("/restore", protect, restoreBackupController);

router.post("/local/create", protect, createLocalBackupController);

router.post("/local/restore", protect, restoreLocalBackupController);

router.get("/reminder", protect, getBackupReminderController);

router.get("/cloud-list", protect, getCloudBackupListController);

module.exports = router;
