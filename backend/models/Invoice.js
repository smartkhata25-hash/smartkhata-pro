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

  costPrice: {
    type: Number,
    default: 0,
  },

  profit: {
    type: Number,
    default: 0,
  },

  margin: {
    type: Number,
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

    subTotal: {
      type: Number,
      default: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
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
      default: null,
    },

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    attachments: [
      {
        key: {
          type: String,
          default: "",
        },
        type: {
          type: String,
          default: "",
        },
        size: {
          type: Number,
          default: 0,
        },
        originalName: {
          type: String,
          default: "",
        },
      },
    ],

    attachmentUrl: {
      type: String,
      default: "",
    },

    attachmentType: {
      type: String,
      default: "",
    },

    attachmentSize: {
      type: Number,
      default: 0,
    },

    attachmentOriginalName: {
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

invoiceSchema.index({
  createdBy: 1,
  partyId: 1,
});

invoiceSchema.index({
  createdBy: 1,
  customerId: 1,
});

// ✅ Sales Invoice List Performance Index
invoiceSchema.index({
  createdBy: 1,
  isDeleted: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Invoice", invoiceSchema);
