const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  productionMode: { type: String, enum: ["loom_wise", "quality_total"], required: true },
  date: { type: String, required: true },
  loomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", required: true },
  ownershipType: { type: String, enum: ["own", "party"], required: true },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  meter: { type: Number, min: 0.000001, required: true },
  weightKg: { type: Number, min: 0.000001, required: true },
  weightLbs: { type: Number, min: 0.000001, required: true },
  category: { type: String, enum: ["normal"], default: "normal" },
  status: { type: String, enum: ["posted", "void"], default: "posted" },
  stockMovementId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricMovement", default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidedAt: { type: Date, default: null },
  voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  voidReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

schema.index({ userId: 1, productionMode: 1, date: 1, loomId: 1, fabricQualityId: 1, ownershipType: 1, ownerPartyId: 1 }, { unique: true, partialFilterExpression: { status: "posted", productionMode: "loom_wise" }, name: "one_active_loom_quality_daily_total" });
schema.index({ userId: 1, productionMode: 1, date: 1, fabricQualityId: 1, ownershipType: 1, ownerPartyId: 1 }, { unique: true, partialFilterExpression: { status: "posted", productionMode: "quality_total" }, name: "one_active_quality_daily_total" });
schema.index({ userId: 1, date: -1, status: 1 });

module.exports = mongoose.model("WeavingProductionEntry", schema);
