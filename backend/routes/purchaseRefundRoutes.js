const express = require("express");
const router = express.Router();

// ✅ Multer setup
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const {
  createPurchaseReturn,
  getPurchaseReturnById,
  updatePurchaseReturn,
  getAllPurchaseReturns,
  deletePurchaseReturn,
} = require("../controllers/purchaseReturnController");

const { protect } = require("../middleware/authMiddleware");

// ✅ Create
router.post("/", protect, upload.single("attachment"), createPurchaseReturn);

// ✅ Get All
router.get("/", protect, getAllPurchaseReturns);

// ✅ Get By ID
router.get("/:id", protect, getPurchaseReturnById);

// ✅ Update
router.put("/:id", protect, upload.single("attachment"), updatePurchaseReturn);

// ✅ Delete
router.delete("/:id", protect, deletePurchaseReturn);

module.exports = router;
