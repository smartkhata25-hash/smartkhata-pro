const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["sales", "purchase"], required: true },
    purchaseItemType: { type: String, enum: ["yarn", "fabric"], default: "yarn" },
    contractType: { type: String, enum: ["fabric_sale", "conversion"], default: "fabric_sale" },
    contractNo: { type: String, required: true, trim: true },
    entryNo: { type: Number, min: 1 },
    yarnCount: { type: String, trim: true, default: "" },
    requestKey: { type: String, trim: true },
    contractDate: { type: String, required: true },
    partyName: { type: String, required: true, trim: true },
    partyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    itemName: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0.000001, required: true },
    unit: { type: String, enum: ["KG", "Meter", "Yard"], required: true },
    rate: { type: Number, min: 0, required: true },
    brokerName: { type: String, trim: true, default: "" },
    commissionPercent: { type: Number, min: 0, max: 100, default: 0 },
    creditDays: { type: Number, min: 0, default: 0 },
    paymentTerms: { type: String, trim: true, default: "" },
    packingTerms: { type: String, trim: true, default: "" },
    deliveryTerms: { type: String, trim: true, default: "" },
    expiryDate: { type: String, default: "" },
    status: { type: String, enum: ["active", "complete", "expired"], default: "active" },
    sourceEntryUnit: { type: String, enum: ["KG", "LBS", "Meter", "Yard"], default: "KG" },
    deliveryDate: { type: String, default: "" },
    notes: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

schema.index({ userId: 1, type: 1, contractNo: 1 }, { unique: true });
schema.index({ userId: 1, type: 1, entryNo: 1 }, { unique: true, partialFilterExpression: { entryNo: { $type: "number" } } });
schema.index({ userId: 1, requestKey: 1 }, { unique: true, sparse: true });
schema.index({ userId: 1, type: 1, contractDate: -1 });
schema.index({ userId: 1, partyName: 1, itemId: 1 });
module.exports = mongoose.model("WeavingContract", schema);
