const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    rackNo: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: false,
    },

    unit: {
      type: String,
      trim: true,
    },

    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },

    salePrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowStockThreshold: {
      type: Number,
      default: 5,
      min: 0,
    },

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

// 🔐 Prevent duplicate product names per user
productSchema.index({ name: 1, userId: 1 }, { unique: true });

// ⚡ Faster queries
productSchema.index({ userId: 1 });
productSchema.index({ categoryId: 1 });

module.exports = mongoose.model("Product", productSchema);
