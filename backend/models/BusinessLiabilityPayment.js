const mongoose = require("mongoose");

const businessLiabilityPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    moduleScope: {
      type: String,
      enum: ["trading", "travel"],
      default: "trading",
      index: true,
    },

    liabilityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessLiability",
      required: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    paymentDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    paymentMethod: {
      type: String,
      enum: ["cash", "bank", "online", "cheque"],
      required: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    referenceNo: {
      type: String,
      trim: true,
      default: "",
    },

    note: {
      type: String,
      trim: true,
      default: "",
    },

    remainingBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    remainingAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isReversed: {
      type: Boolean,
      default: false,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    reversalJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Liability payment history
businessLiabilityPaymentSchema.index({
  userId: 1,
  moduleScope: 1,
  liabilityId: 1,
  paymentDate: -1,
});

// Account payment history
businessLiabilityPaymentSchema.index({
  userId: 1,
  moduleScope: 1,
  accountId: 1,
  paymentDate: -1,
});

// Active / reversed payments
businessLiabilityPaymentSchema.index({
  userId: 1,
  moduleScope: 1,
  isReversed: 1,
  paymentDate: -1,
});

module.exports = mongoose.model(
  "BusinessLiabilityPayment",
  businessLiabilityPaymentSchema,
);
