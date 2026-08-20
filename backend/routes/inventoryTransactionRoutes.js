const express = require("express");
const router = express.Router();

const controller = require("../controllers/inventoryTransactionController");
const authMiddleware = require("../middleware/authMiddleware");

const { requirePermission } = require("../middleware/permissionMiddleware");
const { PERMISSIONS } = require("../utils/permissionList");

// ✅ نیا لین دین شامل کریں
router.post(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.ADJUST),
  controller.createTransaction,
);

// ✅ تمام لین دین حاصل کریں
router.get(
  "/",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.VIEW_HISTORY),
  controller.getTransactions,
);

// ✅ ایک ٹرانزیکشن Delete کریں
router.delete(
  "/:id",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.DELETE_TRANSACTION),
  async (req, res) => {
    try {
      const InventoryTransaction = require("../models/InventoryTransaction");

      await InventoryTransaction.findByIdAndDelete(req.params.id);

      res.json({
        message: "Transaction deleted successfully",
      });
    } catch (err) {
      res.status(500).json({
        error: "Failed to delete transaction",
      });
    }
  },
);

// 🔧 Inventory Adjust (Manual Stock Adjust)
router.post(
  "/adjust",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.ADJUST),
  controller.adjustInventory,
);

// 🔧 Inventory Adjust (Bulk)
router.post(
  "/adjust/bulk",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.ADJUST),
  controller.adjustInventoryBulk,
);

// ⚡ Lightweight Inventory Version Check
router.get(
  "/version",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.VIEW),
  controller.getInventoryVersion,
);

// 📋 Inventory Adjust List
router.get(
  "/adjust-list",
  authMiddleware,
  requirePermission(PERMISSIONS.INVENTORY.VIEW_HISTORY),
  controller.getAdjustList,
);

module.exports = router;
