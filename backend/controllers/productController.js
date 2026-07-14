const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");

const mongoose = require("mongoose");
const { logActivity } = require("../utils/activityLogger");

// 🧾 Bulk Create Products
exports.bulkCreateProducts = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
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

    // ✅ Opening Stock Transactions
    const stockTransactions = [];

    created.forEach((product, index) => {
      const stock = Number(req.body[index]?.stock || 0);

      if (stock > 0) {
        stockTransactions.push({
          productId: product._id,
          type: "IN",
          quantity: stock,
          note: "Opening Stock",
          userId: new mongoose.Types.ObjectId(userId),
          date: new Date(),
        });
      }
    });

    // ✅ Bulk stock entries create
    if (stockTransactions.length > 0) {
      await InventoryTransaction.insertMany(stockTransactions);
    }

    // 🔥 NEW: populate کر کے واپس بھیجو
    const populated = await Product.find({
      _id: { $in: created.map((p) => p._id) },
    }).populate("categoryId", "name");

    await logActivity({
      req,
      action: "create",
      module: "products",
      entityType: "Product",
      entityId: created[0]?._id || null,
      title: `Bulk Products (${created.length})`,
      description: `${created.length} Products ایک ساتھ بنائے گئے`,
      after: {
        productCount: created.length,
        productNames: created.map((p) => p.name),
        openingStockEntries: stockTransactions.length,
      },
    });

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
    const userId = req.user?.id || req.userId;

    // ✅ Duplicate check
    const exists = await Product.findOne({ name, userId });
    if (exists) {
      return res.status(400).json({ error: "Product already exists." });
    }

    let imageData = null;

    if (req.file) {
      const uploaded = await uploadFile({
        buffer: req.file.buffer,
        userId,
        moduleName: "products",
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      imageData = {
        key: uploaded.key,
        url: getFileUrl(uploaded.key),
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      };
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

      // ✅ Product image
      image: imageData || undefined,
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

    await logActivity({
      req,
      action: "create",
      module: "products",
      entityType: "Product",
      entityId: product._id,
      title: `Product ${product.name}`,
      description: `${product.name} Product بنایا گیا`,
      after: {
        name: product.name,
        rackNo: product.rackNo,
        description: product.description,
        unit: product.unit,
        unitCost: product.unitCost,
        salePrice: product.salePrice,
        lowStockThreshold: product.lowStockThreshold,
        categoryId: product.categoryId,
        openingStock: Number(req.body.stock || 0),
        hasImage: Boolean(product.image?.key),
      },
    });

    res.status(201).json(populated);
  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// 📃 Get All Products with calculated stock
exports.getProducts = async (req, res) => {
  try {
    const ownerId = req.user?.id || req.userId;
    const userId = new mongoose.Types.ObjectId(ownerId);

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
    const userId = req.user?.id || req.userId;
    const productId = req.params.id;

    const existingProduct = await Product.findOne({
      _id: productId,
      userId,
    });

    if (!existingProduct) {
      return res.status(404).json({
        error: "Product not found.",
      });
    }

    const stockResult = await InventoryTransaction.aggregate([
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
                  {
                    case: { $eq: ["$type", "IN"] },
                    then: "$quantity",
                  },
                  {
                    case: { $eq: ["$type", "OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                  {
                    case: { $eq: ["$type", "ADJUST_IN"] },
                    then: "$quantity",
                  },
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

    const currentStock = stockResult[0]?.stock || 0;

    const beforeUpdate = {
      name: existingProduct.name,
      rackNo: existingProduct.rackNo,
      description: existingProduct.description,
      unit: existingProduct.unit,
      unitCost: existingProduct.unitCost,
      salePrice: existingProduct.salePrice,
      lowStockThreshold: existingProduct.lowStockThreshold,
      categoryId: existingProduct.categoryId,
      stock: currentStock,
      imageKey: existingProduct.image?.key || "",
    };

    const updateData = {
      name: req.body.name,
      rackNo: req.body.rackNo || "",
      description: req.body.description || "",
      unit: req.body.unit,
      unitCost: req.body.unitCost,
      salePrice: req.body.salePrice,
      lowStockThreshold: req.body.lowStockThreshold,
    };

    if ("categoryId" in req.body) {
      updateData.categoryId = req.body.categoryId || null;
    }

    if (req.file) {
      if (existingProduct.image?.key) {
        await deleteFile(existingProduct.image.key);
      }

      const uploaded = await uploadFile({
        buffer: req.file.buffer,
        userId,
        moduleName: "products",
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
      });

      updateData.image = {
        key: uploaded.key,
        url: getFileUrl(uploaded.key),
        originalName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      };
    } else if (req.body.removeImage === "true") {
      if (existingProduct.image?.key) {
        await deleteFile(existingProduct.image.key);
      }

      updateData.image = {
        key: "",
        url: "",
        originalName: "",
        mimeType: "",
        size: 0,
      };
    }

    const newStock =
      req.body.stock === "" || req.body.stock === undefined
        ? currentStock
        : Number(req.body.stock);

    if (Number.isNaN(newStock) || newStock < 0) {
      return res.status(400).json({
        error: "Invalid stock quantity",
      });
    }

    const difference = newStock - currentStock;

    if (difference > 0) {
      await InventoryTransaction.create({
        productId,
        type: "ADJUST_IN",
        quantity: difference,
        note: "Stock Edited From Product Form",
        userId: new mongoose.Types.ObjectId(userId),
        date: new Date(),
      });
    }

    if (difference < 0) {
      await InventoryTransaction.create({
        productId,
        type: "ADJUST_OUT",
        quantity: Math.abs(difference),
        note: "Stock Edited From Product Form",
        userId: new mongoose.Types.ObjectId(userId),
        date: new Date(),
      });
    }

    const updated = await Product.findOneAndUpdate(
      {
        _id: productId,
        userId,
      },
      updateData,
      {
        new: true,
        runValidators: true,
      },
    ).populate("categoryId", "name");

    if (!updated) {
      return res.status(404).json({
        error: "Product not found.",
      });
    }

    await logActivity({
      req,
      action: "update",
      module: "products",
      entityType: "Product",
      entityId: updated._id,
      title: `Product ${updated.name}`,
      description: `${updated.name} Product Update کیا گیا`,
      before: beforeUpdate,
      after: {
        name: updated.name,
        rackNo: updated.rackNo,
        description: updated.description,
        unit: updated.unit,
        unitCost: updated.unitCost,
        salePrice: updated.salePrice,
        lowStockThreshold: updated.lowStockThreshold,
        categoryId: updated.categoryId?._id || updated.categoryId,
        stock: newStock,
        stockDifference: difference,
        imageKey: updated.image?.key || "",
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Update Product Error:", error);

    res.status(400).json({
      error: error.message,
    });
  }
};

// ❌ Delete Product (with restriction)
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user?.id || req.userId;

    const product = await Product.findOne({
      _id: productId,
      userId,
    });

    if (!product) {
      return res.status(404).json({
        message: "Product not found",
      });
    }

    const used = await InventoryTransaction.findOne({
      productId,
      userId,
    });

    if (used) {
      return res.status(400).json({
        message: "Product is already used. Cannot delete.",
      });
    }

    const beforeDelete = {
      name: product.name,
      rackNo: product.rackNo,
      description: product.description,
      unit: product.unit,
      unitCost: product.unitCost,
      salePrice: product.salePrice,
      lowStockThreshold: product.lowStockThreshold,
      categoryId: product.categoryId,
      imageKey: product.image?.key || "",
    };

    await Product.deleteOne({
      _id: productId,
      userId,
    });

    if (product.image?.key) {
      await deleteFile(product.image.key);
    }

    await logActivity({
      req,
      action: "delete",
      module: "products",
      entityType: "Product",
      entityId: product._id,
      title: `Product ${product.name}`,
      description: `${product.name} Product Delete کیا گیا`,
      before: beforeDelete,
      after: {
        isDeleted: true,
      },
    });

    res.json({
      message: "Product deleted successfully",
    });
  } catch (error) {
    console.error("Delete Product Error:", error);

    res.status(400).json({
      message: error.message,
    });
  }
};

// ✏️ Update Stock via Purchase or Sale
exports.updateStock = async (req, res) => {
  try {
    const { productId, quantity, action, note = "" } = req.body;

    const userId = req.user?.id || req.userId;
    const qty = Number(quantity);
    const normalizedAction = String(action || "").toLowerCase();

    if (!["in", "out"].includes(normalizedAction)) {
      return res.status(400).json({
        error: "Invalid stock action",
      });
    }

    if (Number.isNaN(qty) || qty <= 0) {
      return res.status(400).json({
        error: "Invalid stock quantity",
      });
    }

    const product = await Product.findOne({
      _id: productId,
      userId,
    });

    if (!product) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

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
                  {
                    case: { $eq: ["$type", "IN"] },
                    then: "$quantity",
                  },
                  {
                    case: { $eq: ["$type", "OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                  {
                    case: { $eq: ["$type", "ADJUST_IN"] },
                    then: "$quantity",
                  },
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

    if (normalizedAction === "out" && currentStock < qty) {
      return res.status(400).json({
        error: "Not enough stock",
      });
    }

    const transaction = await InventoryTransaction.create({
      productId,
      quantity: qty,
      type: normalizedAction.toUpperCase(),
      date: new Date(),
      note,
      userId: new mongoose.Types.ObjectId(userId),
    });

    const newStock =
      normalizedAction === "in" ? currentStock + qty : currentStock - qty;

    await logActivity({
      req,
      action: "update",
      module: "products",
      entityType: "Product",
      entityId: product._id,
      title: `Stock Update - ${product.name}`,
      description: `${product.name} کا Stock Update کیا گیا`,
      before: {
        stock: currentStock,
      },
      after: {
        stock: newStock,
        quantity: qty,
        stockAction: normalizedAction,
        note,
        transactionId: transaction._id,
      },
    });

    res.json({
      message: "Stock updated successfully",
    });
  } catch (error) {
    console.error("Update Stock Error:", error);

    res.status(400).json({
      error: error.message,
    });
  }
};
