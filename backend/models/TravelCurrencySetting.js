const mongoose = require("mongoose");

const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
  TRAVEL_CURRENCY_RATE_CODES,
  getDefaultTravelCurrencyRates,
} = require("../config/travelConfig");

const travelCurrencyRateSchema = new mongoose.Schema(
  {
    currency: {
      type: String,
      required: true,
      uppercase: true,
      enum: TRAVEL_CURRENCY_RATE_CODES,
    },
    rateToBase: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false },
);

const travelCurrencySettingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    baseCurrency: {
      type: String,
      uppercase: true,
      enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
      default: DEFAULT_TRAVEL_CURRENCY,
    },
    rates: {
      type: [travelCurrencyRateSchema],
      default: getDefaultTravelCurrencyRates,
    },
  },
  { timestamps: true },
);

travelCurrencySettingSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model(
  "TravelCurrencySetting",
  travelCurrencySettingSchema,
);
