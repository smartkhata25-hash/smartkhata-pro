const mongoose = require("mongoose");

const receivePaymentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    date: {
      type: String,
      required: true,
    },
    time: {
      type: String,
      default: "", // ✅ Optional support
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01, // ✅ Minimum validation
    },
    paymentType: {
      type: String,
      enum: ["cash", "cheque", "bank", "online", "other"],
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
      default: "", // ✅ Safe fallback
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

    // ✅ Soft delete support
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ Optional full-text search support
// receivePaymentSchema.index({ description: "text" });

module.exports = mongoose.model("ReceivePayment", receivePaymentSchema);
