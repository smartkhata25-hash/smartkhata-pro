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
    note: {
      type: String,
      default: "",
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
        paymentType: {
          type: String,
          enum: ["cash", "online", "cheque"],
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

    sourceType: {
      type: String,
      enum: [
        "opening_balance",
        "sale_invoice",
        "purchase_invoice",
        "purchase_return",
        "receive_payment",
        "pay_bill",
        "purchase_payment",
        "refund_payment",
        "purchase_return_payment",
        "payment",
        "adjustment",
        "refund_invoice",
        "manual",
        "expense",
      ],
      default: "manual",
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
    isReversed: {
      type: Boolean,
      default: false,
    },
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    accounts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Account",
      },
    ],
  },
  {
    timestamps: true,
  },
);

/* =========================================================
   DATA SAFETY VALIDATIONS
========================================================= */

// Ensure journal has at least 2 lines
journalEntrySchema.pre("validate", function (next) {
  if (!this.lines || this.lines.length < 2) {
    return next(new Error("Journal entry must contain at least two lines."));
  }
  next();
});

// Double Entry Accounting Validation
journalEntrySchema.pre("save", function (next) {
  let totalDebit = 0;
  let totalCredit = 0;

  for (const line of this.lines) {
    if (line.type === "debit") totalDebit += line.amount;
    if (line.type === "credit") totalCredit += line.amount;
  }

  if (totalDebit !== totalCredit) {
    return next(
      new Error(
        `Journal entry not balanced: Debit (${totalDebit}) ≠ Credit (${totalCredit})`,
      ),
    );
  }

  next();
});

// Auto trim safety
journalEntrySchema.pre("save", function (next) {
  // collect accounts for faster ledger queries
  const accountIds = this.lines.map((l) => l.account);
  this.accounts = [...new Set(accountIds)];

  // trim text fields
  if (this.description) this.description = this.description.trim();
  if (this.note) this.note = this.note.trim();
  if (this.billNo) this.billNo = this.billNo.trim();

  next();
});

// 🔹 Performance Indexes
journalEntrySchema.index({
  createdBy: 1,
  accounts: 1,
  isDeleted: 1,
});

journalEntrySchema.index({ createdBy: 1, isDeleted: 1 });
journalEntrySchema.index({
  createdBy: 1,
  "lines.account": 1,
  isDeleted: 1,
});
journalEntrySchema.index({ sourceType: 1 });

/* =========================================================
   INDEXES (Ledger Performance Optimization)
========================================================= */

// Customer Ledger queries
journalEntrySchema.index({
  createdBy: 1,
  customerId: 1,
  isDeleted: 1,
  date: 1,
});

// Supplier Ledger queries
journalEntrySchema.index({
  createdBy: 1,
  supplierId: 1,
  isDeleted: 1,
  date: 1,
});

// Sorting optimization
journalEntrySchema.index({
  createdBy: 1,
  date: 1,
  time: 1,
});

// Source lookup
journalEntrySchema.index({
  invoiceId: 1,
});

module.exports = mongoose.model("JournalEntry", journalEntrySchema);
