const express = require("express");

const ctrl = require("../controllers/travel/travelRefundController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const upload = require("../middleware/uploadMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/refundable-invoices",
  requirePermission("travel.bookings.view"),
  ctrl.getRefundableTravelInvoices,
);

router.get(
  "/",
  requirePermission("travel.bookings.view"),
  ctrl.getTravelRefunds,
);

router.post(
  "/",
  requirePermission("travel.bookings.edit"),
  upload.array("attachments", 3),
  ctrl.createTravelRefund,
);

router.get(
  "/:id",
  requirePermission("travel.bookings.view"),
  ctrl.getTravelRefundById,
);

router.delete(
  "/:id",
  requirePermission("travel.bookings.edit"),
  ctrl.reverseTravelRefund,
);

module.exports = router;
