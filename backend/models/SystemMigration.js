const mongoose = require("mongoose");

const systemMigrationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },

    startedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    errorMessage: {
      type: String,
      default: "",
    },

    totalUsers: {
      type: Number,
      default: 0,
    },

    processedUsers: {
      type: Number,
      default: 0,
    },

    successfulUsers: {
      type: Number,
      default: 0,
    },

    failedUsers: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("SystemMigration", systemMigrationSchema);
