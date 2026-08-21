const express = require("express");
const router = express.Router();

const invoiceController = require("../controllers/invoiceController");
const {
  getInvoiceFormOptions,
} = require("../controllers/invoiceFormOptionsController");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

// View routes
router.get(
  "/by-bill/:billNo",
  protect,
  requirePermission(PERMISSIONS.SALES.VIEW),
  invoiceController.getInvoiceByBillNo,
);

router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.SALES.VIEW),
  invoiceController.getInvoices,
);

router.get(
  "/search",
  protect,
  requirePermission(PERMISSIONS.SALES.VIEW),
  invoiceController.searchInvoices,
);

router.get(
  "/last-bill-no",
  protect,
  requirePermission(PERMISSIONS.SALES.CREATE),
  invoiceController.getLastInvoiceNo,
);

router.get(
  "/navigate",
  protect,
  requirePermission(PERMISSIONS.SALES.VIEW),
  invoiceController.navigateInvoice,
);

router.get(
  "/form-options",
  protect,
  requirePermission(
    PERMISSIONS.SALES.VIEW,
    PERMISSIONS.SALES.CREATE,
    PERMISSIONS.SALES.EDIT,
  ),
  getInvoiceFormOptions,
);

router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.SALES.VIEW),
  invoiceController.getInvoiceById,
);

// Create invoice
router.post(
  "/",
  protect,
  requirePermission(PERMISSIONS.SALES.CREATE),
  upload.array("attachments", 3),
  invoiceController.createInvoice,
);

// Additional payment
router.put(
  "/:id/payment",
  protect,
  requirePermission(PERMISSIONS.SALES.RECEIVE_PAYMENT),
  invoiceController.recordPayment,
);

// Edit invoice
router.put(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.SALES.EDIT),
  upload.array("attachments", 3),
  invoiceController.updateInvoice,
);

// Delete invoice
router.delete(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.SALES.DELETE),
  invoiceController.deleteInvoice,
);

module.exports = router;
