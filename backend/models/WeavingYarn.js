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
    defaultPackageType: { type: String, trim: true, lowercase: true, default: "bag" },
    packagingProfiles: [{
      packageType: { type: String, required: true, trim: true, lowercase: true },
      packageWeight: { type: Number, min: 0, default: 100 },
      largeConesPerPackage: { type: Number, min: 0, default: 24 },
      smallConesPerPackage: { type: Number, min: 0, default: 40 },
    }],
    packageWeight: { type: Number, min: 0, default: 100 },
    packageWeightUnit: { type: String, enum: ["LBS"], default: "LBS" },
    largeConesPerPackage: { type: Number, min: 0, default: 24 },
    smallConesPerPackage: { type: Number, min: 0, default: 40 },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, name: 1 });
schema.index({ userId: 1, quality: 1, millBrand: 1, count: 1, isActive: 1 });
module.exports = mongoose.model("WeavingYarn", schema);
