// 📁 backend/routes/accountRoutes.js

const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");
const { getAccountsSummary } = require("../controllers/accountController");
const authenticate = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

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

router.post(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.ACCOUNTS.CREATE),
  validateAccount,
  accountController.createAccount,
);

router.get(
  "/",
  authenticate,
  requirePermission(
    PERMISSIONS.ACCOUNTS.VIEW,
    PERMISSIONS.ACCOUNTS.VIEW_TRANSACTIONS,
  ),
  accountController.getAccounts,
);

router.put(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.ACCOUNTS.EDIT),
  accountController.updateAccount,
);

router.delete(
  "/:id",
  authenticate,
  requirePermission(PERMISSIONS.ACCOUNTS.DELETE),
  accountController.deleteAccount,
);

router.get(
  "/cash-summary",
  authenticate,
  requirePermission(
    PERMISSIONS.ACCOUNTS.VIEW,
    PERMISSIONS.ACCOUNTS.VIEW_TRANSACTIONS,
  ),
  accountController.getCashSummary,
);

router.get(
  "/bank-summary",
  authenticate,
  requirePermission(
    PERMISSIONS.ACCOUNTS.VIEW,
    PERMISSIONS.ACCOUNTS.VIEW_TRANSACTIONS,
  ),
  accountController.getBankSummary,
);

router.get("/summary", authenticate, getAccountsSummary);

router.get(
  "/balance-summary",
  authenticate,
  accountController.getBalanceSnapshot,
);

router.get(
  "/:id/transactions",
  authenticate,
  requirePermission(PERMISSIONS.ACCOUNTS.VIEW_TRANSACTIONS),
  accountController.getAccountTransactions,
);

module.exports = router;
