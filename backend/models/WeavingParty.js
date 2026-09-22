const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true, trim: true },
  normalizedName: { type: String, required: true, trim: true },
  role: { type: String, enum: ["customer", "supplier", "both"], default: "both" },
  serviceTypes: [{ type: String, enum: ["sizing"] }],
  phone: { type: String, trim: true, default: "" },
  email: { type: String, trim: true, lowercase: true, default: "" },
  address: { type: String, trim: true, default: "" },
  openingBalance: { type: Number, min: 0, default: 0 },
  balanceType: { type: String, enum: ["receivable", "payable"], default: "receivable" },
  accountId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null },
  openingJournalId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
  notes: { type: String, trim: true, default: "" },
  isActive: { type: Boolean, default: true },
  isHidden: { type: Boolean, default: false },
  hiddenAt: { type: Date, default: null },
  hiddenReason: { type: String, trim: true, default: "" },
}, { timestamps: true });

schema.index({ userId: 1, normalizedName: 1, role: 1 }, { unique: true });
schema.index({ userId: 1, role: 1, isActive: 1, name: 1 });
schema.index({ userId: 1, accountId: 1 });
module.exports = mongoose.model("WeavingParty", schema);
