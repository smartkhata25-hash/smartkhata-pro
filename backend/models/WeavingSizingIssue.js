const mongoose = require("mongoose");

const lineSchema = new mongoose.Schema({
  yarnId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarn", required: true },
  quantityKg: { type: Number, min: 0.000001, required: true },
  bags: { type: Number, min: 0, default: 0 },
  packageType: { type: String, enum: ["", "bag", "carton"], default: "" },
  packageQty: { type: Number, min: 0, default: 0 },
  coneSize: { type: String, enum: ["", "small", "large"], default: "" },
  conesPerPackage: { type: Number, min: 0, default: 0 },
  extraCones: { type: Number, min: 0, default: 0 },
  totalCones: { type: Number, min: 0, default: 0 },
  smallCones: { type: Number, min: 0, default: 0 },
  largeCones: { type: Number, min: 0, default: 0 },
  lotReference: { type: String, trim: true, default: "" },
  sourceGodownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  sourcePurchaseLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
  ownershipType: { type: String, enum: ["own", "party"], default: "own" },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
}, { _id: true });

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  issueNo: { type: String, required: true },
  date: { type: String, required: true },
  sizingPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", required: true },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  gatePassNo: { type: String, trim: true, default: "" },
  notes: { type: String, trim: true, default: "" },
  lines: { type: [lineSchema], validate: [(rows) => rows.length > 0, "Add at least one yarn line"] },
  movementIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarnMovement" }],
  sourceType: { type: String, enum: ["manual", "direct_purchase"], default: "manual" },
  sourcePurchaseId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPurchaseInvoice", default: null },
  status: { type: String, enum: ["posted", "void"], default: "posted" },
  voidedAt: { type: Date, default: null },
}, { timestamps: true });

schema.index({ userId: 1, issueNo: 1 }, { unique: true });
schema.index({ userId: 1, sizingPartyId: 1, date: -1 });
schema.index({ userId: 1, sourcePurchaseId: 1 });
module.exports = mongoose.model("WeavingSizingIssue", schema);
