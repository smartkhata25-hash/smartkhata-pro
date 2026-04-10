const mongoose = require("mongoose");

const inviteSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  code: {
    type: String,
    required: true,
  },
  isUsed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // ⏳ 24 hours (1 day)
  },
});

module.exports = mongoose.model("InviteCode", inviteSchema);
