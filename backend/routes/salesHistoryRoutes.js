const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const {
  getSalesHistoryByCustomerProduct,
} = require("../controllers/salesHistoryController");

// 🔍 Customer + Product sales history
router.get("/sales-history", protect, getSalesHistoryByCustomerProduct);

module.exports = router;
