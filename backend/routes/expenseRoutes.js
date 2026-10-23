const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

const { requireScopedExpensePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");

// ✅ Create Expense
router.post(
  "/",
  protect,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.CREATE, PERMISSIONS.INSTALLMENTS_EXPENSES.CREATE),
  upload.single("attachment"),
  createExpense,
);

// ✅ Get All Expenses
router.get(
  "/",
  protect,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.VIEW, PERMISSIONS.INSTALLMENTS_EXPENSES.VIEW),
  getAllExpenses,
);

// ✅ Get Single Expense
router.get(
  "/:id",
  protect,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.VIEW, PERMISSIONS.INSTALLMENTS_EXPENSES.VIEW),
  getExpenseById,
);

// ✅ Update Expense
router.put(
  "/:id",
  protect,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.EDIT, PERMISSIONS.INSTALLMENTS_EXPENSES.EDIT),
  upload.single("attachment"),
  updateExpense,
);

// ✅ Delete Expense
router.delete(
  "/:id",
  protect,
  requireScopedExpensePermission(PERMISSIONS.EXPENSES.DELETE, PERMISSIONS.INSTALLMENTS_EXPENSES.ARCHIVE),
  deleteExpense,
);

module.exports = router;
