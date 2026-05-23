const express = require("express");
const router = express.Router();

const { getCustomerLedger } = require("../controllers/ledgerController");
const { protect } = require("../middleware/authMiddleware");

router.get("/:customerId", protect, getCustomerLedger);

module.exports = router;
