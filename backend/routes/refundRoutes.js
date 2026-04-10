const express = require("express");
const router = express.Router();

// ✅ Multer setup
const multer = require("multer");
const path = require("path");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // ✅ Make sure this folder exists
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

const {
  createRefundInvoice,
  getRefundById,
  updateRefundInvoice,
  getAllRefunds,
  deleteRefundInvoice, // ✅ نیا فنکشن
} = require("../controllers/refundInvoiceController");

const { protect } = require("../middleware/authMiddleware");

// ✅ Create Refund (with optional file)
router.post("/", protect, upload.single("attachment"), createRefundInvoice);

// ✅ Get All Refunds
router.get("/", protect, getAllRefunds);

// ✅ Get Refund by ID
router.get("/:id", protect, getRefundById);

// ✅ Update Refund (you can adjust this if file upload is also supported in update)
router.put("/:id", protect, upload.single("attachment"), updateRefundInvoice);

// ✅ DELETE route add کریں
router.delete("/:id", protect, deleteRefundInvoice);

module.exports = router;
