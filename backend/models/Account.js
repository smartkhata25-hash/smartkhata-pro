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
  code: {
    type: String,
    required: true,
  },

  balance: {
    type: Number,
    default: 0,
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
      "cash",
      "bank",
      "cheque",
      "online",
      "credit",
      "other",
      "customer",
      "supplier",
    ],
    default: "other",
  },
});

// ✅ compound index to make `code` unique per user
accountSchema.index({ userId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Account", accountSchema);
