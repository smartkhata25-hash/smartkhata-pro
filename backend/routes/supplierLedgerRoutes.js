const express = require("express");
const router = express.Router();
const {
  getSupplierLedger,
  deleteLedgerEntry,
} = require("../controllers/supplierLedgerController");
const protect = require("../middleware/authMiddleware");

router.use(protect);

// ✅ GET /api/supplier-ledger/:id
router.get("/:id", getSupplierLedger);

// ✅ DELETE /api/supplier-ledger/entry/:entryId
router.delete("/entry/:entryId", deleteLedgerEntry);

module.exports = router;
