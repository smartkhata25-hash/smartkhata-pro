const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");

const mongoose = require("mongoose");

// 🧾 Bulk Create Products
exports.bulkCreateProducts = async (req, res) => {
  try {
    const userId = req.user.id;

    const products = req.body.map((p) => ({
      name: p.name,
      rackNo: p.rackNo || "",
      description: p.description || "",
      unit: p.unit,
      unitCost: p.unitCost,
      salePrice: p.salePrice,
      lowStockThreshold: p.lowStockThreshold,
      userId,

      // ✅ category optional
      categoryId: p.categoryId || null,
    }));

    // ✅ Optional: Filter duplicates by name for that user
    const names = products.map((p) => p.name);
    const existing = await Product.find({ userId, name: { $in: names } });
    if (existing.length > 0) {
      const existingNames = existing.map((e) => e.name);
      return res
        .status(400)
        .json({ error: `Duplicate products: ${existingNames.join(", ")}` });
    }

    const created = await Product.insertMany(products);

    // 🔥 NEW: populate کر کے واپس بھیجو
    const populated = await Product.find({
      _id: { $in: created.map((p) => p._id) },
    }).populate("categoryId", "name");

    res.status(201).json(populated);
  } catch (err) {
    console.error("Bulk Create Error:", err);
    res.status(500).json({ error: "Bulk creation failed" });
  }
};

// ➕ Create Product
exports.createProduct = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;

    // ✅ Duplicate check
    const exists = await Product.findOne({ name, userId });
    if (exists) {
      return res.status(400).json({ error: "Product already exists." });
    }

    const product = new Product({
      name: req.body.name,
      rackNo: req.body.rackNo || "",
      description: req.body.description || "",
      unit: req.body.unit,
      unitCost: req.body.unitCost,
      salePrice: req.body.salePrice,
      lowStockThreshold: req.body.lowStockThreshold,
      userId,

      // ✅ Category optional ہے
      categoryId: req.body.categoryId || null,
    });

    await product.save();

    // ✅ اگر initialStock دیا گیا ہے
    if (req.body.stock && Number(req.body.stock) > 0) {
      await InventoryTransaction.create({
        productId: product._id,
        type: "IN",
        quantity: Number(req.body.stock),
        note: "Opening Stock",
        userId: new mongoose.Types.ObjectId(userId),
        date: new Date(), // 🔴 یہی اصل حل ہے
      });
    }

    const populated = await Product.findById(product._id).populate(
      "categoryId",
      "name",
    );

    res.status(201).json(populated);
  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// 📃 Get All Products with calculated stock
exports.getProducts = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { search = "", page = 1, limit = 0 } = req.query;

    const query = { userId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const cursor = Product.find(query)
      .populate("categoryId", "name")
      .sort({ createdAt: -1 });

    if (+limit) cursor.skip((+page - 1) * +limit).limit(+limit);

    const products = await cursor;

    // ✅ InventoryTransaction سے stock calculate کریں
    const productIds = products.map((p) => p._id);

    const transactions = await InventoryTransaction.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          userId: userId,
        },
      },
      {
        $group: {
          _id: "$productId",
          stock: {
            $sum: {
              $switch: {
                branches: [
                  // Purchase / Refund
                  {
                    case: { $eq: ["$type", "IN"] },
                    then: "$quantity",
                  },
                  // Sale
                  {
                    case: { $eq: ["$type", "OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                  // Inventory Adjust +
                  {
                    case: { $eq: ["$type", "ADJUST_IN"] },
                    then: "$quantity",
                  },
                  // Inventory Adjust -
                  {
                    case: { $eq: ["$type", "ADJUST_OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      },
    ]);

    const stockMap = {};
    transactions.forEach((t) => {
      stockMap[t._id.toString()] = t.stock;
    });

    const result = products.map((p) => {
      const currentStock = stockMap[p._id.toString()] || 0;
      const isLowStock = currentStock <= (p.lowStockThreshold || 0);
      const isNegativeStock = currentStock < 0;

      return {
        ...p.toObject(),
        stock: currentStock,
        isLowStock,
        isNegativeStock,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Get Products Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ✏️ Update Product
exports.updateProduct = async (req, res) => {
  try {
    const updateData = {
      name: req.body.name,
      rackNo: req.body.rackNo || "",
      description: req.body.description || "",
      unit: req.body.unit,
      unitCost: req.body.unitCost,
      salePrice: req.body.salePrice,
      lowStockThreshold: req.body.lowStockThreshold,
    };

    // ✅ Category optional
    if ("categoryId" in req.body) {
      updateData.categoryId = req.body.categoryId || null;
    }

    const updated = await Product.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updateData,
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ error: "Product not found." });
    }

    res.json(updated);
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// ❌ Delete Product (with restriction)
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user.id;

    // 🔎 Check: product used anywhere?
    const used = await InventoryTransaction.findOne({
      productId: productId,
      userId: userId,
    });

    if (used) {
      return res.status(400).json({
        message: "Product is already used. Cannot delete.",
      });
    }

    const deleted = await Product.findOneAndDelete({
      _id: productId,
      userId: userId,
    });

    if (!deleted) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(400).json({ message: error.message });
  }
};

// ✏️ Update Stock via Purchase or Sale
exports.updateStock = async (req, res) => {
  try {
    const { productId, quantity, action, note = "" } = req.body;
    const userId = req.user.id;
    const qty = Number(quantity);

    const product = await Product.findById(productId);
    if (!product || product.userId.toString() !== userId) {
      return res.status(404).json({ error: "Product not found" });
    }

    // 🔎 current stock InventoryTransaction سے
    const result = await InventoryTransaction.aggregate([
      {
        $match: {
          productId: new mongoose.Types.ObjectId(productId),
          userId: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: null,
          stock: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$type", "IN"] }, then: "$quantity" },
                  {
                    case: { $eq: ["$type", "OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                  { case: { $eq: ["$type", "ADJUST_IN"] }, then: "$quantity" },
                  {
                    case: { $eq: ["$type", "ADJUST_OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      },
    ]);

    const currentStock = result[0]?.stock || 0;

    if (action === "out" && currentStock < qty) {
      return res.status(400).json({ error: "Not enough stock" });
    }

    // ✅ صرف transaction create کرو
    await InventoryTransaction.create({
      productId,
      quantity: qty,
      type: action.toUpperCase(),
      date: new Date(),
      note,
      userId: new mongoose.Types.ObjectId(userId),
    });

    res.json({ message: "Stock updated successfully" });
  } catch (error) {
    console.error("Update Stock Error:", error);
    res.status(400).json({ error: error.message });
  }
};
