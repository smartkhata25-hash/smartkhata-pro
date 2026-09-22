const mongoose = require("mongoose");

const weavingUnitSchema = new mongoose.Schema(
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
    unitNo: {
      type: Number,
      required: true,
      min: 1,
    },
    name: {
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

weavingUnitSchema.index(
  { userId: 1, moduleScope: 1, unitNo: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

weavingUnitSchema.pre("validate", function (next) {
  if (this.name) {
    this.name = String(this.name).trim();
  }

  next();
});

module.exports = mongoose.model("WeavingUnit", weavingUnitSchema);
