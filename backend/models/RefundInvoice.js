const mongoose = require("mongoose");

const RefundItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  price: Number,
  total: Number,
});

const RefundInvoiceSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      unique: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
    },
    invoiceTime: String,

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    originalInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
    },
    customerName: {
      type: String,
      required: true,
    },
    customerPhone: String,

    totalAmount: {
      type: Number,
      required: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    paymentType: {
      type: String,
      enum: ["cash", "credit", "bank", "cheque", "online"],
      required: true,
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },

    attachmentUrl: String,
    attachmentType: String,

    notes: String,
    items: [RefundItemSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("RefundInvoice", RefundInvoiceSchema);
