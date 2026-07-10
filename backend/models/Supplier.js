// backend/models/Supplier.js
const mongoose = require("mongoose");

const SupplierSchema = new mongoose.Schema(
  {
    /* Basic Info */
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    address: { type: String, trim: true },

    /* Accounting */
    openingBalance: { type: Number, default: 0 },

    /* 🔗 Chart of Accounts Link */
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    /* Extras */
    supplierType: {
      type: String,
      enum: ["vendor", "blocked", "other"],
      default: "vendor",
    },
    notes: { type: String },

    /* Ownership */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    /* Soft Delete */
    isDeleted: { type: Boolean, default: false },
    hiddenReason: {
      type: String,
      enum: ["deleted", "converted", "merged", null],
      default: null,
    },
  },

  { timestamps: true },
);

/* 🔍 Text Search Support */
SupplierSchema.index({ name: "text", phone: "text", email: "text" });

SupplierSchema.index({ userId: 1, isDeleted: 1, hiddenReason: 1 });

module.exports = mongoose.model("Supplier", SupplierSchema);
