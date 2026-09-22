const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemType: { type: String, enum: ["yarn", "fabric"], required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", required: true },
    transactionType: { type: String, enum: ["opening"], default: "opening" },
    quantity: { type: Number, min: 0, required: true },
    unit: { type: String, enum: ["KG", "Meter", "Yard"], required: true },
    rate: { type: Number, min: 0, default: 0 },
    sourceEntryUnit: { type: String, enum: ["KG", "LBS", "Meter", "Yard"], default: "KG" },
    packageType: { type: String, enum: ["", "bag", "carton"], default: "" },
    packageQty: { type: Number, min: 0, default: 0 },
    smallCones: { type: Number, min: 0, default: 0 },
    largeCones: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

schema.index(
  { userId: 1, itemType: 1, itemId: 1, godownId: 1, transactionType: 1 },
  { unique: true },
);
schema.index({ userId: 1, godownId: 1, itemType: 1 });
module.exports = mongoose.model("WeavingStockTransaction", schema);
