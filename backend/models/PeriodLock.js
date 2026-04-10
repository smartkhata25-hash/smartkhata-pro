const mongoose = require("mongoose");

const periodLockSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  year: {
    type: Number,
    required: true,
  },
  month: {
    type: Number, // 0 = Jan, 11 = Dec
    required: true,
  },
  lockedAt: {
    type: Date,
    default: Date.now,
  },
});

periodLockSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("PeriodLock", periodLockSchema);
