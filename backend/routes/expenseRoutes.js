const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

const {
  createExpense,
  getAllExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
} = require("../controllers/expenseController");

// ✅ Create Expense with attachment
router.post("/", protect, upload.single("attachment"), createExpense);

// ✅ Get all Expenses
router.get("/", protect, getAllExpenses);

// ✅ Get single Expense by ID
router.get("/:id", protect, getExpenseById);

// ✅ Update Expense
router.put("/:id", protect, upload.single("attachment"), updateExpense);

// ✅ Delete Expense
router.delete("/:id", protect, deleteExpense);

module.exports = router;
