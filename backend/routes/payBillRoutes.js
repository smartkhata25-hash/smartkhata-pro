const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");

const {
  createPayBill,
  getAllPayBills,
  getPayBillById,
  updatePayBill,
  deletePayBill,
} = require("../controllers/payBillController");

// Create Pay Bill
router.post(
  "/",
  protect,
  requirePermission("pay_bills.create"),
  upload.array("attachments", 3),
  createPayBill,
);

// Get All Pay Bills
router.get("/", protect, requirePermission("pay_bills.view"), getAllPayBills);

// Get Pay Bill By ID
router.get(
  "/:id",
  protect,
  requirePermission("pay_bills.view"),
  getPayBillById,
);

// Update Pay Bill
router.put(
  "/:id",
  protect,
  requirePermission("pay_bills.edit"),
  upload.array("attachments", 3),
  updatePayBill,
);

// Delete Pay Bill
router.delete(
  "/:id",
  protect,
  requirePermission("pay_bills.delete"),
  deletePayBill,
);

module.exports = router;
