const mongoose = require("mongoose");

const businessAssetCategorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    normalizedName: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 250,
      default: "",
    },

    isSystem: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Category name کو محفوظ شکل میں رکھیں
businessAssetCategorySchema.pre("validate", function (next) {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }

  next();
});

// Active categories میں duplicate نام روکے گا
businessAssetCategorySchema.index(
  {
    userId: 1,
    normalizedName: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);

businessAssetCategorySchema.index({
  userId: 1,
  isDeleted: 1,
  isActive: 1,
});

module.exports = mongoose.model(
  "BusinessAssetCategory",
  businessAssetCategorySchema,
);
