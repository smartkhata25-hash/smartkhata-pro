const mongoose = require("mongoose");

const travelerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      default: null,
    },

    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    fatherOrHusbandName: {
      type: String,
      trim: true,
      default: "",
    },

    gender: {
      type: String,
      enum: ["", "male", "female", "other"],
      default: "",
    },

    dateOfBirth: {
      type: Date,
      default: null,
    },

    nationality: {
      type: String,
      trim: true,
      default: "",
    },

    cnic: {
      type: String,
      trim: true,
      default: "",
    },

    passportNumber: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },

    passportIssueDate: {
      type: Date,
      default: null,
    },

    passportExpiryDate: {
      type: Date,
      default: null,
    },

    passportCountry: {
      type: String,
      trim: true,
      default: "",
    },

    mobile: {
      type: String,
      trim: true,
      default: "",
    },

    email: {
      type: String,
      trim: true,
      lowercase: true,
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

travelerSchema.pre("validate", function validatePassportDates(next) {
  if (
    this.passportIssueDate &&
    this.passportExpiryDate &&
    this.passportExpiryDate < this.passportIssueDate
  ) {
    this.invalidate(
      "passportExpiryDate",
      "Passport expiry date cannot be before issue date",
    );
  }

  next();
});

travelerSchema.index({ userId: 1, fullName: 1 });
travelerSchema.index({ userId: 1, customerId: 1 });
travelerSchema.index(
  { userId: 1, passportNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { passportNumber: { $gt: "" } },
  },
);
travelerSchema.index({ userId: 1, cnic: 1 });
travelerSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });
travelerSchema.index({ userId: 1, isDeleted: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model("Traveler", travelerSchema);
