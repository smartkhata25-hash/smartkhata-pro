const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadMiddleware");
const { protect } = require("../middleware/authMiddleware");

const {
  createPayBill,
  getAllPayBills,
  getPayBillById,
  updatePayBill,
  deletePayBill,
} = require("../controllers/payBillController");

// ✅ Secure routes with protect
router.post("/", protect, upload.array("attachments", 3), createPayBill);
router.get("/", protect, getAllPayBills);
router.get("/:id", protect, getPayBillById);
router.put("/:id", protect, upload.array("attachments", 3), updatePayBill);
router.delete("/:id", protect, deletePayBill);

module.exports = router;
