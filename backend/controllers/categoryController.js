const Category = require("../models/Category");
const Product = require("../models/Product");
const mongoose = require("mongoose");

// ➕ Add New Category
exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }

    const category = new Category({
      name: name.trim(),
      userId,
    });

    await category.save();

    res.status(201).json(category);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Category already exists" });
    }

    console.error("Create Category Error:", error);
    res.status(500).json({ error: "Failed to create category" });
  }
};

// 📃 Get All Categories (user-wise)
exports.getCategories = async (req, res) => {
  try {
    const userId = req.user.id;

    const categories = await Category.find({ userId }).sort({ name: 1 });

    res.json(categories);
  } catch (error) {
    console.error("Get Categories Error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
};

// ❌ Delete Category (safe delete)
exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 🛑 Invalid ID protection
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid category ID" });
    }

    // 🔎 Check category exists
    const category = await Category.findOne({
      _id: id,
      userId,
    });

    if (!category) {
      return res.status(404).json({ error: "Category not found" });
    }

    // 🛑 Check if category is used in any product
    const used = await Product.findOne({
      categoryId: id,
      userId,
    });

    if (used) {
      return res.status(400).json({
        error: "Category is used in products, cannot delete",
      });
    }

    await Category.deleteOne({
      _id: id,
      userId,
    });

    res.json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    console.error("Delete Category Error:", error);
    res.status(500).json({
      error: "Failed to delete category",
    });
  }
};

// ✏️ Update / Rename Category
exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
    const id = req.params.id;

    if (!name || !name.trim()) {
      return res.status(400).json({
        error: "Category name is required",
      });
    }

    // 🛑 Invalid ID protection
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid category ID",
      });
    }

    const trimmedName = name.trim();

    // ❌ Check duplicate name for same user
    const existing = await Category.findOne({
      name: trimmedName,
      userId,
      _id: { $ne: id },
    });

    if (existing) {
      return res.status(400).json({
        error: "Category already exists",
      });
    }

    const updated = await Category.findOneAndUpdate(
      { _id: id, userId },
      { name: trimmedName },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        error: "Category not found",
      });
    }

    res.json(updated);
  } catch (error) {
    console.error("Update Category Error:", error);
    res.status(500).json({
      error: "Failed to update category",
    });
  }
};
