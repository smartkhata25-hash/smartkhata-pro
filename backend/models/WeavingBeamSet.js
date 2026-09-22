const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
    sizingReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingReceipt", required: true },
    receiptNo: { type: String, trim: true, required: true },
    setNo: { type: String, trim: true, default: "" },
    sizingPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
    contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
    fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", default: null },
    count: { type: String, trim: true, default: "" },
    loomSize: { type: String, trim: true, default: "" },
    ends: { type: Number, min: 0, default: 0 },
    length: { type: Number, min: 0, default: 0 },
    beamCount: { type: Number, min: 1, required: true },
    status: { type: String, enum: ["available", "knotting", "loaded", "completed"], default: "available" },
  },
  { timestamps: true },
);

schema.index({ userId: 1, sizingReceiptId: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, createdAt: -1 });
module.exports = mongoose.model("WeavingBeamSet", schema);
