const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  productionTrackingMode: { type: String, enum: ["detailed", "loom_wise", "quality_total"], default: "detailed" },
  simpleProductionOwnershipType: { type: String, enum: ["own", "party"], default: "own" },
  simpleProductionOwnerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  simpleProductionGodownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
}, { timestamps: true });

module.exports = mongoose.model("WeavingSettings", schema);
