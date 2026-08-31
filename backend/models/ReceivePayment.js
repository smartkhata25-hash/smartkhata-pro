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
    previousBalance: {
      type: Number,
      default: null,
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
    originModule: {
      type: String,
      default: "",
      trim: true,
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

receivePaymentSchema.index({
  userId: 1,
  originModule: 1,
  isDeleted: 1,
});

module.exports = mongoose.model("ReceivePayment", receivePaymentSchema);
