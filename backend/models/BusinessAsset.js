const mongoose = require("mongoose");

const businessAssetSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BusinessAssetCategory",
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0.01,
      default: 1,
    },

    purchaseCost: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    currentValue: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    purchaseDate: {
      type: Date,
      default: null,
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "sold", "removed"],
      default: "active",
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

// Asset name صاف رکھیں
businessAssetSchema.pre("save", function (next) {
  if (this.name) {
    this.name = this.name.trim();
  }

  if (this.notes) {
    this.notes = this.notes.trim();
  }

  next();
});

businessAssetSchema.index({
  userId: 1,
  isDeleted: 1,
  status: 1,
});

businessAssetSchema.index({
  userId: 1,
  categoryId: 1,
  isDeleted: 1,
});

businessAssetSchema.index({
  userId: 1,
  name: 1,
});

module.exports = mongoose.model("BusinessAsset", businessAssetSchema);
