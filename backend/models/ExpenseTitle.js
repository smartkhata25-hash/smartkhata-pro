const mongoose = require("mongoose");

const expenseTitleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },

    // 👤 Owner (User)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    isDefault: {
      type: Boolean,
      default: false,
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

expenseTitleSchema.index({ name: 1, userId: 1 }, { unique: true });

expenseTitleSchema.index({
  name: "text",
});

expenseTitleSchema.pre("save", function (next) {
  if (this.name) {
    this.name = this.name.trim();
  }
  next();
});

module.exports = mongoose.model("ExpenseTitle", expenseTitleSchema);
