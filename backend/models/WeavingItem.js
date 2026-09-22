const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, trim: true },
  category: { type: String, enum: ["part", "other"], required: true },
  description: { type: String, trim: true, default: "" },
  unit: { type: String, trim: true, default: "Nos" },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });
schema.index({ userId: 1, normalizedName: 1, category: 1 }, { unique: true });
module.exports = mongoose.model("WeavingItem", schema);
