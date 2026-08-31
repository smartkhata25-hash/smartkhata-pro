const express = require("express");

const ctrl = require("../controllers/travel/travelReminderController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/summary",
  requirePermission("travel.view", "travel.bookings.view"),
  ctrl.getTravelReminderSummary,
);

router.get(
  "/settings",
  requirePermission(
    "travel.view",
    "travel.bookings.view",
    "travel.bookings.create",
    "travel.bookings.edit",
    "travel.settings",
  ),
  ctrl.getTravelReminderSettings,
);

router.put(
  "/settings",
  requirePermission("travel.settings"),
  ctrl.updateTravelReminderSettings,
);

router.get(
  "/booking/:bookingId",
  requirePermission("travel.view", "travel.bookings.view", "travel.bookings.edit"),
  ctrl.getTravelBookingReminders,
);

router.get(
  "/",
  requirePermission("travel.view", "travel.bookings.view"),
  ctrl.getTravelReminders,
);

router.get(
  "/:id/whatsapp-message",
  requirePermission("travel.view", "travel.bookings.view"),
  ctrl.getTravelReminderWhatsAppMessage,
);

router.post(
  "/:id/send-email",
  requirePermission("travel.bookings.edit", "travel.payments"),
  ctrl.sendTravelReminderEmail,
);

router.patch(
  "/:id/read",
  requirePermission("travel.view", "travel.bookings.view"),
  ctrl.markTravelReminderRead,
);

router.patch(
  "/booking/:bookingId/cancel",
  requirePermission("travel.bookings.edit"),
  ctrl.cancelTravelBookingReminders,
);

module.exports = router;
