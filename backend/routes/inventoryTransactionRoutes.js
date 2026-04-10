const express = require("express");
const router = express.Router();

const controller = require("../controllers/inventoryTransactionController");
const authMiddleware = require("../middleware/authMiddleware");

// ✅ نیا لین دین شامل کریں
router.post("/", authMiddleware, controller.createTransaction);

// ✅ تمام لین دین حاصل کریں
router.get("/", authMiddleware, controller.getTransactions);

// ✅ ایک ٹرانزیکشن delete کریں
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const InventoryTransaction = require("../models/InventoryTransaction");
    await InventoryTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: "Transaction deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// 🔧 Inventory Adjust (Manual Stock Adjust)
router.post("/adjust", authMiddleware, controller.adjustInventory);

// 🔧 Inventory Adjust (Bulk)
router.post("/adjust/bulk", authMiddleware, controller.adjustInventoryBulk);

module.exports = router;
