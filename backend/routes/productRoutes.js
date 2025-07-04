const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const authMiddleware = require('../middleware/authMiddleware');

router.put('/:id', authMiddleware, productController.updateProduct);
router.delete('/:id', authMiddleware, productController.deleteProduct);
router.post('/', authMiddleware, productController.createProduct);
router.get('/', authMiddleware, productController.getProducts);
router.put('/stock', authMiddleware, productController.updateStock);

module.exports = router;
