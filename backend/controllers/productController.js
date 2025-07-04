const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");

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

    const product = new Product({ ...req.body, userId });
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Create Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// 📃 Get All Products with pagination + search
exports.getProducts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { search = "", page = 1, limit = 0 } = req.query;

    const query = { userId };
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const cursor = Product.find(query).sort({ createdAt: -1 });
    if (+limit) cursor.skip((+page - 1) * +limit).limit(+limit);

    const products = await cursor;
    res.json(products);
  } catch (error) {
    console.error("Get Products Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ✏️ Update Product
exports.updateProduct = async (req, res) => {
  try {
    const updated = await Product.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Product not found." });

    res.json(updated);
  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// ❌ Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    });
    if (!deleted) return res.status(404).json({ error: "Product not found." });

    res.json({ message: "Product deleted" });
  } catch (error) {
    console.error("Delete Product Error:", error);
    res.status(400).json({ error: error.message });
  }
};

// ✏️ Update Stock via Purchase or Sale
exports.updateStock = async (req, res) => {
  try {
    const { productId, quantity, action, note = "" } = req.body;
    const userId = req.user.id;
    const product = await Product.findById(productId);

    if (!product || product.userId.toString() !== userId) {
      return res.status(404).json({ error: "Product not found" });
    }

    const qty = Number(quantity);
    if (action === "in") {
      product.stock += qty;
    } else if (action === "out") {
      if (product.stock < qty) {
        return res.status(400).json({ error: "Not enough stock" });
      }
      product.stock -= qty;
    } else {
      return res.status(400).json({ error: "Invalid stock action" });
    }

    await product.save();

    // ✅ Inventory log
    await InventoryTransaction.create({
      productId,
      quantity: qty,
      type: action.toUpperCase(),
      date: new Date(),
      note,
      userId,
    });

    res.json({ message: "Stock updated", product });
  } catch (error) {
    console.error("Update Stock Error:", error);
    res.status(400).json({ error: error.message });
  }
};
