const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleScope: {
      type: String,
      enum: ["weaving"],
      default: "weaving",
      immutable: true,
    },
    entityType: {
      type: String,
      enum: [
        "yarn_opening",
        "yarn_movement",
        "beam_set",
        "folding",
        "fabric_opening",
        "fabric_movement",
        "sales_invoice",
        "yarn_inventory",
        "fabric_inventory",
        "costing_run",
      ],
      required: true,
    },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    entityKey: { type: String, required: true, trim: true },
    runToken: { type: String, required: true, index: true },
    costingVersion: { type: Number, default: 1, min: 1 },
    date: { type: String, default: "" },
    scope: {
      type: String,
      enum: ["combined", "own", "conversion", "other"],
      default: "combined",
    },
    ownershipType: {
      type: String,
      enum: ["", "own", "party"],
      default: "",
    },
    ownerPartyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingParty",
      default: null,
    },
    dimensions: { type: mongoose.Schema.Types.Mixed, default: {} },
    quantity: {
      kg: { type: Number, default: 0 },
      meter: { type: Number, default: 0 },
      than: { type: Number, default: 0 },
      pieces: { type: Number, default: 0 },
    },
    components: {
      material: { type: Number, default: 0 },
      warp: { type: Number, default: 0 },
      weft: { type: Number, default: 0 },
      sizing: { type: Number, default: 0 },
      knotting: { type: Number, default: 0 },
      otherDirect: { type: Number, default: 0 },
      processing: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      knownTotal: { type: Number, default: 0 },
    },
    unitCostKg: { type: Number, default: null },
    unitCostMeter: { type: Number, default: null },
    inventoryValue: { type: Number, default: 0 },
    knownInventoryValue: { type: Number, default: 0 },
    grossProfit: { type: Number, default: null },
    costStatus: {
      type: String,
      enum: ["complete", "partial", "pending_source_cost", "not_applicable"],
      required: true,
    },
    allocationBasis: {
      type: String,
      enum: ["", "kg", "meter_fallback", "weighted_average", "actual_source", "not_applicable"],
      default: "",
    },
    missingReasons: { type: [String], default: [] },
    sourceRefs: { type: mongoose.Schema.Types.Mixed, default: {} },
    calculatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

schema.index(
  { userId: 1, entityType: 1, entityKey: 1, costingVersion: 1 },
  { unique: true },
);
schema.index({ userId: 1, entityType: 1, date: 1, runToken: 1 });

module.exports = mongoose.model("WeavingCostSnapshot", schema);
