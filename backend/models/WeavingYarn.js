const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    count: { type: String, required: true, trim: true },
    quality: { type: String, trim: true, default: "" },
    millBrand: { type: String, trim: true, default: "" },
    lotReference: { type: String, trim: true, default: "" },
    stockUnit: { type: String, enum: ["KG"], default: "KG" },
    openingRate: { type: Number, min: 0, default: 0 },
    defaultPackageType: { type: String, enum: ["", "bag", "carton"], default: "" },
    largeConesPerPackage: { type: Number, min: 0, default: 0 },
    smallConesPerPackage: { type: Number, min: 0, default: 0 },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, name: 1 });
schema.index({ userId: 1, quality: 1, millBrand: 1, count: 1, isActive: 1 });
module.exports = mongoose.model("WeavingYarn", schema);
