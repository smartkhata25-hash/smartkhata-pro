const mongoose = require("mongoose");

const OPTION_TYPES = [
  "yarn_mill_brand",
  "yarn_quality",
  "fabric_weave",
  "loom_brand",
  "loom_model",
  "loom_type",
];

const normalizeOptionValue = (value = "") =>
  String(value || "").trim().replace(/\s+/g, " ");

const schema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: OPTION_TYPES,
      required: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    normalizedValue: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

schema.index(
  { userId: 1, type: 1, normalizedValue: 1 },
  { unique: true, name: "weaving_master_option_unique" },
);

schema.pre("validate", function normalizeValue(next) {
  this.value = normalizeOptionValue(this.value);
  this.normalizedValue = this.value.toLocaleLowerCase("en");
  next();
});

module.exports = mongoose.model("WeavingMasterOption", schema);
module.exports.OPTION_TYPES = OPTION_TYPES;
module.exports.normalizeOptionValue = normalizeOptionValue;
