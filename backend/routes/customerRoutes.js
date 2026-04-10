const express = require("express");
const router = express.Router();

const {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  confirmMergeCustomers,
  getCustomerLedger,
  getCustomerDetailedLedger,
} = require("../controllers/customerController");

const { protect } = require("../middleware/authMiddleware");

// ✅ GET all customers
router.get("/", protect, getCustomers);

// ✅ POST add new customer
router.post("/", protect, addCustomer);

// ✅ PUT update customer
router.put("/:id", protect, updateCustomer);

// ✅ DELETE customer
router.delete("/:id", protect, deleteCustomer);

// ✅ CONFIRM MERGE
router.post("/merge/confirm", protect, confirmMergeCustomers);

// 📒 Customer Ledger
router.get("/:id/ledger", protect, getCustomerLedger);

// 📘 Customer Detailed Ledger (Invoice + Payment + Refund)
router.get("/:id/detailed-ledger", protect, getCustomerDetailedLedger);

module.exports = router;
