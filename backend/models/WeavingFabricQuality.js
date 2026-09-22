const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
    construction: { type: String, trim: true, default: "" },
    width: { type: String, trim: true, default: "" },
    weave: { type: String, trim: true, default: "" },
    warpCount: { type: String, trim: true, default: "" },
    weftCount: { type: String, trim: true, default: "" },
    brand: { type: String, trim: true, default: "" },
    cadReference: { type: String, trim: true, default: "" },
    primaryUnit: { type: String, enum: ["Meter", "Yard", "KG"], default: "Meter" },
    openingRate: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, name: 1 });
schema.index({ userId: 1, code: 1 });
schema.index({ userId: 1, primaryUnit: 1, isActive: 1 });
module.exports = mongoose.model("WeavingFabricQuality", schema);
