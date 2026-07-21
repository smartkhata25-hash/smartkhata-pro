const express = require("express");
const router = express.Router();

// 🔒 Auth Middleware
const authMiddleware = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
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
  requirePermission(PERMISSIONS.EXPENSES.VIEW),
  getExpenseTitles,
);

router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES),
  createExpenseTitle,
);

router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES),
  updateExpenseTitle,
);

router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.EXPENSES.MANAGE_TITLES),
  deleteExpenseTitle,
);

module.exports = router;
