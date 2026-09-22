const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, moduleScope: { type: String, enum: ["weaving"], default: "weaving" },
  date: { type: String, required: true }, movementType: { type: String, enum: ["kacchi_out", "kacchi_return", "rejection_recovery", "rejection_reversal", "purchase_in", "sale_out", "sale_return", "quality_transfer_out", "quality_transfer_in"], required: true },
  category: { type: String, enum: ["normal", "b", "rejected", "cut_piece", "waste", "other"], default: "normal" },
  direction: { type: String, enum: ["in", "out"], required: true }, fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null }, ownershipType: { type: String, enum: ["own", "party"], required: true }, ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  meter: { type: Number, min: 0, required: true }, weightKg: { type: Number, min: 0, default: 0 }, thanCount: { type: Number, min: 0, default: 0 }, pieceCount: { type: Number, min: 0, default: 0 },
  kacchiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingKacchiParchi", default: null }, sourceFoldingEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFoldingEntry", default: null },
  pakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", default: null }, purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPurchaseInvoice", default: null }, purchaseLineId: { type: mongoose.Schema.Types.ObjectId, default: null }, rejectionReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingRejectionReceipt", default: null }, salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSalesInvoice", default: null }, stockAdjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingStockAdjustment", default: null }, stockAdjustmentNo: { type: String, trim: true, default: "" }, notes: { type: String, default: "" }, isVoided: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ userId: 1, fabricQualityId: 1, godownId: 1, category: 1, ownershipType: 1, isVoided: 1 });
schema.index({ userId: 1, rejectionReceiptId: 1, category: 1 }, { unique: true, partialFilterExpression: { rejectionReceiptId: { $type: "objectId" } } });
schema.index({ userId: 1, salesInvoiceId: 1 }, { unique: true, partialFilterExpression: { salesInvoiceId: { $type: "objectId" }, movementType: "sale_out" } });
schema.index({ userId: 1, kacchiId: 1, sourceFoldingEntryId: 1, movementType: 1 }, { unique: true, partialFilterExpression: { kacchiId: { $type: "objectId" }, sourceFoldingEntryId: { $type: "objectId" }, movementType: "kacchi_out", isVoided: false } });
schema.index({ userId: 1, purchaseInvoiceId: 1, purchaseLineId: 1, movementType: 1 }, { unique: true, partialFilterExpression: { purchaseInvoiceId: { $type: "objectId" }, purchaseLineId: { $type: "objectId" }, movementType: "purchase_in" } });
schema.index({ userId: 1, stockAdjustmentId: 1, movementType: 1 }, { unique: true, partialFilterExpression: { stockAdjustmentId: { $type: "objectId" } } });
module.exports = mongoose.model("WeavingFabricMovement", schema);
