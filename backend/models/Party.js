const mongoose = require("mongoose");

const partySchema = new mongoose.Schema(
  {
    /* Basic Info */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
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

    address: {
      type: String,
      trim: true,
      default: "",
    },

    notes: {
      type: String,
      trim: true,
      default: "",
    },

    /* Party Role */
    role: {
      type: String,
      enum: ["customer", "supplier", "both"],
      default: "both",
      required: true,
    },

    moduleScope: {
      type: String,
      enum: ["trading", "travel", "both"],
      default: "trading",
      index: true,
    },

    /* Opening Balance */
    openingBalance: {
      type: Number,
      default: 0,
    },

    /*
      openingBalance meaning:
      + amount = Party se lena hai / receivable
      - amount = Party ko dena hai / payable
    */

    /* Linked Chart of Account */
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    /* Status */
    isActive: {
      type: Boolean,
      default: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },

    hiddenReason: {
      type: String,
      enum: ["deleted", "converted", "merged", null],
      default: null,
    },

    /* Ownership */
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

/* Search / Performance Indexes */
partySchema.index({ userId: 1, isDeleted: 1, isActive: 1 });
partySchema.index({
  userId: 1,
  isActive: 1,
  hiddenReason: 1,
});
partySchema.index({ userId: 1, moduleScope: 1, isDeleted: 1, isActive: 1 });
partySchema.index({ userId: 1, role: 1, isDeleted: 1 });
partySchema.index({ userId: 1, account: 1 });

/* Soft unique-style search support */
partySchema.index({ userId: 1, name: 1, phone: 1 });

/* Text Search */
partySchema.index({
  name: "text",
  phone: "text",
  email: "text",
});

/* Safety trim before save */
partySchema.pre("save", function (next) {
  if (this.name) this.name = this.name.trim();
  if (this.phone) this.phone = this.phone.trim();
  if (this.email) this.email = this.email.trim().toLowerCase();
  if (this.address) this.address = this.address.trim();
  if (this.notes) this.notes = this.notes.trim();

  next();
});

module.exports = mongoose.model("Party", partySchema);
