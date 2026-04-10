const mongoose = require("mongoose");

const localSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    email: String,
    password: String, // hashed
    deviceId: {
      type: String,
      required: true,
    },
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Installation",
      required: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("LocalSession", localSessionSchema);
