const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  thanNo: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  loomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", required: true },
  beamId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeam", default: null },
  beamSetId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeamSet", default: null },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  ownershipType: { type: String, enum: ["own", "party"], default: "own" },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  checkedByEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  qualitySnapshot: { name: { type: String, default: "" }, code: { type: String, default: "" }, warpCount: { type: String, default: "" }, weftCount: { type: String, default: "" }, construction: { type: String, default: "" }, width: { type: String, default: "" }, brand: { type: String, default: "" }, cadReference: { type: String, default: "" } },
  loomNumberSnapshot: { type: String, default: "" }, beamNoSnapshot: { type: String, default: "" }, setNoSnapshot: { type: String, default: "" }, contractNoSnapshot: { type: String, default: "" },
  meter: { type: Number, min: 0.000001, required: true }, weightKg: { type: Number, min: 0.000001, required: true }, weightLbs: { type: Number, min: 0.000001, required: true },
  grade: { type: String, enum: ["a", "b", "rejected", "partial"], default: "a" },
  goodMeter: { type: Number, min: 0, default: 0 }, bGradeMeter: { type: Number, min: 0, default: 0 }, rejectedMeter: { type: Number, min: 0, default: 0 },
  defectReason: { type: String, trim: true, default: "" }, notes: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["posted", "void"], default: "posted" },
  activeKacchiId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingKacchiParchi", default: null },
  dispatchStatus: { type: String, enum: ["available", "kacchi_out"], default: "available" },
  voidedAt: { type: Date, default: null }, voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, voidReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

schema.index({ userId: 1, thanNo: 1 }, { unique: true });
schema.index({ userId: 1, date: -1, status: 1 });
schema.index({ userId: 1, fabricQualityId: 1, godownId: 1, grade: 1, status: 1 });
schema.index({ userId: 1, loomId: 1, date: -1, status: 1 });
schema.index({ userId: 1, status: 1, dispatchStatus: 1, fabricQualityId: 1, godownId: 1 });
module.exports = mongoose.model("WeavingFoldingEntry", schema);
