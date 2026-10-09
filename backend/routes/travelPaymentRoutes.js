const express = require("express");

const ctrl = require("../controllers/travel/travelPaymentController");
const settlementCtrl = require("../controllers/travel/travelRefundSettlementController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/refunds/outstanding-summary",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.vendors.view", "travel.vendors.manage", "travel.payments"),
  settlementCtrl.getOutstandingSummary,
);

router.get(
  "/customer-refunds",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  settlementCtrl.getOutstandingCustomerRefunds,
);
router.post(
  "/customer-refunds/:refundId",
  requirePermission("travel.bookings.edit", "travel.payments"),
  settlementCtrl.payCustomerRefund,
);
router.get(
  "/customer-refunds/:refundId/history",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  settlementCtrl.getCustomerRefundHistory,
);
router.delete(
  "/customer-refunds/:refundId/:journalId",
  requirePermission("travel.bookings.edit", "travel.payments"),
  settlementCtrl.reverseCustomerRefundPayment,
);

router.get(
  "/vendor-refunds",
  requirePermission("travel.vendors.view", "travel.vendors.manage", "travel.payments"),
  settlementCtrl.getOutstandingVendorRefunds,
);
router.post(
  "/vendor-refunds/:sourceType/:sourceId",
  requirePermission("travel.vendors.manage", "travel.payments"),
  settlementCtrl.receiveVendorRefund,
);
router.get(
  "/vendor-refunds/:sourceType/:sourceId/history",
  requirePermission("travel.vendors.view", "travel.vendors.manage", "travel.payments"),
  settlementCtrl.getVendorRefundHistory,
);
router.delete(
  "/vendor-refunds/:sourceType/:sourceId/:journalId",
  requirePermission("travel.vendors.manage", "travel.payments"),
  settlementCtrl.reverseVendorRefundReceipt,
);

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

router.get(
  "/received/:id",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  ctrl.getTravelReceivePayment,
);

router.put(
  "/received/:id",
  requirePermission("travel.bookings.view", "travel.bookings.edit", "travel.payments"),
  ctrl.createTravelReceivePayment,
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
