const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["Asset", "Liability", "Equity", "Income", "Expense"],
    required: true,
  },
  normalBalance: {
    type: String,
    enum: ["debit", "credit"],
    required: true,
  },
  moduleScope: {
    type: String,
    enum: ["trading", "travel", "both"],
    default: "trading",
    index: true,
  },

  code: {
    type: String,
    required: true,
  },

  openingBalance: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  category: {
    type: String,
    enum: [
      // Assets
      "cash",
      "bank",
      "online",
      "cheque",
      "inventory",
      "receivable",
      "prepaid",
      "fixed",

      // Liabilities
      "payable",
      "credit",
      "loan",
      "tax",
      "supplier",
      "employee",

      // Equity
      "capital",
      "drawings",

      // Income
      "sales",
      "service",
      "discount_income",
      "discount",
      "other_income",
      "customer",

      // Expense
      "purchase",
      "salary",
      "rent",
      "utility",
      "transport",
      "marketing",
      "maintenance",
      "other_expense",
      "cogs",

      "party",
      "other",
    ],
    default: "other",
  },

  isSystem: {
    type: Boolean,
    default: false,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

accountSchema.index({ userId: 1, moduleScope: 1, code: 1 }, { unique: true });

accountSchema.index({ userId: 1, type: 1 });
accountSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model("Account", accountSchema);
