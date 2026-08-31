const mongoose = require("mongoose");
const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
  TRAVEL_HOTEL_STAR_RATINGS,
} = require("../config/travelConfig");

const travelHotelSchema = new mongoose.Schema(
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

    city: {
      type: String,
      required: true,
      trim: true,
    },

    country: {
      type: String,
      trim: true,
      default: "",
    },

    starRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
      validate: {
        validator(value) {
          return value === null || TRAVEL_HOTEL_STAR_RATINGS.includes(value);
        },
        message: "Hotel star rating must be between 1 and 5",
      },
    },

    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      default: null,
    },

    distanceText: {
      type: String,
      trim: true,
      default: "",
    },

    defaultRate: {
      type: Number,
      min: 0,
      default: 0,
    },

    currency: {
      type: String,
      trim: true,
      uppercase: true,
      enum: SUPPORTED_TRAVEL_CURRENCY_CODES,
      default: DEFAULT_TRAVEL_CURRENCY,
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    contact: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
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
  {
    timestamps: true,
  },
);

travelHotelSchema.index({ userId: 1, city: 1, country: 1 });
travelHotelSchema.index({ userId: 1, vendorId: 1 });
travelHotelSchema.index({ userId: 1, name: 1, city: 1 });
travelHotelSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });
travelHotelSchema.index({ userId: 1, isDeleted: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("TravelHotel", travelHotelSchema);
