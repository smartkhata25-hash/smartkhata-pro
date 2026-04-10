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
} = require("../controllers/backupController");

/* ======================================================
   BACKUP STATUS
====================================================== */
router.get("/status", protect, getBackupStatusController);

/* ======================================================
   CREATE BACKUP
====================================================== */
router.post("/create", protect, createBackupController);

/* ======================================================
   DOWNLOAD BACKUP
====================================================== */
router.get("/download", protect, downloadBackupController);

/* ======================================================
   RESTORE BACKUP
====================================================== */
router.post("/restore", protect, restoreBackupController);

/* ======================================================
   LOCAL BACKUP (PRO)
====================================================== */
router.post("/local/create", protect, createLocalBackupController);

/* ======================================================
   LOCAL RESTORE (PRO)
====================================================== */
router.post("/local/restore", protect, restoreLocalBackupController);

/* ======================================================
   BACKUP REMINDER
====================================================== */
router.get("/reminder", protect, getBackupReminderController);

module.exports = router;
