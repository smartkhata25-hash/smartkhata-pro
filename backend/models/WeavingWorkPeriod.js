const mongoose = require("mongoose");

const weavingWorkPeriodSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  moduleScope: { type: String, enum: ["weaving"], default: "weaving", index: true },
  startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/, index: true },
  endDate: { type: String, default: "", match: /^$|^\d{4}-\d{2}-\d{2}$/ },
  status: { type: String, enum: ["active", "closed"], default: "active", index: true },
  note: { type: String, trim: true, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

weavingWorkPeriodSchema.index({ userId: 1, moduleScope: 1, startDate: 1 }, { unique: true });
module.exports = mongoose.model("WeavingWorkPeriod", weavingWorkPeriodSchema);
