const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  key: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });
schema.index({ userId: 1, key: 1 }, { unique: true });
module.exports = mongoose.model("WeavingStockLock", schema);
