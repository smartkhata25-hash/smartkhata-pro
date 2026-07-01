const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");

router.put(
  "/:id",
  authMiddleware,
  upload.single("image"),
  productController.updateProduct,
);

router.delete("/:id", authMiddleware, productController.deleteProduct);

router.post(
  "/",
  authMiddleware,
  upload.single("image"),
  productController.createProduct,
);

router.post("/bulk", authMiddleware, productController.bulkCreateProducts);
router.get("/", authMiddleware, productController.getProducts);
router.put("/stock", authMiddleware, productController.updateStock);

module.exports = router;
