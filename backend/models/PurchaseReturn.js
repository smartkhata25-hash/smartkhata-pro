const mongoose = require("mongoose");

/* =========================================================
   ITEM SCHEMA
========================================================= */
const PurchaseReturnItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 0.01,
  },
  price: {
    type: Number,
    default: 0,
  },
  total: {
    type: Number,
    default: 0,
  },
});

/* =========================================================
   MAIN PURCHASE RETURN SCHEMA
========================================================= */
const PurchaseReturnSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      trim: true,
    },

    returnDate: {
      type: Date,
      required: true,
    },

    returnTime: {
      type: String,
      default: "",
    },

    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },

    supplierName: {
      type: String,
      required: true,
      trim: true,
    },

    supplierPhone: {
      type: String,
      default: "",
    },
    originalInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseInvoice",
      required: false, // 🔥 Invoice se link karne ke liye
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    paymentType: {
      type: String,
      enum: ["cash", "bank", "cheque", "online", ""],
      default: "",
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },

    notes: {
      type: String,
      default: "",
    },

    items: [PurchaseReturnItemSchema],

    attachmentUrl: {
      type: String,
      default: "",
    },

    attachmentType: {
      type: String,
      enum: ["image", "pdf", "voice", "other", ""],
      default: "",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
   INDEXES (PERFORMANCE BOOST)
========================================================= */
PurchaseReturnSchema.index({ createdBy: 1, returnDate: 1 });
PurchaseReturnSchema.index({ createdBy: 1, supplierId: 1 });
PurchaseReturnSchema.index({ billNo: 1 });
PurchaseReturnSchema.index({ createdBy: 1, isDeleted: 1 });

module.exports = mongoose.model("PurchaseReturn", PurchaseReturnSchema);
