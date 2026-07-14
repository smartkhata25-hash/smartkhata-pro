const express = require("express");
const router = express.Router();

const receivePaymentController = require("../controllers/receivePaymentController");

const upload = require("../middleware/uploadMiddleware");
const auth = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

// Create Receive Payment
router.post(
  "/",
  auth,
  requirePermission("receive_payments.create"),
  upload.array("attachments", 3),
  receivePaymentController.createReceivePayment,
);

// Get All Receive Payments
router.get(
  "/",
  auth,
  requirePermission("receive_payments.view"),
  receivePaymentController.getAllReceivePayments,
);

// Get Receive Payment By ID
router.get(
  "/:id",
  auth,
  requirePermission("receive_payments.view"),
  receivePaymentController.getReceivePaymentById,
);

// Update Receive Payment
router.put(
  "/:id",
  auth,
  requirePermission("receive_payments.edit"),
  upload.array("attachments", 3),
  receivePaymentController.updateReceivePayment,
);

// Delete Receive Payment
router.delete(
  "/:id",
  auth,
  requirePermission("receive_payments.delete"),
  receivePaymentController.deleteReceivePayment,
);

module.exports = router;
