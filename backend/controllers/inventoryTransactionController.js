const InventoryTransaction = require("../models/InventoryTransaction");
const Product = require("../models/Product");

// ✅ نیا لین دین بنائیں
exports.createTransaction = async (req, res) => {
  try {
    const {
      productId,
      type,
      quantity,
      note,
      invoiceId = null,
      invoiceModel = null,
    } = req.body;

    if (!productId || !type || !quantity) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (type === "IN") {
      product.stock += qty;
    } else if (type === "OUT") {
      if (product.stock < qty) {
        return res.status(400).json({ message: "Not enough stock" });
      }
      product.stock -= qty;
    } else {
      return res.status(400).json({ message: "Invalid type" });
    }

    await product.save();

    const transaction = new InventoryTransaction({
      productId,
      type,
      quantity: qty,
      note,
      invoiceId,
      invoiceModel,
      userId: req.user._id, // ✅ auth middleware کی شرط پر
    });

    await transaction.save();

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Transaction Error:", error);
    res
      .status(500)
      .json({ message: "Transaction failed", error: error.message });
  }
};

// ✅ تمام ٹرانزیکشنز حاصل کریں
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await InventoryTransaction.find().populate(
      "productId"
    );
    res.json(transactions);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch transactions", error: error.message });
  }
};
