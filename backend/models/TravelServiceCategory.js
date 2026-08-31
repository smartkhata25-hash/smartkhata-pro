const mongoose = require("mongoose");

const safeIconKey = {
  validator(value) {
    return !value || /^[a-z0-9_-]{1,40}$/.test(value);
  },
  message: "Invalid icon key",
};

const travelServiceCategorySchema = new mongoose.Schema(
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

    iconKey: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
      validate: safeIconKey,
    },

    sortOrder: {
      type: Number,
      default: 0,
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

travelServiceCategorySchema.index({ userId: 1, name: 1 }, { unique: true });
travelServiceCategorySchema.index(
  { userId: 1, code: 1 },
  {
    unique: true,
    partialFilterExpression: { code: { $gt: "" } },
  },
);
travelServiceCategorySchema.index({ userId: 1, isActive: 1, sortOrder: 1 });
travelServiceCategorySchema.index({ userId: 1, isDeleted: 1, isActive: 1, sortOrder: 1 });

module.exports = mongoose.model(
  "TravelServiceCategory",
  travelServiceCategorySchema,
);
