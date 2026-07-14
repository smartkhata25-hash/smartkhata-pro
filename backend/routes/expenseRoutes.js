const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");
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
  requirePermission(PERMISSIONS.EXPENSES.CREATE),
  upload.single("attachment"),
  createExpense,
);

// ✅ Get All Expenses
router.get(
  "/",
  protect,
  requirePermission(PERMISSIONS.EXPENSES.VIEW),
  getAllExpenses,
);

// ✅ Get Single Expense
router.get(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.EXPENSES.VIEW),
  getExpenseById,
);

// ✅ Update Expense
router.put(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.EXPENSES.EDIT),
  upload.single("attachment"),
  updateExpense,
);

// ✅ Delete Expense
router.delete(
  "/:id",
  protect,
  requirePermission(PERMISSIONS.EXPENSES.DELETE),
  deleteExpense,
);

module.exports = router;
