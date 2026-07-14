const express = require("express");
const router = express.Router();

const {
  addPurchaseInvoice,
  getAllPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  searchPurchaseInvoices,
  getItemPurchaseHistory,
} = require("../controllers/purchaseInvoiceController");

const upload = require("../middleware/uploadMiddleware");
const protect = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

// Create Purchase Invoice
router.post(
  "/",
  protect,
  requirePermission("purchases.create"),
  upload.array("attachments", 3),
  addPurchaseInvoice,
);

// Item Purchase History
router.get(
  "/item-history/:productId",
  protect,
  requirePermission("purchases.view"),
  getItemPurchaseHistory,
);

// Search Purchase Invoices
router.get(
  "/search",
  protect,
  requirePermission("purchases.view"),
  searchPurchaseInvoices,
);

// Get All Purchase Invoices
router.get(
  "/",
  protect,
  requirePermission("purchases.view"),
  getAllPurchaseInvoices,
);

// Get Purchase Invoice By ID
router.get(
  "/:id",
  protect,
  requirePermission("purchases.view"),
  getPurchaseInvoiceById,
);

// Update Purchase Invoice
router.put(
  "/:id",
  protect,
  requirePermission("purchases.edit"),
  upload.array("attachments", 3),
  updatePurchaseInvoice,
);

// Delete Purchase Invoice
router.delete(
  "/:id",
  protect,
  requirePermission("purchases.delete"),
  deletePurchaseInvoice,
);

module.exports = router;
