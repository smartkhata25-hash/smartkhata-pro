const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
  {
    businessOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    action: {
      type: String,
      enum: [
        "login",
        "create",
        "update",
        "delete",
        "void",
        "reverse",
        "restore",
        "block",
        "unblock",
        "permission_update",
        "password_reset",
        "owner_transfer",
        "import",
        "export",
        "print",
        "convert",
        "merge",
        "adjust",
        "approve",
        "reject",
      ],
      required: true,
      lowercase: true,
      trim: true,
    },

    module: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },

    entityType: {
      type: String,
      default: "",
      trim: true,
    },

    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    title: {
      type: String,
      default: "",
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    billNo: {
      type: String,
      default: "",
      trim: true,
    },

    before: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    after: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    ipAddress: {
      type: String,
      default: "",
      trim: true,
    },

    userAgent: {
      type: String,
      default: "",
      trim: true,
    },

    deviceId: {
      type: String,
      default: "",
      trim: true,
    },

    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// ✅ Main Activity List / Summary
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  createdAt: -1,
});

// ✅ Staff/User Filter
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  performedBy: 1,
  createdAt: -1,
});

// ✅ Module Filter
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  module: 1,
  createdAt: -1,
});

// ✅ Action Filter
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  action: 1,
  createdAt: -1,
});

// ✅ Module + Action Combined Filter
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  module: 1,
  action: 1,
  createdAt: -1,
});

// ✅ Entity Detail / History
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  entityType: 1,
  entityId: 1,
});

// ✅ Bill Number Lookup
activityLogSchema.index({
  businessOwnerId: 1,
  isDeleted: 1,
  billNo: 1,
  createdAt: -1,
});

module.exports = mongoose.model("ActivityLog", activityLogSchema);
