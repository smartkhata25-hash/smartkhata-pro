const express = require("express");
const router = express.Router();

// 🔒 Auth Middleware
const authMiddleware = require("../middleware/authMiddleware");
const { requireScopedExpensePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

const {
  getExpenseTitles,
  createExpenseTitle,
  updateExpenseTitle,
  deleteExpenseTitle,
} = require("../controllers/expenseTitleController");

router.get(
  "/",
  authMiddleware,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.VIEW, PERMISSIONS.INSTALLMENTS_EXPENSES.VIEW),
  getExpenseTitles,
);

router.post(
  "/",
  authMiddleware,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES, PERMISSIONS.INSTALLMENTS_EXPENSES.MANAGE_TITLES),
  createExpenseTitle,
);

router.put(
  "/:id",
  authMiddleware,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES, PERMISSIONS.INSTALLMENTS_EXPENSES.MANAGE_TITLES),
  updateExpenseTitle,
);

router.delete(
  "/:id",
  authMiddleware,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES, PERMISSIONS.INSTALLMENTS_EXPENSES.MANAGE_TITLES),
  deleteExpenseTitle,
);

module.exports = router;
