const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  transactionNo: { type: String, required: true }, type: { type: String, enum: ["receive", "pay"], required: true },
  requestKey: { type: String, trim: true, default: null },
  date: { type: String, required: true }, partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
  purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPurchaseInvoice", default: null },
  sizingBillId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingBill", default: null },
  salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSalesInvoice", default: null },
  amount: { type: Number, min: 0.01, required: true }, paymentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
  paymentMethod: { type: String, enum: ["cash", "bank", "online", "cheque"], default: "cash" },
  description: { type: String, default: "" }, attachmentUrl: { type: String, default: "" }, journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", required: true },
  attachments: { type: [{ key: String, type: String, size: Number, originalName: String }], default: [] },
  chequeNo: { type: String, trim: true, default: "" }, chequeBank: { type: String, trim: true, default: "" },
  chequeDate: { type: String, default: "" }, chequeDueDate: { type: String, default: "" },
  chequeStatus: { type: String, enum: ["", "pending", "cleared", "bounced"], default: "" },
  status: { type: String, enum: ["posted", "void"], default: "posted" }, voidedAt: { type: Date, default: null },
  voidReason: { type: String, trim: true, default: "" },
  reversalJournalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
}, { timestamps: true });
schema.index({ userId: 1, transactionNo: 1 }, { unique: true });
schema.index({ userId: 1, partyId: 1, date: -1 });
schema.index({ userId: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } });
module.exports = mongoose.model("WeavingMoneyTransaction", schema);
