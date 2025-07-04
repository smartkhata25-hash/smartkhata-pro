const express = require("express");
const router = express.Router();
const {
  getSupplierLedger,
  deleteLedgerEntry, // ✅ نیا کنٹرولر import
} = require("../controllers/supplierLedgerController");
const protect = require("../middleware/authMiddleware");

// ✅ تمام routes کو پروٹیکٹ کیا جائے گا
router.use(protect);

// ✅ GET /api/supplier-ledger/:id
router.get("/:id", getSupplierLedger);

// ✅ DELETE /api/supplier-ledger/entry/:entryId
router.delete("/entry/:entryId", deleteLedgerEntry);

// 🔒 Future-ready: یہاں POST, EXPORT, FILTER وغیرہ بھی add ہو سکتے ہیں

module.exports = router;
