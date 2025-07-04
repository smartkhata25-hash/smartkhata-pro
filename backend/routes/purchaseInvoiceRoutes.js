// backend/routes/purchaseInvoiceRoutes.js

const express = require("express");
const router = express.Router();

const {
  addPurchaseInvoice,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
} = require("../controllers/purchaseInvoiceController");

const upload = require("../middleware/uploadMiddleware");
const protect = require("../middleware/authMiddleware");

// ✅ Add Purchase Invoice
router.post("/", protect, upload.single("attachment"), addPurchaseInvoice);

// ✅ Get Purchase Invoice by ID (for Edit)
router.get("/:id", protect, getPurchaseInvoiceById);

// ✅ Update Purchase Invoice
router.put("/:id", protect, upload.single("attachment"), updatePurchaseInvoice);

// ✅ Delete Purchase Invoice
router.delete("/:id", protect, deletePurchaseInvoice);

module.exports = router;
