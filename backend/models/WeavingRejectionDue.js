const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true }, pakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true }, contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", required: true }, fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  qualitySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} }, ownershipType: { type: String, enum: ["own", "party"], required: true }, ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null }, godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  pakkiDate: { type: String, required: true }, originalRejectionMeter: { type: Number, min: 0.000001, required: true }, receivedMeter: { type: Number, min: 0, default: 0 }, pendingMeter: { type: Number, min: 0, required: true }, lastReceiptDate: { type: String, default: "" },
  status: { type: String, enum: ["pending", "partial", "received", "closed"], default: "pending" }, closeReason: { type: String, default: "" }, notes: { type: String, default: "" },
}, { timestamps: true });
schema.index({ userId: 1, pakkiId: 1 }, { unique: true }); schema.index({ userId: 1, status: 1, pakkiDate: 1 });
module.exports = mongoose.model("WeavingRejectionDue", schema);
