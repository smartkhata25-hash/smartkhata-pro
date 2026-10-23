// 📁 backend/routes/accountRoutes.js

const express = require("express");
const router = express.Router();
const accountController = require("../controllers/accountController");
const { getAccountsSummary } = require("../controllers/accountController");
const authenticate = require("../middleware/authMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");
const accountPermission = (standardPermission, installmentsPermission) => (req, res, next) => {
  const scope = String(req.query.moduleScope || req.query.scope || req.body?.moduleScope || '').toLowerCase();
  return requirePermission(scope === 'installments' ? installmentsPermission : standardPermission)(req, res, next);
};

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
  accountPermission(PERMISSIONS.ACCOUNTS.CREATE, PERMISSIONS.INSTALLMENTS_ACCOUNTS.CREATE),
  validateAccount,
  accountController.createAccount,
);

router.get(
  "/",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.VIEW, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW),
  accountController.getAccounts,
);

router.post(
  "/transfer",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.TRANSFER),
  accountController.transferBetweenAccounts,
);

router.get(
  "/transfer/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.TRANSFER),
  accountController.getAccountTransfer,
);

router.put(
  "/transfer/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.TRANSFER),
  accountController.updateAccountTransfer,
);

router.post(
  "/adjustment",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.ADJUST),
  accountController.adjustAccountBalance,
);

router.get(
  "/adjustment/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.ADJUST),
  accountController.getAccountAdjustment,
);

router.put(
  "/adjustment/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.ADJUST),
  accountController.updateAccountAdjustment,
);

router.post(
  "/owner-transaction",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.MANAGE),
  accountController.createOwnerTransaction,
);

router.get(
  "/owner-transaction/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.MANAGE),
  accountController.getOwnerTransaction,
);

router.put(
  "/owner-transaction/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.MANAGE),
  accountController.updateOwnerTransaction,
);

router.put(
  "/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.EDIT, PERMISSIONS.INSTALLMENTS_ACCOUNTS.EDIT),
  accountController.updateAccount,
);

router.delete(
  "/:id",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.DELETE, PERMISSIONS.INSTALLMENTS_ACCOUNTS.MANAGE),
  accountController.deleteAccount,
);

router.get(
  "/cash-summary",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.VIEW, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW),
  accountController.getCashSummary,
);

router.get(
  "/bank-summary",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.VIEW, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW),
  accountController.getBankSummary,
);

router.get("/summary", authenticate, accountPermission(PERMISSIONS.ACCOUNTS.VIEW, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW), getAccountsSummary);

router.get(
  "/balance-summary",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.VIEW, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW),
  accountController.getBalanceSnapshot,
);

router.get(
  "/:id/transactions",
  authenticate,
  accountPermission(PERMISSIONS.ACCOUNTS.VIEW_TRANSACTIONS, PERMISSIONS.INSTALLMENTS_ACCOUNTS.VIEW_TRANSACTIONS),
  accountController.getAccountTransactions,
);

module.exports = router;
