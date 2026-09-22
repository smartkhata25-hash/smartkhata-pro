const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  invoiceNo: { type: String, required: true, trim: true }, invoiceDate: { type: String, required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true }, partyName: { type: String, required: true },
  saleSource: { type: String, enum: ["pakki", "direct"], required: true },
  saleNature: { type: String, enum: ["conversion", "fabric", "yarn", "other"], required: true },
  fabricCategory: { type: String, enum: ["normal", "b"], default: "normal" },
  otherSubtype: { type: String, enum: ["", "rejected", "cut_piece", "waste", "other"], default: "" },
  pakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", default: null },
  sourcePakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", default: null },
  replacesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSalesInvoice", default: null },
  activeForPakki: { type: Boolean, default: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", default: null },
  yarnId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarn", default: null },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  ownershipType: { type: String, enum: ["own", "party"], default: "own" },
  description: { type: String, trim: true, default: "" }, qualitySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  weightKg: { type: Number, min: 0, default: 0 }, thanCount: { type: Number, min: 0, default: 0 }, pieceCount: { type: Number, min: 0, default: 0 },
  quantity: { type: Number, min: 0.000001, required: true }, uom: { type: String, enum: ["Meter", "KG", "Piece", "Nos", "Job", "Other"], required: true },
  originalRate: { type: Number, min: 0, required: true }, finalRate: { type: Number, min: 0, required: true },
  rateOverrideReason: { type: String, trim: true, default: "" }, rateChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, rateChangedAt: { type: Date, default: null },
  subtotal: { type: Number, min: 0, required: true }, discountAmount: { type: Number, min: 0, default: 0 }, taxAmount: { type: Number, min: 0, default: 0 }, grandTotal: { type: Number, min: 0, required: true },
  creditDays: { type: Number, min: 0, default: 0 }, dueDate: { type: String, default: "" }, notes: { type: String, trim: true, default: "" },
  paidAmount: { type: Number, min: 0, default: 0 }, balanceDue: { type: Number, min: 0, default: 0 }, paymentStatus: { type: String, enum: ["unpaid", "partial", "paid"], default: "unpaid" },
  saleTerms: { type: String, enum: ["credit", "paid", "partial"], default: "credit" },
  receivedNowRequested: { type: Number, min: 0, default: 0 }, paymentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null }, paymentMethod: { type: String, enum: ["", "cash", "bank", "online", "cheque"], default: "" }, receiptRequestKey: { type: String, default: "" },
  status: { type: String, enum: ["draft", "posting", "posted", "void"], default: "draft" },
  journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
  stockMovementId: { type: mongoose.Schema.Types.ObjectId, default: null }, stockMovementModel: { type: String, default: "" },
  postedAt: { type: Date, default: null }, postedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidedAt: { type: Date, default: null }, voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, voidReason: { type: String, default: "" }, reversalJournalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
}, { timestamps: true });
schema.index({ userId: 1, invoiceNo: 1 }, { unique: true });
schema.index({ userId: 1, sourcePakkiId: 1, activeForPakki: 1 }, { unique: true, partialFilterExpression: { sourcePakkiId: { $type: "objectId" }, activeForPakki: true } });
schema.index({ userId: 1, status: 1, invoiceDate: -1 });
module.exports = mongoose.model("WeavingSalesInvoice", schema);
