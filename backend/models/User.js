const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["admin", "staff"], default: "staff" },
  fullName: String,
  cnic: String,
  mobile: String,
  address: String,
  businessName: String,
  businessType: String,
  currency: String,
  taxNumber: String,
});

module.exports = mongoose.model("User", userSchema);
