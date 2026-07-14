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

const { requirePermission } = require("../middleware/permissionMiddleware");

// Create Purchase Return
router.post(
  "/",
  protect,
  requirePermission("purchase_returns.create"),
  upload.array("attachments", 3),
  createPurchaseReturn,
);

// Get All Purchase Returns
router.get(
  "/",
  protect,
  requirePermission("purchase_returns.view"),
  getAllPurchaseReturns,
);

// Get Purchase Return By ID
router.get(
  "/:id",
  protect,
  requirePermission("purchase_returns.view"),
  getPurchaseReturnById,
);

// Update Purchase Return
router.put(
  "/:id",
  protect,
  requirePermission("purchase_returns.edit"),
  upload.array("attachments", 3),
  updatePurchaseReturn,
);

// Delete Purchase Return
router.delete(
  "/:id",
  protect,
  requirePermission("purchase_returns.delete"),
  deletePurchaseReturn,
);

module.exports = router;
