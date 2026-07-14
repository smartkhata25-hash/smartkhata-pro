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

const { requirePermission } = require("../middleware/permissionMiddleware");

// ✅ Create Refund
router.post(
  "/",
  protect,
  requirePermission("refunds.create"),
  upload.array("attachments", 3),
  createRefundInvoice,
);

// ✅ Get All Refunds
router.get("/", protect, requirePermission("refunds.view"), getAllRefunds);

// ✅ Get Refund by ID
router.get("/:id", protect, requirePermission("refunds.view"), getRefundById);

// ✅ Update Refund
router.put(
  "/:id",
  protect,
  requirePermission("refunds.edit"),
  upload.array("attachments", 3),
  updateRefundInvoice,
);

// ✅ Delete Refund
router.delete(
  "/:id",
  protect,
  requirePermission("refunds.delete"),
  deleteRefundInvoice,
);

module.exports = router;
