const express = require("express");

const { getTravelDashboardSummary } = require("../controllers/travel/travelBookingController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.get(
  "/travel/dashboard-summary",
  protect,
  requireModule(MODULE_KEYS.TRAVEL),
  requirePermission("travel.view", "travel.bookings.view"),
  getTravelDashboardSummary,
);

module.exports = router;
