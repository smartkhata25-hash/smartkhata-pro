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
      required: true, // ✅ Enforce linkage to COA
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
  },
  { timestamps: true }
);

/* 🔍 Text Search Support */
SupplierSchema.index({ name: "text", phone: "text", email: "text" });

module.exports = mongoose.model("Supplier", SupplierSchema);
