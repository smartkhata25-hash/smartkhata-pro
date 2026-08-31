// backend/models/Supplier.js
const mongoose = require("mongoose");
const {
  OPTIONAL_TRAVEL_CURRENCY_CODES,
  OPTIONAL_TRAVEL_VENDOR_TYPES,
} = require("../config/travelConfig");

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
    moduleScope: {
      type: String,
      enum: ["trading", "travel", "both"],
      default: "trading",
      index: true,
    },
    notes: { type: String },

    /* Travel module metadata */
    isTravelVendor: {
      type: Boolean,
      default: false,
    },
    travelVendorType: {
      type: String,
      enum: OPTIONAL_TRAVEL_VENDOR_TYPES,
      default: "",
      trim: true,
    },
    travelServiceCategories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "TravelServiceCategory",
      },
    ],
    contactPerson: {
      type: String,
      trim: true,
      default: "",
    },
    preferredCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      enum: OPTIONAL_TRAVEL_CURRENCY_CODES,
      default: "",
    },

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
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deleteReason: {
      type: String,
      trim: true,
      default: "",
    },
  },

  { timestamps: true },
);

/* 🔍 Text Search Support */
SupplierSchema.index({ name: "text", phone: "text", email: "text" });

SupplierSchema.index({ userId: 1, isDeleted: 1, hiddenReason: 1 });
SupplierSchema.index({ userId: 1, moduleScope: 1, isDeleted: 1 });
SupplierSchema.index({ userId: 1, isTravelVendor: 1, isDeleted: 1 });
SupplierSchema.index({ userId: 1, travelVendorType: 1, isDeleted: 1 });

module.exports = mongoose.model("Supplier", SupplierSchema);
