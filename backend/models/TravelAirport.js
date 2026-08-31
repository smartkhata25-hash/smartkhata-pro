const mongoose = require("mongoose");

const travelAirportSchema = new mongoose.Schema(
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
      maxlength: 180,
    },

    iataCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 3,
    },

    icaoCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 4,
      default: "",
    },

    city: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },

    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: "",
    },

    aliases: {
      type: [String],
      default: [],
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
      index: true,
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
      maxlength: 500,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeAliases = (aliases = []) => {
  if (!Array.isArray(aliases)) {
    return [];
  }

  const seen = new Set();

  return aliases
    .map((alias) => normalizeText(alias))
    .filter((alias) => {
      if (!alias) {
        return false;
      }

      const key = alias.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });
};

travelAirportSchema.pre("save", function normalizeTravelAirport(next) {
  this.name = normalizeText(this.name);

  this.iataCode = normalizeText(this.iataCode).toUpperCase();

  this.icaoCode = normalizeText(this.icaoCode).toUpperCase();

  this.city = normalizeText(this.city);

  this.country = normalizeText(this.country);

  this.countryCode = normalizeText(this.countryCode).toUpperCase();

  this.aliases = normalizeAliases(this.aliases);

  this.notes = normalizeText(this.notes);

  this.deleteReason = normalizeText(this.deleteReason);

  next();
});

travelAirportSchema.index({
  userId: 1,
  name: 1,
});

travelAirportSchema.index(
  {
    userId: 1,
    iataCode: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

travelAirportSchema.index({
  userId: 1,
  country: 1,
  city: 1,
  name: 1,
});

travelAirportSchema.index({
  userId: 1,
  isActive: 1,
  name: 1,
});

travelAirportSchema.index({
  userId: 1,
  isDeleted: 1,
  isActive: 1,
  name: 1,
});

travelAirportSchema.index({
  userId: 1,
  isDefault: 1,
  isDeleted: 1,
});

travelAirportSchema.index({
  userId: 1,
  iataCode: 1,
  isActive: 1,
});

module.exports = mongoose.model("TravelAirport", travelAirportSchema);
