const mongoose = require("mongoose");

const PAYMENT_METHODS = ["monthly", "per_beam", "per_set", "monthly_per_beam", "monthly_per_set"];
const schema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    moduleScope: { type: String, enum: ["weaving"], default: "weaving", immutable: true },
    beamSetId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeamSet", required: true },
    sizingReceiptId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingSizingReceipt", required: true },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true },
    loomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", default: null },
    beamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeam" }],
    beamAssignments: [{
      _id: false,
      beamId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingBeam", required: true },
      loomId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingLoom", default: null },
      loomNumber: { type: String, trim: true, default: "" },
    }],
    workDate: { type: String, required: true },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    completedBeams: { type: Number, min: 0, default: 0 },
    rate: { type: Number, min: 0, default: 0 },
    amount: { type: Number, min: 0, default: 0 },
    earningKind: { type: String, enum: ["none", "piece", "bonus"], default: "none" },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["draft", "approved", "void"], default: "draft" },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
    reversalJournalEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" }],
    approvedAt: { type: Date, default: null }, approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    voidedAt: { type: Date, default: null }, voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null }, voidReason: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

schema.index({ userId: 1, employeeId: 1, workDate: 1, status: 1 });
schema.index({ userId: 1, beamSetId: 1, status: 1 });
module.exports = mongoose.model("WeavingKnottingJob", schema);
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
