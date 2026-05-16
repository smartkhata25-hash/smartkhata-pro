const express = require("express");
const router = express.Router();

const { getCustomerLedger } = require("../controllers/ledgerController");
const { protect } = require("../middleware/authMiddleware");

console.log("✅ NEW ACCOUNT LEDGER ROUTE LOADED");

router.get("/:customerId", protect, getCustomerLedger);

module.exports = router;
