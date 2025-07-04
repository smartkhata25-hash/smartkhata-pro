// 📁 backend/routes/accountRoutes.js

const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");
const authenticate = require("../middleware/authMiddleware");

// 🔍 OPTIONAL Middleware for validation (you can extend this)
const validateAccount = (req, res, next) => {
  const forbiddenNames = ["capital", "opening balance", "retained earnings"];
  if (forbiddenNames.includes(req.body.name?.toLowerCase())) {
    return res
      .status(400)
      .json({ message: "This account name is restricted." });
  }
  next();
};

// ✅ Create a new Account (with optional validation)
router.post(
  "/",
  authenticate,
  validateAccount,
  accountController.createAccount
);

// ✅ Get all accounts for logged-in user
router.get("/", authenticate, accountController.getAccounts);

// ✅ Update an account
router.put("/:id", authenticate, accountController.updateAccount);

// ✅ Delete an account (controller will handle journal reference check)
router.delete("/:id", authenticate, accountController.deleteAccount);

// ✅ Cash Summary Route
router.get("/cash-summary", authenticate, accountController.getCashSummary);

// ✅ Bank Summary Route
router.get("/bank-summary", authenticate, accountController.getBankSummary);

// ✅ NEW: Overall Balance Snapshot (Optional but useful for Dashboard)
router.get(
  "/balance-summary",
  authenticate,
  accountController.getBalanceSnapshot
); // 🆕

/**
 * Note: This must come AFTER all other `/:id/...` routes
 * to avoid conflict with dynamic :id param
 */
router.get(
  "/:id/transactions",
  authenticate,
  accountController.getAccountTransactions
);

module.exports = router;
