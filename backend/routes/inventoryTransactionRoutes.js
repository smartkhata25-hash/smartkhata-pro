const express = require('express');
const router = express.Router();
const controller = require('../controllers/inventoryTransactionController');

// ✅ نیا لین دین شامل کریں
router.post('/', controller.createTransaction);

// ✅ تمام لین دین حاصل کریں
router.get('/', controller.getTransactions);

// ✅ ایک ٹرانزیکشن delete کریں (print/pdf + action hide میں مدد کے لیے)
router.delete('/:id', async (req, res) => {
  try {
    const InventoryTransaction = require('../models/InventoryTransaction');
    await InventoryTransaction.findByIdAndDelete(req.params.id);
    res.json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete transaction' });
  }
});

module.exports = router;
