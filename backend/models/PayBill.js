const mongoose = require("mongoose");

const payBillSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      default: "",
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    paymentType: {
      type: String,
      enum: ["Cash", "Cheque", "Bank"],
      required: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    attachment: {
      type: String,
      default: "",
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ (Optional) Add index for text search
// payBillSchema.index({ description: "text" });

module.exports = mongoose.model("PayBill", payBillSchema);
