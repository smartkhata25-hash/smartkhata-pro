const express = require("express");

const router = express.Router();

const protect = require("../middleware/authMiddleware");
const uploadBackup = require("../middleware/backupUploadMiddleware");

const {
  requirePermission,
  ownerOnly,
} = require("../middleware/permissionMiddleware");

const {
  createBackupController,
  restoreBackupController,
  getBackupStatusController,
  downloadBackupController,
  restoreLocalBackupController,
  getCloudBackupListController,
  getBackupProgressController,
} = require("../controllers/backupController");

router.get(
  "/status",
  protect,
  requirePermission("settings.backup"),
  getBackupStatusController,
);

router.post(
  "/create",
  protect,
  requirePermission("settings.backup"),
  createBackupController,
);

router.get("/download", protect, ownerOnly, downloadBackupController);

router.post("/restore", protect, ownerOnly, restoreBackupController);

router.post(
  "/local/restore",
  protect,
  ownerOnly,
  uploadBackup.single("backup"),
  restoreLocalBackupController,
);

router.get(
  "/cloud-list",
  protect,
  requirePermission("settings.backup"),
  getCloudBackupListController,
);

router.get(
  "/progress",
  protect,
  requirePermission("settings.backup"),
  getBackupProgressController,
);

module.exports = router;
