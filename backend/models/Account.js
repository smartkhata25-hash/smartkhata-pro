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

      // Equity
      "capital",
      "drawings",

      // Income
      "sales",
      "service",
      "discount_income",
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

      // Common
      "other",
    ],
    default: "other",
  },
  // 🔒 NEW FIELD
  isSystem: {
    type: Boolean,
    default: false,
  },
});

// ✅ compound index to make `code` unique per user
accountSchema.index({ userId: 1, code: 1 }, { unique: true });

accountSchema.index({ userId: 1, type: 1 });
accountSchema.index({ userId: 1, category: 1 });

module.exports = mongoose.model("Account", accountSchema);
