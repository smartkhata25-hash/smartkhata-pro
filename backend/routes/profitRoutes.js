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

/* ======================================================
   ✅ PROFIT SUMMARY
====================================================== */

router.get("/summary", authMiddleware, getProfitSummaryController);

/* ======================================================
   ✅ EXPENSE BREAKDOWN
====================================================== */

router.get("/expense-breakdown", authMiddleware, getExpenseBreakdown);

/* ======================================================
   ✅ COGS BREAKDOWN
====================================================== */

router.get("/cogs-breakdown", authMiddleware, getCogsBreakdown);

/* ======================================================
   ✅ SALES BREAKDOWN
====================================================== */

router.get("/sales-breakdown", authMiddleware, getSalesBreakdown);

/* ======================================================
   ✅ PRODUCT PROFITABILITY
====================================================== */

router.get("/product-profitability", authMiddleware, getProductProfitability);

module.exports = router;
