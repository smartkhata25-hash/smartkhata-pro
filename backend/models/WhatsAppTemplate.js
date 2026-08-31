const mongoose = require("mongoose");

const whatsAppTemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    moduleScope: {
      type: String,
      enum: ["trading", "travel"],
      required: true,
      index: true,
    },

    englishTemplate: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },

    urduTemplate: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: "",
    },
  },
  { timestamps: true },
);

whatsAppTemplateSchema.index(
  {
    userId: 1,
    moduleScope: 1,
  },
  { unique: true },
);

module.exports = mongoose.model("WhatsAppTemplate", whatsAppTemplateSchema);
