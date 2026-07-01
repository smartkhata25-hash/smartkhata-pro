const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");

const {
  createRefundInvoice,
  getRefundById,
  updateRefundInvoice,
  getAllRefunds,
  deleteRefundInvoice,
} = require("../controllers/refundInvoiceController");

const { protect } = require("../middleware/authMiddleware");

// ✅ Create Refund (with optional file)
router.post("/", protect, upload.array("attachments", 3), createRefundInvoice);

// ✅ Get All Refunds
router.get("/", protect, getAllRefunds);

// ✅ Get Refund by ID
router.get("/:id", protect, getRefundById);

router.put(
  "/:id",
  protect,
  upload.array("attachments", 3),
  updateRefundInvoice,
);

// ✅ DELETE route add کریں
router.delete("/:id", protect, deleteRefundInvoice);

module.exports = router;
