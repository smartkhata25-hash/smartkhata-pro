const express = require("express");
const router = express.Router();
const receivePaymentController = require("../controllers/receivePaymentController");
const upload = require("../middleware/upload");
const auth = require("../middleware/authMiddleware"); // ✅ درست کیا گیا

// ✅ Create Receive Payment (with file upload)
router.post(
  "/",
  auth,
  upload.single("attachment"),
  receivePaymentController.createReceivePayment
);

// ✅ Get All Payments
router.get("/", auth, receivePaymentController.getAllReceivePayments);

// ✅ Get by ID
router.get("/:id", auth, receivePaymentController.getReceivePaymentById);

// ✅ Update Payment
router.put(
  "/:id",
  auth,
  upload.single("attachment"),
  receivePaymentController.updateReceivePayment
);

// ✅ Delete Payment
router.delete("/:id", auth, receivePaymentController.deleteReceivePayment);

module.exports = router;
