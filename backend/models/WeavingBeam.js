const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
    beamSetId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeamSet", required: true },
    sizingReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingReceipt", required: true },
    beamIndex: { type: Number, min: 1, required: true },
    beamNo: { type: String, trim: true, required: true },
    status: { type: String, enum: ["available", "knotting", "loaded", "completed"], default: "available" },
    knottingJobId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingKnottingJob", default: null },
    activeLoomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", default: null },
    loomNumber: { type: String, trim: true, default: "" },
    loadedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ userId: 1, sizingReceiptId: 1, beamIndex: 1 }, { unique: true });
schema.index({ userId: 1, activeLoomId: 1 }, { unique: true, partialFilterExpression: { activeLoomId: { $type: "objectId" }, status: "loaded" } });
schema.index({ userId: 1, loomNumber: 1 }, { unique: true, partialFilterExpression: { loomNumber: { $gt: "" }, status: "loaded" } });
module.exports = mongoose.model("WeavingBeam", schema);
