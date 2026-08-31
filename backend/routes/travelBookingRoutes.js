const express = require("express");

const ctrl = require("../controllers/travel/travelBookingController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/",
  requirePermission("travel.bookings.view"),
  ctrl.getTravelBookings,
);

router.get(
  "/payment-accounts",
  requirePermission("travel.bookings.view", "travel.payments"),
  ctrl.getTravelPaymentAccounts,
);

router.post(
  "/",
  requirePermission("travel.bookings.create"),
  upload.array("attachments", 3),
  ctrl.createTravelBooking,
);

router.get(
  "/:id",
  requirePermission("travel.bookings.view"),
  ctrl.getTravelBookingById,
);

router.put(
  "/:id",
  requirePermission("travel.bookings.edit"),
  upload.array("attachments", 3),
  ctrl.updateTravelBooking,
);

router.delete(
  "/:id",
  requirePermission("travel.bookings.edit"),
  ctrl.archiveTravelBooking,
);

router.post(
  "/:id/void",
  requirePermission("travel.bookings.edit"),
  ctrl.voidTravelBooking,
);

router.patch(
  "/:id/status",
  requirePermission("travel.bookings.edit"),
  ctrl.updateTravelBookingStatus,
);

router.patch(
  "/:id/cancel",
  requirePermission("travel.bookings.cancel"),
  ctrl.cancelTravelBooking,
);

module.exports = router;
