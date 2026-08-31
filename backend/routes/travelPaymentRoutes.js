const express = require("express");

const ctrl = require("../controllers/travel/travelPaymentController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/received",
  requirePermission("travel.bookings.view", "travel.payments"),
  ctrl.getTravelReceivePayments,
);

router.get(
  "/vendors",
  requirePermission("travel.vendors.view", "travel.payments"),
  ctrl.getTravelVendorPayments,
);

router.post(
  "/receive",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  ctrl.createTravelReceivePayment,
);

router.delete(
  "/received/:id",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  ctrl.reverseTravelReceivePayment,
);

router.post(
  "/vendor",
  requirePermission("travel.vendors.view", "travel.vendors.manage", "travel.payments"),
  ctrl.createTravelVendorPayment,
);

router.delete(
  "/vendors/:id",
  requirePermission("travel.vendors.view", "travel.vendors.manage", "travel.payments"),
  ctrl.reverseTravelVendorPayment,
);

module.exports = router;
