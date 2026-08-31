const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema(
  {
    key: { type: String, trim: true, default: "" },
    type: { type: String, trim: true, default: "" },
    size: { type: Number, min: 0, default: 0 },
    originalName: { type: String, trim: true, default: "" },
  },
  { _id: false },
);

const travelVendorReturnSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    returnNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    returnDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    returnTime: {
      type: String,
      trim: true,
      default: "",
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    originalInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelBooking",
      default: null,
      index: true,
    },
    originalInvoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    bookingItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    serviceLabel: {
      type: String,
      trim: true,
      default: "",
    },
    originalCost: {
      type: Number,
      min: 0,
      default: 0,
    },
    vendorReturnAmount: {
      type: Number,
      min: 0.01,
      required: true,
    },
    vendorPenaltyAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    amountReceivedNow: {
      type: Number,
      min: 0,
      default: 0,
    },
    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque", "credit"],
      default: "credit",
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    attachmentUrl: {
      type: String,
      default: "",
    },
    attachmentType: {
      type: String,
      default: "",
    },
    attachmentSize: {
      type: Number,
      min: 0,
      default: 0,
    },
    attachmentOriginalName: {
      type: String,
      trim: true,
      default: "",
    },
    costJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    paymentJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
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
      index: true,
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
  { timestamps: true },
);

travelVendorReturnSchema.index({ userId: 1, returnNumber: 1 }, { unique: true });
travelVendorReturnSchema.index({ userId: 1, vendorId: 1, returnDate: -1 });
travelVendorReturnSchema.index({ userId: 1, originalInvoiceId: 1, bookingItemId: 1 });
travelVendorReturnSchema.index({ userId: 1, isDeleted: 1, isReversed: 1 });

module.exports = mongoose.model("TravelVendorReturn", travelVendorReturnSchema);
