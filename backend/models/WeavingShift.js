const mongoose = require("mongoose");

const weavingShiftSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleScope: {
      type: String,
      enum: ["weaving"],
      default: "weaving",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    startTime: {
      type: String,
      trim: true,
      default: "",
    },
    endTime: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

weavingShiftSchema.index(
  { userId: 1, moduleScope: 1, normalizedName: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

weavingShiftSchema.pre("validate", function (next) {
  if (this.name) {
    this.name = String(this.name).trim();
    this.normalizedName = this.name.toLowerCase();
  }
  if (this.startTime) this.startTime = String(this.startTime).trim();
  if (this.endTime) this.endTime = String(this.endTime).trim();

  next();
});

module.exports = mongoose.model("WeavingShift", weavingShiftSchema);
