const mongoose = require("mongoose");

const journalEntrySchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      default: "",
    },
    description: {
      type: String,
    },
    lines: [
      {
        account: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Account",
          required: true,
        },
        type: {
          type: String,
          enum: ["debit", "credit"],
          required: true,
        },
        amount: {
          type: Number,
          required: true,
          min: 0.01,
        },
      },
    ],
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
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    billNo: {
      type: String,
      default: "",
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["cash", "bank", "cheque", "credit", "online", "other"],
      default: "cash",
    },
    sourceType: {
      type: String,
      default: "manual", // 🧠 kept flexible
    },
    attachmentUrl: {
      type: String,
      default: "",
    },
    attachmentType: {
      type: String,
      enum: ["image", "pdf", "voice", "other", ""],
      default: "",
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: "invoiceModel",
      default: null,
    },
    invoiceModel: {
      type: String,
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
