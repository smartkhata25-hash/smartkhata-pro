const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const loanController = require("../controllers/businessReceivableLoanController");

const paymentController = require("../controllers/businessReceivableLoanPaymentController");

// All receivable loans
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.VIEW),
  loanController.getReceivableLoans,
);

// Create receivable loan
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.CREATE),
  loanController.createReceivableLoan,
);

// Single receivable loan
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.VIEW),
  loanController.getReceivableLoanById,
);

// Update receivable loan
router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.EDIT),
  loanController.updateReceivableLoan,
);

// Delete receivable loan
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.DELETE),
  loanController.deleteReceivableLoan,
);

// Receive repayment
router.post(
  "/:loanId/payments",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.RECEIVE),
  paymentController.createReceivableLoanPayment,
);

// Repayment history
router.get(
  "/:loanId/payments",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.VIEW),
  paymentController.getReceivableLoanPayments,
);

// Reverse repayment
router.patch(
  "/:loanId/payments/:paymentId/reverse",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_RECEIVABLE_LOANS.RECEIVE),
  paymentController.reverseReceivableLoanPayment,
);

module.exports = router;
