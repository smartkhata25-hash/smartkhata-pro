const mongoose = require("mongoose");

const RefundItemSchema = new mongoose.Schema({
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
    default: 0,
  },

  total: {
    type: Number,
    default: 0,
  },

  // ✅ Original sale time historical cost
  costPrice: {
    type: Number,
    default: 0,
  },

  // ✅ Profit reversed because of refund
  profitReversed: {
    type: Number,
    default: 0,
  },
});

const RefundInvoiceSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: true,
      trim: true,
    },
    invoiceDate: {
      type: Date,
      required: true,
    },
    invoiceTime: String,

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

    notes: String,
    items: [RefundItemSchema],

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // ✅ Opening balance refund
    isOpening: {
      type: Boolean,
      default: false,
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

RefundInvoiceSchema.index({ createdBy: 1, billNo: 1 }, { unique: true });

RefundInvoiceSchema.index({
  createdBy: 1,
  isDeleted: 1,
  invoiceDate: -1,
});

// ✅ Product Performance Report
RefundInvoiceSchema.index({
  createdBy: 1,
  isDeleted: 1,
  isOpening: 1,
  invoiceDate: -1,
});

// ✅ Product-wise Refund Performance
RefundInvoiceSchema.index({
  createdBy: 1,
  "items.productId": 1,
  invoiceDate: -1,
});

// ✅ Original Sale Invoice lookup
RefundInvoiceSchema.index({
  createdBy: 1,
  originalInvoiceId: 1,
});

module.exports = mongoose.model("RefundInvoice", RefundInvoiceSchema);
