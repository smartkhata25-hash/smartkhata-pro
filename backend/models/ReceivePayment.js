const mongoose = require("mongoose");

const receivePaymentSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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
      enum: ["cash", "cheque", "bank", "online", "other"],
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
    attachments: [
      {
        key: {
          type: String,
          default: "",
        },

        type: {
          type: String,
          default: "",
        },

        size: {
          type: Number,
          default: 0,
        },

        originalName: {
          type: String,
          default: "",
        },
      },
    ],

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

receivePaymentSchema.index({
  userId: 1,
  customer: 1,
});

receivePaymentSchema.index({
  userId: 1,
  partyId: 1,
});

receivePaymentSchema.index({
  userId: 1,
  isDeleted: 1,
  createdAt: -1,
});

receivePaymentSchema.index({
  userId: 1,
  isDeleted: 1,
  date: -1,
});

receivePaymentSchema.index({
  userId: 1,
  billNo: 1,
});

module.exports = mongoose.model("ReceivePayment", receivePaymentSchema);
