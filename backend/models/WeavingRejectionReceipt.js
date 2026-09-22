const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, receiptNo: { type: String, required: true }, requestKey: { type: String, required: true }, receiptDate: { type: String, required: true },
  dueId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingRejectionDue", required: true }, pakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", required: true }, partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true }, fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true }, godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null }, ownershipType: { type: String, enum: ["own", "party"], required: true }, ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  receivedMeter: { type: Number, min: 0.000001, required: true }, receivedKg: { type: Number, min: 0, default: 0 }, pieceCount: { type: Number, min: 0, default: 0 },
  normalMeter: { type: Number, min: 0, default: 0 }, normalKg: { type: Number, min: 0, default: 0 }, normalPieces: { type: Number, min: 0, default: 0 },
  rejectedMeter: { type: Number, min: 0, default: 0 }, rejectedKg: { type: Number, min: 0, default: 0 }, rejectedPieces: { type: Number, min: 0, default: 0 },
  cutPieceMeter: { type: Number, min: 0, default: 0 }, cutPieceKg: { type: Number, min: 0, default: 0 }, cutPiecePieces: { type: Number, min: 0, default: 0 },
  wasteMeter: { type: Number, min: 0, default: 0 }, wasteKg: { type: Number, min: 0, default: 0 }, wastePieces: { type: Number, min: 0, default: 0 },
  remainingPendingMeter: { type: Number, min: 0, required: true }, notes: { type: String, default: "" }, status: { type: String, enum: ["posted", "reversed"], default: "posted" },
  reversedAt: { type: Date, default: null }, reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, reversalReason: { type: String, default: "" },
}, { timestamps: true });
schema.index({ userId: 1, receiptNo: 1 }, { unique: true }); schema.index({ userId: 1, requestKey: 1 }, { unique: true }); schema.index({ userId: 1, dueId: 1, receiptDate: -1 });
module.exports = mongoose.model("WeavingRejectionReceipt", schema);
