const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      default: "",
    },
    type: {
      type: String,
      enum: ["regular", "vip", "blocked", "supplier"],
      default: "regular",
    },
    openingBalance: {
      type: Number,
      default: 0,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account", // ✅ Automatically connect with Account
      required: true, // ✅ System ko har customer ka account lazmi chahiye
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true, // ✅ Automatically add createdAt & updatedAt
  }
);

module.exports = mongoose.model("Customer", customerSchema); // forcefully register
