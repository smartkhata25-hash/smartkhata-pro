const express = require("express");
const router = express.Router();
const { getProductLedger } = require("../controllers/productLedgerController");
const { protect } = require("../middleware/authMiddleware"); // ✅ درست طریقہ

router.get("/:productId", protect, getProductLedger);

module.exports = router;
