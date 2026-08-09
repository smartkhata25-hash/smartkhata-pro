const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    index: true,
  },

  otp: {
    type: String,
    required: true,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  resetToken: {
    type: String,
    default: null,
  },

  resetTokenExpiresAt: {
    type: Date,
    default: null,
  },

  attempts: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // 10 minutes
  },
});

module.exports = mongoose.model("PasswordReset", passwordResetSchema);
