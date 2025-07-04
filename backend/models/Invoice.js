const mongoose = require("mongoose");

// Invoice Line Item Schema
const invoiceItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  total: { type: Number, required: true },
});

// Main Invoice Schema
const invoiceSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      unique: true, // ✅ Avoid duplicates
    },
    customerName: { type: String, required: true },
    customerPhone: { type: String },

    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date },

    items: [invoiceItemSchema],

    totalAmount: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["Paid", "Unpaid", "Partial"],
      default: "Unpaid",
    },

    // ✅ Only required when paidAmount > 0
    paymentType: {
      type: String,
      enum: ["cash", "bank", "cheque", "online", "credit"],
      required: function () {
        return this.paidAmount > 0;
      },
      lowercase: true,
    },

    // ✅ Only required when paidAmount > 0
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: function () {
        return this.paidAmount > 0;
      },
      default: null,
    },

    notes: { type: String, default: "" },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },

    attachmentUrl: { type: String, default: "" },
    attachmentType: { type: String, default: "" },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
