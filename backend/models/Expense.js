const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
    },
    titleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseTitle",
      default: null,
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["Cash", "Cheque", "Bank"],
      required: true,
    },
    moduleScope: {
      type: String,
      enum: ["trading", "travel", "both"],
      default: "trading",
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
      default: null,
    },
    description: {
      type: String,
      default: "",
    },
    attachment: {
      type: String,
      default: "",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deleteReason: {
      type: String,
      trim: true,
      default: "",
    },
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversedAt: {
      type: Date,
      default: null,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reversalJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],
    // ✅ New Field: JournalEntry linkage
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Expense", expenseSchema);
