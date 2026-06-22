const mongoose = require("mongoose");

const payBillSchema = new mongoose.Schema(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
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

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    finalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque"],
      required: true,
    },

    billNo: {
      type: String,
      default: "",
    },

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: false,
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
  },
);

payBillSchema.index({
  userId: 1,
  supplier: 1,
});

payBillSchema.index({
  userId: 1,
  partyId: 1,
});

module.exports = mongoose.model("PayBill", payBillSchema);
