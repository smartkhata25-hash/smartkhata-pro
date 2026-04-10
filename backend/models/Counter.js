const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    seq: {
      type: Number,
      default: 1000,
      min: 0,
    },
  },
  { timestamps: true },
);

// ✅ Compound Unique Index (type + userId)
counterSchema.index({ type: 1, userId: 1 }, { unique: true });

// Optional safety: prevent negative values
counterSchema.pre("save", function (next) {
  if (this.seq < 0) {
    this.seq = 1000;
  }
  next();
});

module.exports = mongoose.model("Counter", counterSchema);
