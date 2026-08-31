const mongoose = require("mongoose");

const businessReceivableLoanSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    moduleScope: {
      type: String,
      enum: ["trading", "travel"],
      default: "trading",
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    borrowerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    borrowerType: {
      type: String,
      enum: ["person", "employee", "customer", "supplier", "other"],
      default: "person",
    },

    originalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    dueDate: {
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

businessReceivableLoanSchema.pre("validate", function (next) {
  if (
    this.originalAmount !== undefined &&
    this.remainingAmount !== undefined &&
    this.remainingAmount > this.originalAmount
  ) {
    return next(new Error("Remaining amount cannot exceed original amount."));
  }

  next();
});

businessReceivableLoanSchema.pre("save", function (next) {
  if (this.title) {
    this.title = this.title.trim();
  }

  if (this.borrowerName) {
    this.borrowerName = this.borrowerName.trim();
  }

  if (this.notes) {
    this.notes = this.notes.trim();
  }

  this.status = Number(this.remainingAmount || 0) > 0 ? "active" : "closed";

  next();
});

businessReceivableLoanSchema.index({
  userId: 1,
  moduleScope: 1,
  isDeleted: 1,
  status: 1,
});

businessReceivableLoanSchema.index({
  userId: 1,
  moduleScope: 1,
  borrowerName: 1,
  isDeleted: 1,
});

businessReceivableLoanSchema.index({
  userId: 1,
  moduleScope: 1,
  startDate: -1,
});

module.exports = mongoose.model(
  "BusinessReceivableLoan",
  businessReceivableLoanSchema,
);
