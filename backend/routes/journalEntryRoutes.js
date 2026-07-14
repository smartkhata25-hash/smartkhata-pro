const express = require("express");
const router = express.Router();

const journalEntryController = require("../controllers/journalEntryController");
const incomeStatementController = require("../controllers/incomeStatementController");
const dashboardController = require("../controllers/dashboardController");

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

// ✅ Create Entry
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.JOURNAL.CREATE),
  journalEntryController.createEntry,
);

// ✅ Get All Entries
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.JOURNAL.VIEW),
  journalEntryController.getEntries,
);

// ✅ Update Entry
router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.JOURNAL.EDIT),
  journalEntryController.updateEntry,
);

// ✅ Delete Entry
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.JOURNAL.DELETE),
  journalEntryController.deleteEntry,
);

// ✅ Trial Balance Route
router.get(
  "/trial-balance",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.TRIAL_BALANCE),
  journalEntryController.getTrialBalance,
);

// ✅ General Ledger Route
router.get(
  "/ledger/:accountId",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.GENERAL_LEDGER),
  journalEntryController.getLedgerByAccount,
);

// ✅ Income Statement Route
router.get(
  "/income-statement",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.INCOME_STATEMENT),
  incomeStatementController.getIncomeStatement,
);

// ✅ Month vs Month Income Statement Route
router.get(
  "/income-statement/month-vs-month",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.INCOME_STATEMENT),
  incomeStatementController.getMonthVsMonthIncome,
);

// ✅ Dashboard Summary Route
router.get(
  "/dashboard-summary",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.DASHBOARD),
  dashboardController.getDashboardSummary,
);

// ✅ Monthly Sales Route
router.get(
  "/dashboard-monthly-sales",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.MONTHLY_SALES),
  dashboardController.getMonthlySales,
);

// ✅ Cash Flow Chart Route
router.get(
  "/dashboard-monthly-cashflow",
  authMiddleware,
  requirePermission(PERMISSIONS.REPORTS.CASH_FLOW),
  journalEntryController.getMonthlyCashFlow,
);

module.exports = router;
