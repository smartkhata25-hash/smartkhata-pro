const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
  yarnId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarn", required: true },
  date: { type: String, required: true },
  movementType: { type: String, enum: ["purchase_in", "party_inward", "sizing_issue", "sizing_receipt", "sizing_return", "sale_out", "sale_return", "transfer_out", "transfer_in", "rewinder_recovery", "weft_consumption", "weft_consumption_reversal"], required: true },
  salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSalesInvoice", default: null },
  ownershipType: { type: String, enum: ["own", "party"], required: true },
  ownerPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingPurchaseInvoice", default: null },
  sizingIssueId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingIssue", default: null },
  sizingReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingReceipt", default: null },
  partyReturnNo: { type: String, trim: true, default: "" },
  stockAdjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingStockAdjustment", default: null },
  stockAdjustmentNo: { type: String, trim: true, default: "" },
  requestKey: { type: String, trim: true, default: null },
  requestLineKey: { type: String, trim: true, default: "" },
  consumptionBatchId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reversalOfMovementId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingYarnMovement", default: null },
  loomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", default: null },
  beamId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeam", default: null },
  beamSetId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeamSet", default: null },
  fabricQualityId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingFabricQuality", default: null },
  contractId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingContract", default: null },
  quantityKg: { type: Number, min: 0.000001, required: true },
  packageType: { type: String, enum: ["", "bag", "carton"], default: "" },
  packageQty: { type: Number, min: 0, default: 0 },
  coneSize: { type: String, enum: ["", "small", "large"], default: "" },
  conesPerPackage: { type: Number, min: 0, default: 0 },
  extraCones: { type: Number, min: 0, default: 0 },
  totalCones: { type: Number, min: 0, default: 0 },
  smallCones: { type: Number, min: 0, default: 0 },
  largeCones: { type: Number, min: 0, default: 0 },
  returnNo: { type: String, trim: true, default: "" },
  rate: { type: Number, min: 0, default: 0 },
  destinationType: { type: String, enum: ["godown", "direct_sizing"], default: "godown" },
  godownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  sizingPartyId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingParty", default: null },
  sourceGodownId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingGodown", default: null },
  lotReference: { type: String, trim: true, default: "" }, notes: { type: String, trim: true, default: "" },
  isVoided: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ userId: 1, purchaseInvoiceId: 1, yarnId: 1 });
schema.index({ userId: 1, yarnId: 1, ownerPartyId: 1, date: -1 });
schema.index({ userId: 1, yarnId: 1, godownId: 1, ownershipType: 1, ownerPartyId: 1, isVoided: 1 });
schema.index({ userId: 1, yarnId: 1, sourceGodownId: 1, ownershipType: 1, ownerPartyId: 1, isVoided: 1 });
schema.index({ userId: 1, salesInvoiceId: 1, movementType: 1 }, { unique: true, partialFilterExpression: { salesInvoiceId: { $type: "objectId" }, movementType: "sale_out" } });
schema.index({ userId: 1, stockAdjustmentId: 1, movementType: 1 }, { unique: true, partialFilterExpression: { stockAdjustmentId: { $type: "objectId" } } });
schema.index({ userId: 1, requestKey: 1, requestLineKey: 1 }, { unique: true, partialFilterExpression: { requestKey: { $type: "string" } } });
schema.index({ userId: 1, reversalOfMovementId: 1 }, { unique: true, partialFilterExpression: { reversalOfMovementId: { $type: "objectId" } } });
schema.index({ userId: 1, beamSetId: 1, movementType: 1, date: 1 });
module.exports = mongoose.model("WeavingYarnMovement", schema);
