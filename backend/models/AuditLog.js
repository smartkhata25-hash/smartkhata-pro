const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String, // CREATE / UPDATE / DELETE / REVERSE
    required: true,
  },
  entityType: {
    type: String, // JournalEntry / Account
    required: true,
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  before: {
    type: Object,
    default: null,
  },
  after: {
    type: Object,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
