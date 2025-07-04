const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  type: {
    type: String,
    enum: ["IN", "OUT"],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
  note: {
    type: String,
  },

  // ✅ New fields for traceability
  invoiceId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: "invoiceModel",
    default: null,
  },
  invoiceModel: {
    type: String,
    enum: ["Invoice", "PurchaseInvoice"],
    default: null,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

module.exports = mongoose.model(
  "InventoryTransaction",
  inventoryTransactionSchema
);
