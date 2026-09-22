const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema({
  foldingEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFoldingEntry", required: true },
  thanNo: { type: String, required: true, trim: true },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  qualitySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  grade: { type: String, enum: ["a", "b", "rejected"], default: "a" },
  category: { type: String, enum: ["normal", "b", "rejected"], default: "normal" },
  meter: { type: Number, min: 0.000001, required: true },
  weightKg: { type: Number, min: 0, default: 0 },
  weightLbs: { type: Number, min: 0, default: 0 },
  thanCount: { type: Number, min: 0, default: 1 },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  ownershipType: { type: String, enum: ["own", "party"], required: true },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
}, { _id: true });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  requestKey: { type: String, trim: true, default: null },
  kacchiNo: { type: String, required: true, trim: true },
  dispatchDate: { type: String, required: true },
  partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  qualitySnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  ownershipType: { type: String, enum: ["own", "party"], required: true },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  lines: { type: [lineSchema], validate: [(value) => value.length > 0, "Select at least one Than"] },
  totalThan: { type: Number, min: 0, required: true },
  totalMeter: { type: Number, min: 0.000001, required: true },
  totalKg: { type: Number, min: 0, default: 0 },
  totalLbs: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ["confirmed", "pakki_finalized", "void"], default: "confirmed" },
  pakkiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPakkiSettlement", default: null },
  notes: { type: String, trim: true, default: "" },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

schema.index({ userId: 1, kacchiNo: 1 }, { unique: true });
schema.index({ userId: 1, requestKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } });
schema.index({ userId: 1, status: 1, dispatchDate: -1 });
module.exports = mongoose.model("WeavingKacchiParchi", schema);
