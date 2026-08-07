const mongoose = require("mongoose");

const businessLiabilitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    category: {
      type: String,
      enum: ["loan", "bank_loan", "supplier", "credit", "tax", "other"],
      default: "other",
    },

    originalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    startDate: {
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
      enum: ["active", "closed"],
      default: "active",
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

businessLiabilitySchema.pre("save", function (next) {
  if (this.title) {
    this.title = this.title.trim();
  }

  if (this.notes) {
    this.notes = this.notes.trim();
  }

  next();
});

businessLiabilitySchema.index({
  userId: 1,
  isDeleted: 1,
  status: 1,
});

businessLiabilitySchema.index({
  userId: 1,
  category: 1,
  isDeleted: 1,
});

businessLiabilitySchema.index({
  userId: 1,
  title: 1,
});

module.exports = mongoose.model("BusinessLiability", businessLiabilitySchema);
