const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    loomNumber: { type: String, required: true, trim: true },
    normalizedName: { type: String, required: true, trim: true },
    brand: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: "" },
    loomType: { type: String, trim: true, default: "" },
    reedSpace: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

schema.index({ userId: 1, normalizedName: 1 }, { unique: true });
schema.index({ userId: 1, loomNumber: 1 }, { unique: true });
schema.index({ userId: 1, brand: 1, loomType: 1, isActive: 1 });
module.exports = mongoose.model("WeavingLoom", schema);
