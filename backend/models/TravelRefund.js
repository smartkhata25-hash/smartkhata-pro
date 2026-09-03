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

const refundItemSchema = new mongoose.Schema(
  {
    bookingItemId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    itemType: {
      type: String,
      trim: true,
      default: "service",
    },
    originalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    refundAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },
    vendorType: {
      type: String,
      enum: ["vendor", "party"],
      default: "vendor",
    },
    vendorPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
    },
    vendorRecoveryAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: true },
);

const travelRefundSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    refundNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    originalInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelBooking",
      required: true,
      index: true,
    },
    originalInvoiceNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    refundDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    refundTime: {
      type: String,
      trim: true,
      default: "",
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
      index: true,
    },
    customerType: {
      type: String,
      enum: ["customer", "party"],
      default: "customer",
    },
    customerPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Party",
      default: null,
      index: true,
    },
    refundMode: {
      type: String,
      enum: ["full", "partial", "items"],
      default: "partial",
    },
    refundItems: {
      type: [refundItemSchema],
      default: [],
    },
    grossRefundAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    penaltyAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    customerRefundAmount: {
      type: Number,
      min: 0,
      required: true,
    },
    vendorRecoveryAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    paidBackAmount: {
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
    customerJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    vendorJournalEntryId: {
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
      required: true,
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

travelRefundSchema.index({ userId: 1, refundNumber: 1 }, { unique: true });
travelRefundSchema.index({ userId: 1, refundDate: -1, isDeleted: 1 });
travelRefundSchema.index({
  userId: 1,
  originalInvoiceId: 1,
  isDeleted: 1,
});
travelRefundSchema.index({ userId: 1, customerId: 1, isDeleted: 1 });
travelRefundSchema.index({ userId: 1, customerPartyId: 1, isDeleted: 1 });
travelRefundSchema.index({ userId: 1, isDeleted: 1, isReversed: 1 });

module.exports = mongoose.model("TravelRefund", travelRefundSchema);
