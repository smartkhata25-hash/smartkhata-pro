const express = require("express");
const router = express.Router();

// 🔒 Auth Middleware
const authMiddleware = require("../middleware/authMiddleware");

const {
  getExpenseTitles,
  createExpenseTitle,
  updateExpenseTitle,
  deleteExpenseTitle,
} = require("../controllers/expenseTitleController");

router.get("/", authMiddleware, getExpenseTitles);

router.post("/", authMiddleware, createExpenseTitle);

router.put("/:id", authMiddleware, updateExpenseTitle);

router.delete("/:id", authMiddleware, deleteExpenseTitle);

module.exports = router;
