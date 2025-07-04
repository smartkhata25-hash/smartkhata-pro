const express = require('express');
const router = express.Router();

const {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer
} = require('../controllers/customerController');

const { protect } = require('../middleware/authMiddleware');

// ✅ GET all customers
router.get('/', protect, getCustomers);

// ✅ POST add new customer
router.post('/', protect, addCustomer);

// ✅ PUT update customer
router.put('/:id', protect, updateCustomer);

// ✅ DELETE customer
router.delete('/:id', protect, deleteCustomer);

module.exports = router;
