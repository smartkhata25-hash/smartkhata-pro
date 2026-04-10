const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

const {
  sendNotification,
  getMyNotifications,
  markAsSeen,
} = require("../controllers/notificationController");

/* ================= ADMIN SEND ================= */
router.post("/send", protect, sendNotification);

/* ================= USER GET ================= */
router.get("/my", protect, getMyNotifications);

/* ================= MARK SEEN ================= */
router.put("/seen", protect, markAsSeen);

module.exports = router;
