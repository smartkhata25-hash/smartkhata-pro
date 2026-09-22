const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  receiptNo: { type: String, required: true },
  date: { type: String, required: true },
  sizingPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
  issueId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingIssue", required: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", default: null },
  count: { type: String, trim: true, default: "" },
  setNo: { type: String, trim: true, default: "" },
  loomSize: { type: String, trim: true, default: "" },
  ends: { type: Number, min: 0, default: 0 },
  length: { type: Number, min: 0, default: 0 },
  weightPerBag: { type: Number, min: 0, default: 0 },
  setBeams: { type: Number, min: 0, default: 0 },
  backBeams: { type: Number, min: 0, default: 0 },
  yarnGrossWeightKg: { type: Number, min: 0, default: 0 },
  gullaBags: { type: Number, min: 0, default: 0 },
  gullaWeightKg: { type: Number, min: 0, default: 0 },
  packingWeightKg: { type: Number, min: 0, default: 0 },
  bardanaWeightKg: { type: Number, min: 0, default: 0 },
  netWeightKg: { type: Number, min: 0, default: 0 },
  beamCount: { type: Number, min: 1, required: true },
  beamDetails: { type: Array, default: [] },
  returnItems: { type: Array, default: [] },
  movementIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarnMovement" }],
  notes: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["posted", "void"], default: "posted" },
  voidedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, receiptNo: 1 }, { unique: true });
schema.index({ userId: 1, sizingPartyId: 1, date: -1 });
module.exports = mongoose.model("WeavingSizingReceipt", schema);
