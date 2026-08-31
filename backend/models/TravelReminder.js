const mongoose = require("mongoose");

const TRAVEL_REMINDER_STATUSES = Object.freeze([
  "pending",
  "processing",
  "due",
  "cancelled",
]);

const TRAVEL_REMINDER_EMAIL_STATUSES = Object.freeze([
  "pending",
  "sent",
  "failed",
  "skipped",
  "disabled",
]);

const TRAVEL_REMINDER_IN_APP_STATUSES = Object.freeze([
  "pending",
  "due",
  "read",
  "cancelled",
]);

const TRAVEL_REMINDER_EVENT_TYPES = Object.freeze([
  "air_ticket_departure",
  "umrah_departure",
  "hotel_check_in",
  "transport_departure",
  "travel_start",
]);

const travelReminderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TravelBooking",
      required: true,
      index: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    bookingNumber: {
      type: String,
      trim: true,
      default: "",
    },

    customerName: {
      type: String,
      trim: true,
      default: "",
    },

    eventType: {
      type: String,
      enum: TRAVEL_REMINDER_EVENT_TYPES,
      required: true,
      index: true,
    },

    eventLabel: {
      type: String,
      trim: true,
      default: "",
    },

    eventDateTime: {
      type: Date,
      required: true,
      index: true,
    },

    remindAt: {
      type: Date,
      required: true,
      index: true,
    },

    leadMinutes: {
      type: Number,
      min: 0,
      default: 24 * 60,
    },

    enabled: {
      type: Boolean,
      default: true,
      index: true,
    },

    emailEnabled: {
      type: Boolean,
      default: false,
    },

    whatsappEnabled: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: TRAVEL_REMINDER_STATUSES,
      default: "pending",
      index: true,
    },

    inAppStatus: {
      type: String,
      enum: TRAVEL_REMINDER_IN_APP_STATUSES,
      default: "pending",
      index: true,
    },

    dueAt: {
      type: Date,
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    readBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    emailStatus: {
      type: String,
      enum: TRAVEL_REMINDER_EMAIL_STATUSES,
      default: "disabled",
      index: true,
    },

    emailSentAt: {
      type: Date,
      default: null,
    },

    emailError: {
      type: String,
      trim: true,
      default: "",
    },

    emailAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },

    emailLastAttemptAt: {
      type: Date,
      default: null,
    },

    processingStartedAt: {
      type: Date,
      default: null,
    },

    processingUntil: {
      type: Date,
      default: null,
      index: true,
    },

    lockId: {
      type: String,
      trim: true,
      default: "",
    },

    processAttempts: {
      type: Number,
      min: 0,
      default: 0,
    },

    lastProcessedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelledReason: {
      type: String,
      trim: true,
      default: "",
    },

    idempotencyKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true },
);

travelReminderSchema.index({ userId: 1, status: 1, remindAt: 1 });
travelReminderSchema.index({ userId: 1, isRead: 1, status: 1, remindAt: 1 });
travelReminderSchema.index({ userId: 1, emailStatus: 1, updatedAt: -1 });
travelReminderSchema.index({ userId: 1, bookingId: 1, status: 1 });
travelReminderSchema.index({ idempotencyKey: 1 }, { unique: true });

module.exports = mongoose.model("TravelReminder", travelReminderSchema);
module.exports.TRAVEL_REMINDER_STATUSES = TRAVEL_REMINDER_STATUSES;
module.exports.TRAVEL_REMINDER_EMAIL_STATUSES =
  TRAVEL_REMINDER_EMAIL_STATUSES;
module.exports.TRAVEL_REMINDER_IN_APP_STATUSES =
  TRAVEL_REMINDER_IN_APP_STATUSES;
module.exports.TRAVEL_REMINDER_EVENT_TYPES = TRAVEL_REMINDER_EVENT_TYPES;
