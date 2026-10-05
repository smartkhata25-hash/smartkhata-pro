const mongoose = require("mongoose");

const weavingPayrollOperationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  operationKey: { type: String, required: true, trim: true },
  kind: { type: String, enum: ["finalize_range"], default: "finalize_range" },
  result: { type: mongoose.Schema.Types.Mixed, default: null },
}, { timestamps: true });

weavingPayrollOperationSchema.index(
  { userId: 1, operationKey: 1 },
  { unique: true },
);

module.exports = mongoose.model("WeavingPayrollOperation", weavingPayrollOperationSchema);
