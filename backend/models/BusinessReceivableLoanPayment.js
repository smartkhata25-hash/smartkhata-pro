const mongoose = require("mongoose");

const businessReceivableLoanPaymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessReceivableLoan",
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
      maxlength: 100,
      default: "",
    },

    note: {
      type: String,
      trim: true,
      maxlength: 500,
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

businessReceivableLoanPaymentSchema.pre("validate", function (next) {
  if (Number(this.remainingAfter || 0) > Number(this.remainingBefore || 0)) {
    return next(
      new Error(
        "Remaining amount after payment cannot exceed remaining amount before payment.",
      ),
    );
  }

  next();
});

businessReceivableLoanPaymentSchema.index({
  userId: 1,
  loanId: 1,
  paymentDate: -1,
});

businessReceivableLoanPaymentSchema.index({
  userId: 1,
  accountId: 1,
  paymentDate: -1,
});

businessReceivableLoanPaymentSchema.index({
  userId: 1,
  isReversed: 1,
  paymentDate: -1,
});

module.exports = mongoose.model(
  "BusinessReceivableLoanPayment",
  businessReceivableLoanPaymentSchema,
);
