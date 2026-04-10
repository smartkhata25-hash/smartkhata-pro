const mongoose = require("mongoose");

const userDeviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deviceId: {
      type: String,
      required: true,
    },
    deviceName: {
      type: String,
      default: "Unknown Device",
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UserDevice", userDeviceSchema);
