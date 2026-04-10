const express = require("express");
const router = express.Router();

const categoryController = require("../controllers/categoryController");
const authMiddleware = require("../middleware/authMiddleware");

// ➕ Create Category
router.post("/", authMiddleware, categoryController.createCategory);

// 📃 Get All Categories
router.get("/", authMiddleware, categoryController.getCategories);

// ✏️ Update / Rename Category
router.put("/:id", authMiddleware, categoryController.updateCategory);

// ❌ Delete Category
router.delete("/:id", authMiddleware, categoryController.deleteCategory);

module.exports = router;
