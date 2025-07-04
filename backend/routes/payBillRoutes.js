const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const { protect } = require("../middleware/authMiddleware");

const {
  createPayBill,
  getAllPayBills,
  getPayBillById,
  updatePayBill,
  deletePayBill,
} = require("../controllers/payBillController");

// ✅ Secure routes with protect
router.post("/", protect, upload.single("attachment"), createPayBill);
router.get("/", protect, getAllPayBills);
router.get("/:id", protect, getPayBillById);
router.put("/:id", protect, upload.single("attachment"), updatePayBill);
router.delete("/:id", protect, deletePayBill);

module.exports = router;
