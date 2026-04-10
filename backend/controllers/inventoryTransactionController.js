const InventoryTransaction = require("../models/InventoryTransaction");
const Product = require("../models/Product");
const mongoose = require("mongoose");
const { getProductStock } = require("../utils/stockHelper");

// 🔢 Generate Adjust Number
const generateNextAdjustNo = async () => {
  const lastAdjust = await InventoryTransaction.findOne({
    adjustNo: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!lastAdjust || !lastAdjust.adjustNo) {
    return "ADJ-001";
  }

  const lastNumber = parseInt(lastAdjust.adjustNo.replace("ADJ-", ""));
  const nextNumber = lastNumber + 1;

  return `ADJ-${String(nextNumber).padStart(3, "0")}`;
};

// ✅ Create Inventory Transaction (Manual Entry)
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

    const transaction = new InventoryTransaction({
      productId,
      type,
      quantity: qty,
      note,
      invoiceId,
      invoiceModel,
      userId: req.user._id,
    });

    await transaction.save();

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Transaction Error:", error);
    res.status(500).json({
      message: "Transaction failed",
      error: error.message,
    });
  }
};

// ✅ Get All Transactions
exports.getTransactions = async (req, res) => {
  try {
    const transactions = await InventoryTransaction.find({
      userId: req.user.id,
    }).populate("productId");

    res.json(transactions);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch transactions",
      error: error.message,
    });
  }
};

// 🔧 Adjust Inventory (Single Product) — PURE CALCULATED STOCK
exports.adjustInventory = async (req, res) => {
  try {
    const { productId, newQty, note = "" } = req.body;
    const userId = req.user.id;

    const newQuantity = Number(newQty);
    if (isNaN(newQuantity) || newQuantity < 0) {
      return res.status(400).json({ message: "Invalid quantity" });
    }

    const product = await Product.findOne({
      _id: productId,
      userId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // 🔥 LIVE STOCK CALCULATION
    const currentStock = await getProductStock(productId, userId);
    const diff = newQuantity - currentStock;

    if (diff === 0) {
      return res.json({ message: "No stock change" });
    }

    const type = diff > 0 ? "ADJUST_IN" : "ADJUST_OUT";
    const qty = Math.abs(diff);
    const avgCost = product.unitCost || 0;
    const adjustNo = await generateNextAdjustNo();

    await InventoryTransaction.create({
      productId: product._id,
      type,
      quantity: qty,
      rate: avgCost,
      note: note || "Inventory Adjustment",
      adjustNo,
      userId: new mongoose.Types.ObjectId(userId),
      date: new Date(),
    });

    res.json({ message: "Inventory adjusted successfully" });
  } catch (error) {
    console.error("Inventory Adjust Error:", error);
    res.status(500).json({ message: "Inventory adjust failed" });
  }
};

// 🔧 Bulk Inventory Adjust — PURE CALCULATED STOCK
exports.adjustInventoryBulk = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: "No rows provided" });
    }

    let createdTransactions = [];

    for (const row of rows) {
      const { productId, newQty, note = "" } = row;

      if (!productId || newQty === "" || newQty === null) continue;

      const newQuantity = Number(newQty);
      if (isNaN(newQuantity) || newQuantity < 0) continue;

      const product = await Product.findOne({
        _id: productId,
        userId,
      });

      if (!product) continue;

      // 🔥 LIVE STOCK
      const currentStock = await getProductStock(productId, userId);
      const diff = newQuantity - currentStock;

      if (diff === 0) continue;

      const avgCost = product.unitCost || 0;
      const type = diff > 0 ? "ADJUST_IN" : "ADJUST_OUT";
      const qty = Math.abs(diff);
      const adjustNo = await generateNextAdjustNo();

      await InventoryTransaction.create({
        productId: product._id,
        type,
        quantity: qty,
        rate: avgCost,
        note: note || "Inventory Adjustment",
        adjustNo,
        userId: new mongoose.Types.ObjectId(userId),
        date: new Date(),
      });

      createdTransactions.push(product._id);
    }

    if (createdTransactions.length === 0) {
      return res.status(400).json({
        message: "No valid rows found to adjust inventory",
      });
    }

    res.json({
      message: "Bulk inventory adjusted successfully",
      count: createdTransactions.length,
    });
  } catch (error) {
    console.error("Bulk Inventory Adjust Error:", error);
    res.status(500).json({
      message: "Bulk inventory adjust failed",
    });
  }
};
