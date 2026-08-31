const mongoose = require("mongoose");
const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
} = require("../config/travelConfig");

const travelServiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelServiceCategory",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    description: {
      type: String,
      trim: true,
      default: "",
    },

    defaultSellingPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaultSellingCurrency: {
      type: String,
      uppercase: true,
      enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
      default: DEFAULT_TRAVEL_CURRENCY,
    },

    defaultCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    defaultCostCurrency: {
      type: String,
      uppercase: true,
      enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
      default: DEFAULT_TRAVEL_CURRENCY,
    },

    accountingMode: {
      type: String,
      enum: ["principal", "commission"],
      default: "principal",
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
  {
    timestamps: true,
  },
);

travelServiceSchema.index({ userId: 1, categoryId: 1 });
travelServiceSchema.index({ userId: 1, name: 1, categoryId: 1 }, { unique: true });
travelServiceSchema.index(
  { userId: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $gt: "" } },
  },
);
travelServiceSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });
travelServiceSchema.index({ userId: 1, isDeleted: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("TravelService", travelServiceSchema);
