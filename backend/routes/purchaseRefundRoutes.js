const express = require("express");
const router = express.Router();

const upload = require("../middleware/uploadMiddleware");

const {
  createPurchaseReturn,
  getPurchaseReturnById,
  updatePurchaseReturn,
  getAllPurchaseReturns,
  deletePurchaseReturn,
} = require("../controllers/purchaseReturnController");

const { protect } = require("../middleware/authMiddleware");

// ✅ Create
router.post("/", protect, upload.array("attachments", 3), createPurchaseReturn);

// ✅ Get All
router.get("/", protect, getAllPurchaseReturns);

// ✅ Get By ID
router.get("/:id", protect, getPurchaseReturnById);

// ✅ Update
router.put(
  "/:id",
  protect,
  upload.array("attachments", 3),
  updatePurchaseReturn,
);

// ✅ Delete
router.delete("/:id", protect, deletePurchaseReturn);

module.exports = router;
