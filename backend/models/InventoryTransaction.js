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

    date: {
      type: Date,
      default: Date.now,
    },

    note: {
      type: String,
    },

    rate: {
      type: Number,
      default: 0,
    },

    adjustNo: {
      type: String,
      unique: true,
      sparse: true,
    },

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
    timestamps: true,
  },
);

inventoryTransactionSchema.index({
  userId: 1,
  productId: 1,
  date: -1,
});

inventoryTransactionSchema.index({
  userId: 1,
  invoiceModel: 1,
  type: 1,
  date: -1,
});

inventoryTransactionSchema.index({
  userId: 1,
  invoiceId: 1,
});

module.exports = mongoose.model(
  "InventoryTransaction",
  inventoryTransactionSchema,
);
