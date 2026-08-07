const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const { PERMISSIONS } = require("../utils/permissionList");

const controller = require("../controllers/businessLiabilityController");

const paymentController = require("../controllers/businessLiabilityPaymentController");

// Default Liability Titles
router.get(
  "/titles",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.VIEW),
  controller.getLiabilityTitles,
);

// All Liabilities
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.VIEW),
  controller.getLiabilities,
);

// Single Liability
router.get(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.VIEW),
  controller.getLiabilityById,
);

// Create Liability
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.CREATE),
  controller.createLiability,
);

// Update Liability
router.put(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.EDIT),
  controller.updateLiability,
);

// Restore Liability
router.patch(
  "/:id/restore",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.DELETE),
  controller.restoreLiability,
);

// Delete Liability
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.DELETE),
  controller.deleteLiability,
);

// Pay Liability
router.post(
  "/:liabilityId/payments",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.PAY),
  paymentController.createLiabilityPayment,
);

// Payment History
router.get(
  "/:liabilityId/payments",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.VIEW),
  paymentController.getLiabilityPayments,
);

// Reverse Payment
router.patch(
  "/:liabilityId/payments/:paymentId/reverse",
  authMiddleware,
  requirePermission(PERMISSIONS.BUSINESS_LIABILITIES.PAY),
  paymentController.reverseLiabilityPayment,
);

module.exports = router;
