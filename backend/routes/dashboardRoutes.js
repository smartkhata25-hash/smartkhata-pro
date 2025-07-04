const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Summary API
router.get(
  "/dashboard-summary",
  authMiddleware,
  dashboardController.getDashboardSummary
);

// ✅ Monthly Sales Chart
router.get(
  "/dashboard-monthly-sales",
  authMiddleware,
  dashboardController.getMonthlySales
);

// ✅ Monthly Cash Flow
router.get(
  "/dashboard-monthly-cashflow",
  authMiddleware,
  dashboardController.getMonthlyCashFlow
);

module.exports = router;
