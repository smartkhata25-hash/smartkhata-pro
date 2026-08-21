const express = require("express");

const router = express.Router();

const {
  getCustomerLedger,
  getCustomerBalance,
} = require("../controllers/ledgerController");

const { protect } = require("../middleware/authMiddleware");

router.get("/balance/:accountId", protect, getCustomerBalance);

router.get("/:customerId", protect, getCustomerLedger);

module.exports = router;
