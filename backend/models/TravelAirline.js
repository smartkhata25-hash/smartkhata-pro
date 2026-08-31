const mongoose = require("mongoose");

const travelAirlineSchema = new mongoose.Schema(
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

    iataCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: "",
    },

    icaoCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 4,
      default: "",
    },

    country: {
      type: String,
      trim: true,
      default: "",
    },

    aliases: {
      type: [
        {
          type: String,
          trim: true,
        },
      ],
      default: [],
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

    isDefault: {
      type: Boolean,
      default: false,
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

travelAirlineSchema.index({
  userId: 1,
  name: 1,
});

travelAirlineSchema.index({
  userId: 1,
  iataCode: 1,
});

travelAirlineSchema.index({
  userId: 1,
  isActive: 1,
  name: 1,
});

travelAirlineSchema.index({
  userId: 1,
  isDeleted: 1,
  isActive: 1,
  name: 1,
});

travelAirlineSchema.pre("save", function normalizeAirline(next) {
  if (this.name) {
    this.name = this.name.replace(/\s+/g, " ").trim();
  }

  if (this.iataCode) {
    this.iataCode = this.iataCode.trim().toUpperCase();
  }

  if (this.icaoCode) {
    this.icaoCode = this.icaoCode.trim().toUpperCase();
  }

  if (Array.isArray(this.aliases)) {
    this.aliases = [
      ...new Set(
        this.aliases
          .map((alias) =>
            String(alias || "")
              .replace(/\s+/g, " ")
              .trim(),
          )
          .filter(Boolean),
      ),
    ];
  }

  next();
});

module.exports = mongoose.model("TravelAirline", travelAirlineSchema);
