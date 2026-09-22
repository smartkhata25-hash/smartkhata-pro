const mongoose = require("mongoose");

const expenseTitleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    normalizedName: {
      type: String,
      trim: true,
      default: "",
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

    moduleScope: {
      type: String,
      enum: ["trading", "travel", "weaving", "both"],
      default: "trading",
      index: true,
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

expenseTitleSchema.index(
  { userId: 1, moduleScope: 1, normalizedName: 1 },
  { unique: true, name: "expense_title_scope_normalized_unique" },
);

expenseTitleSchema.index({
  name: "text",
});

expenseTitleSchema.pre("save", function (next) {
  if (this.name) {
    this.name = this.name.trim();
    this.normalizedName = this.name.toLowerCase();
  }
  next();
});

module.exports = mongoose.model("ExpenseTitle", expenseTitleSchema);
