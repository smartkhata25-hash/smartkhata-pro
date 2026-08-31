const express = require("express");

const {
  generateTravelBookingPdf,
  generateTravelReceivePaymentReceiptPdf,
  generateTravelRefundPdf,
  generateTravelVendorPaymentReceiptPdf,
  generateTravelVendorReturnPdf,
  previewTravelBookingInvoice,
  previewTravelReceivePaymentReceipt,
  previewTravelRefund,
  previewTravelVendorPaymentReceipt,
  previewTravelVendorReturn,
  printTravelBookingInvoice,
  printTravelReceivePaymentReceipt,
  printTravelRefund,
  printTravelVendorPaymentReceipt,
  printTravelVendorReturn,
} = require("../controllers/travelPrintController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");

const router = express.Router();

router.use(protect, requireModule(MODULE_KEYS.TRAVEL));

router.get(
  "/bookings/:id/preview",
  requirePermission("travel.bookings.view"),
  previewTravelBookingInvoice,
);

router.get(
  "/bookings/:id/print",
  requirePermission("travel.bookings.view"),
  printTravelBookingInvoice,
);

router.get(
  "/bookings/:id/pdf",
  requirePermission("travel.bookings.view"),
  generateTravelBookingPdf,
);

router.get(
  "/payments/received/:id/preview",
  requirePermission("travel.bookings.view", "travel.payments"),
  previewTravelReceivePaymentReceipt,
);

router.get(
  "/payments/received/:id/print",
  requirePermission("travel.bookings.view", "travel.payments"),
  printTravelReceivePaymentReceipt,
);

router.get(
  "/payments/received/:id/pdf",
  requirePermission("travel.bookings.view", "travel.payments"),
  generateTravelReceivePaymentReceiptPdf,
);

router.get(
  "/payments/vendors/:id/preview",
  requirePermission("travel.vendors.view", "travel.payments"),
  previewTravelVendorPaymentReceipt,
);

router.get(
  "/payments/vendors/:id/print",
  requirePermission("travel.vendors.view", "travel.payments"),
  printTravelVendorPaymentReceipt,
);

router.get(
  "/payments/vendors/:id/pdf",
  requirePermission("travel.vendors.view", "travel.payments"),
  generateTravelVendorPaymentReceiptPdf,
);

router.get(
  "/refunds/:id/preview",
  requirePermission("travel.bookings.view"),
  previewTravelRefund,
);

router.get(
  "/refunds/:id/print",
  requirePermission("travel.bookings.view"),
  printTravelRefund,
);

router.get(
  "/refunds/:id/pdf",
  requirePermission("travel.bookings.view"),
  generateTravelRefundPdf,
);

router.get(
  "/vendor-returns/:id/preview",
  requirePermission("travel.vendors.view"),
  previewTravelVendorReturn,
);

router.get(
  "/vendor-returns/:id/print",
  requirePermission("travel.vendors.view"),
  printTravelVendorReturn,
);

router.get(
  "/vendor-returns/:id/pdf",
  requirePermission("travel.vendors.view"),
  generateTravelVendorReturnPdf,
);

module.exports = router;
