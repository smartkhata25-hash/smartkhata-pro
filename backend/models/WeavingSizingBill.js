const mongoose = require("mongoose");

const attachmentSchema = new mongoose.Schema({
  key: String, type: String, size: Number, originalName: String,
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  billNo: { type: String, required: true },
  partyInvoiceNo: { type: String, trim: true, default: "" },
  billDate: { type: String, required: true },
  sizingPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
  receiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingReceipt", default: null },
  billableWeightKg: { type: Number, min: 0.000001, required: true },
  ratePerKg: { type: Number, min: 0, required: true },
  grossAmount: { type: Number, min: 0, required: true },
  gstPercent: { type: Number, min: 0, default: 0 },
  gstAmount: { type: Number, min: 0, default: 0 },
  billAmount: { type: Number, min: 0, required: true },
  creditDays: { type: Number, min: 0, default: 0 },
  dueDate: { type: String, default: "" },
  paidAmount: { type: Number, min: 0, default: 0 },
  balanceDue: { type: Number, min: 0, default: 0 },
  paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
  paymentTransactionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WeavingMoneyTransaction" }],
  attachments: { type: [attachmentSchema], default: [] },
  notes: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["posted", "void"], default: "posted" },
  voidedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, billNo: 1 }, { unique: true });
schema.index({ userId: 1, sizingPartyId: 1, dueDate: 1, status: 1 });
module.exports = mongoose.model("WeavingSizingBill", schema);
