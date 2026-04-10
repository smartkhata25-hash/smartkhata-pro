// backend/routes/purchaseInvoiceRoutes.js

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

/* =====================================================
   ✅ CREATE PURCHASE INVOICE
===================================================== */
router.post("/", protect, upload.single("attachment"), addPurchaseInvoice);

router.get("/item-history/:productId", protect, getItemPurchaseHistory);

/* =====================================================
   ✅ SEARCH PURCHASE INVOICES  (⚠️ MUST BE BEFORE /:id)
===================================================== */
router.get("/search", protect, searchPurchaseInvoices);

/* =====================================================
   ✅ GET ALL PURCHASE INVOICES
===================================================== */
router.get("/", protect, getAllPurchaseInvoices);

/* =====================================================
   ✅ GET PURCHASE INVOICE BY ID
===================================================== */
router.get("/:id", protect, getPurchaseInvoiceById);

/* =====================================================
   ✅ UPDATE PURCHASE INVOICE
===================================================== */
router.put("/:id", protect, upload.single("attachment"), updatePurchaseInvoice);

/* =====================================================
   ✅ DELETE PURCHASE INVOICE
===================================================== */
router.delete("/:id", protect, deletePurchaseInvoice);

module.exports = router;
