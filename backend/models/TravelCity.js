const mongoose = require("mongoose");

const normalizeCityName = (value = "") =>
  String(value || "").trim().replace(/\s+/g, " ");

const travelCitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    },
    country: {
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
    deleteReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

travelCitySchema.pre("validate", function normalizeTravelCity(next) {
  this.name = normalizeCityName(this.name);
  this.normalizedName = this.name.toLocaleLowerCase();
  next();
});

travelCitySchema.index({ userId: 1, normalizedName: 1 }, { unique: true });
travelCitySchema.index({ userId: 1, isDeleted: 1, isActive: 1, name: 1 });

module.exports = mongoose.model("TravelCity", travelCitySchema);
module.exports.normalizeCityName = normalizeCityName;
