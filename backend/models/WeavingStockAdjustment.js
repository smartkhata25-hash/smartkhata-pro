const mongoose = require("mongoose");

const bucketSchema = new mongoose.Schema({
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", default: null },
  yarnId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarn", default: null },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  category: { type: String, enum: ["normal", "b", "rejected", "cut_piece", "waste", "other", ""], default: "" },
  ownershipType: { type: String, enum: ["own", "party"], default: "own" },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
}, { _id: false });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  kind: { type: String, enum: ["fabric_transfer", "yarn_transfer", "rewinder_recovery"], required: true },
  adjustmentNo: { type: String, required: true, trim: true },
  requestKey: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  source: { type: bucketSchema, default: null },
  destination: { type: bucketSchema, required: true },
  meter: { type: Number, min: 0, default: 0 },
  weightKg: { type: Number, min: 0, default: 0 },
  thanCount: { type: Number, min: 0, default: 0 },
  pieceCount: { type: Number, min: 0, default: 0 },
  quantityKg: { type: Number, min: 0, default: 0 },
  packageQty: { type: Number, min: 0, default: 0 },
  smallCones: { type: Number, min: 0, default: 0 },
  largeCones: { type: Number, min: 0, default: 0 },
  recoveredCones: { type: Number, min: 0, default: 0 },
  coneType: { type: String, enum: ["", "small", "large", "mixed"], default: "" },
  recoverySource: { type: String, enum: ["", "sizing_leftover", "partial_loose", "other"], default: "" },
  sourceReference: { type: String, trim: true, default: "" },
  recoverySourceKey: { type: String, trim: true, default: null },
  vendorPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  referenceRate: { type: Number, min: 0, default: 0 },
  referenceValue: { type: Number, min: 0, default: 0 },
  reason: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["posted", "reversed"], default: "posted" },
  movementIds: [{ type: mongoose.Schema.Types.ObjectId }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reversalReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

schema.index({ userId: 1, requestKey: 1 }, { unique: true });
schema.index({ userId: 1, adjustmentNo: 1 }, { unique: true });
schema.index({ userId: 1, kind: 1, date: -1, createdAt: -1 });
schema.index({ userId: 1, recoverySourceKey: 1 }, { unique: true, partialFilterExpression: { recoverySourceKey: { $type: "string" } } });

module.exports = mongoose.model("WeavingStockAdjustment", schema);
