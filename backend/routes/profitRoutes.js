const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const {
  getProfitSummaryController,
  getExpenseBreakdown,
  getCogsBreakdown,
  getSalesBreakdown,
  getProductProfitability,
} = require("../controllers/profitController");

router.get("/summary", authMiddleware, getProfitSummaryController);

router.get("/expense-breakdown", authMiddleware, getExpenseBreakdown);

router.get("/cogs-breakdown", authMiddleware, getCogsBreakdown);

// SALES BREAKDOWN

router.get("/sales-breakdown", authMiddleware, getSalesBreakdown);

// PRODUCT PROFITABILITY

router.get("/product-profitability", authMiddleware, getProductProfitability);

module.exports = router;
