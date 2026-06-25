const express = require("express");
const router = express.Router();

const {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  confirmMergeCustomers,
  convertCustomerToParty,

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

router.post("/:id/convert-to-party", protect, convertCustomerToParty);

// 📘 Customer Detailed Ledger (Invoice + Payment + Refund)
router.get("/:id/detailed-ledger", protect, getCustomerDetailedLedger);

module.exports = router;
