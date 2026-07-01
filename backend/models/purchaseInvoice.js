const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
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

const purchaseInvoiceSchema = new mongoose.Schema(
  {
    billNo: {
      type: String,
      required: false,
    },
    invoiceDate: {
      type: Date,
      required: true,
    },

    invoiceTime: {
      type: String,
      default: "",
    },

    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },
    supplierName: {
      type: String,
      required: true,
    },
    supplierPhone: {
      type: String,
      default: "",
    },

    items: [purchaseItemSchema],

    totalAmount: {
      type: Number,
      required: true,
    },
    discountPercent: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Paid", "Partial", "Unpaid"],
      default: "Unpaid",
    },

    paymentType: {
      type: String,
      enum: ["cash", "credit", "bank", "cheque", "online"],
      default: "credit",
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
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

    attachment: {
      type: String,
      default: "",
    },

    attachmentType: {
      type: String,
      default: "",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },

  { timestamps: true },
);

// 🔥 PERFORMANCE INDEX (Cloud Ready)
purchaseInvoiceSchema.index({
  userId: 1,
  "items.productId": 1,
  invoiceDate: -1,
});

purchaseInvoiceSchema.index({
  userId: 1,
  supplier: 1,
});

purchaseInvoiceSchema.index({
  userId: 1,
  partyId: 1,
});

module.exports =
  mongoose.models.PurchaseInvoice ||
  mongoose.model("PurchaseInvoice", purchaseInvoiceSchema);
