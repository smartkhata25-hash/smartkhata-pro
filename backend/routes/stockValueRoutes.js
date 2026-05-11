const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const stockValueController = require("../controllers/stockValueController");

/* =========================================================
   📦 STOCK VALUE REPORT
========================================================= */

router.get(
  "/stock-value-report",
  authMiddleware,
  stockValueController.getStockValueReport,
);

module.exports = router;
