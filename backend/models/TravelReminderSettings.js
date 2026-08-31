const mongoose = require("mongoose");

const DEFAULT_TRAVEL_REMINDER_TEMPLATES = Object.freeze({
  englishTemplate: `Assalamualaikum {{customerName}},

This is a reminder for booking {{bookingNumber}}.
{{eventType}} is scheduled for {{eventDate}} {{eventTime}}.

Sent by:
{{businessName}}`,
  urduTemplate: `السلام علیکم {{customerName}},

یہ booking {{bookingNumber}} کے لیے یاد دہانی ہے۔
{{eventType}} {{eventDate}} {{eventTime}} کو شیڈول ہے۔

منجانب:
{{businessName}}`,
});

const travelReminderSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    automaticRemindersEnabled: {
      type: Boolean,
      default: true,
    },

    defaultLeadMinutes: {
      type: Number,
      min: 0,
      default: 24 * 60,
    },

    emailEnabled: {
      type: Boolean,
      default: false,
    },

    whatsappEnabled: {
      type: Boolean,
      default: true,
    },

    englishTemplate: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: DEFAULT_TRAVEL_REMINDER_TEMPLATES.englishTemplate,
    },

    urduTemplate: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: DEFAULT_TRAVEL_REMINDER_TEMPLATES.urduTemplate,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

travelReminderSettingsSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model(
  "TravelReminderSettings",
  travelReminderSettingsSchema,
);
module.exports.DEFAULT_TRAVEL_REMINDER_TEMPLATES =
  DEFAULT_TRAVEL_REMINDER_TEMPLATES;
