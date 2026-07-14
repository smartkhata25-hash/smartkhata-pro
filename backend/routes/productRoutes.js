const express = require("express");
const router = express.Router();

const productController = require("../controllers/productController");

const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

const { requirePermission } = require("../middleware/permissionMiddleware");

// Get All Products
router.get(
  "/",
  authMiddleware,
  requirePermission("products.view"),
  productController.getProducts,
);

// Create Multiple Products
router.post(
  "/bulk",
  authMiddleware,
  requirePermission("products.create"),
  productController.bulkCreateProducts,
);

// Create Single Product
router.post(
  "/",
  authMiddleware,
  requirePermission("products.create"),
  upload.single("image"),
  productController.createProduct,
);

// Update Stock
// یہ /:id سے پہلے رہنا ضروری ہے
router.put(
  "/stock",
  authMiddleware,
  requirePermission("products.edit"),
  productController.updateStock,
);

// Update Product
router.put(
  "/:id",
  authMiddleware,
  requirePermission("products.edit"),
  upload.single("image"),
  productController.updateProduct,
);

// Delete Product
router.delete(
  "/:id",
  authMiddleware,
  requirePermission("products.delete"),
  productController.deleteProduct,
);

module.exports = router;
