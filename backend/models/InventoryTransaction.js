const mongoose = require("mongoose");

const inventoryTransactionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    type: {
      type: String,
      enum: ["IN", "OUT", "ADJUST_IN", "ADJUST_OUT"],
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    // ⏱️ Manual date (agar kahin use ho)
    date: {
      type: Date,
      default: Date.now,
    },

    note: {
      type: String,
    },

    // 💰 Avg cost / rate
    rate: {
      type: Number,
      default: 0,
    },

    // 🧾 Adjust reference number (ADJ-001)
    adjustNo: {
      type: String,
      unique: true,
      sparse: true, // sirf adjust transactions ke liye
    },

    // 🔗 Invoice linkage (existing feature – untouched)
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "invoiceModel",
      default: null,
    },

    invoiceModel: {
      type: String,
      enum: ["PurchaseInvoice", "Invoice", "RefundInvoice", "PurchaseReturn"],
      default: null,
    },

    // 👤 User reference
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true, // ⭐ createdAt & updatedAt (IMPORTANT)
  },
);

module.exports = mongoose.model(
  "InventoryTransaction",
  inventoryTransactionSchema,
);
