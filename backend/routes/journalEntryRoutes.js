const express = require("express");
const router = express.Router();
const journalEntryController = require("../controllers/journalEntryController");
const incomeStatementController = require("../controllers/incomeStatementController");
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ Create Entry
router.post("/", authMiddleware, journalEntryController.createEntry);

// ✅ Get All Entries
router.get("/", authMiddleware, journalEntryController.getEntries);

// ✅ Update Entry
router.put("/:id", authMiddleware, journalEntryController.updateEntry);

// ✅ Delete Entry
router.delete("/:id", authMiddleware, journalEntryController.deleteEntry);

// ✅ Trial Balance Route
router.get(
  "/trial-balance",
  authMiddleware,
  journalEntryController.getTrialBalance
);

// ✅ General Ledger Route
router.get(
  "/ledger/:accountId",
  authMiddleware,
  journalEntryController.getLedgerByAccount
);

// ✅ Income Statement Route
router.get(
  "/income-statement",
  authMiddleware,
  incomeStatementController.getIncomeStatement
);

// ✅ Dashboard Summary Route
router.get(
  "/dashboard-summary",
  authMiddleware,
  dashboardController.getDashboardSummary
);

// ✅ Monthly Sales Route
router.get(
  "/dashboard-monthly-sales",
  authMiddleware,
  dashboardController.getMonthlySales
);

// ✅ Cash Flow Chart Route (corrected to Journal Controller)
router.get(
  "/dashboard-monthly-cashflow",
  authMiddleware,
  journalEntryController.getMonthlyCashFlow
);

module.exports = router;
