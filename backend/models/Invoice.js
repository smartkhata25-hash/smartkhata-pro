const mongoose = require("mongoose");

// Invoice Line Item Schema
const invoiceItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: false,
  },

  quantity: {
    type: Number,
    required: false,
    default: 0,
  },

  price: {
    type: Number,
    required: false,
    default: 0,
  },

  total: {
    type: Number,
    required: false,
    default: 0,
  },
});

// Main Invoice Schema
const invoiceSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      trim: true,
    },

    customerName: {
      type: String,
      required: true,
    },

    customerPhone: {
      type: String,
      default: "",
    },

    invoiceDate: {
      type: Date,
      default: Date.now,
    },

    invoiceTime: {
      type: String,
      default: "",
    },

    dueDate: {
      type: Date,
    },

    items: {
      type: [invoiceItemSchema],
      required: true,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Paid", "Unpaid", "Partial"],
      default: "Unpaid",
    },

    paymentType: {
      type: String,
      enum: ["cash", "bank", "cheque", "online", "credit"],
      required: function () {
        return this.paidAmount > 0;
      },
      lowercase: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      required: function () {
        return this.paidAmount > 0;
      },
    },

    notes: {
      type: String,
      default: "",
    },
    by: {
      type: String,
      default: "",
    },
    lang: {
      type: String,
      default: "en",
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    attachmentUrl: {
      type: String,
      default: "",
    },

    attachmentType: {
      type: String,
      default: "",
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    isOpening: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// ✅ Correct UNIQUE rule (per user, per bill)
invoiceSchema.index({ createdBy: 1, billNo: 1 }, { unique: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
