const crypto = require("crypto");
const mongoose = require("mongoose");

const TravelBooking = require("../../models/TravelBooking");
const TravelReminder = require("../../models/TravelReminder");
const TravelReminderSettings = require("../../models/TravelReminderSettings");
const User = require("../../models/User");
const {
  DEFAULT_TRAVEL_REMINDER_TEMPLATES,
} = require("../../models/TravelReminderSettings");
const {
  getItemDateRange,
  getUserId,
  createHttpError,
  nullableDate,
} = require("./travelBookingService");
const { sendTravelReminderEmail } = require("./travelReminderEmailService");

const DEFAULT_LEAD_MINUTES = 24 * 60;
const MAX_PROCESS_LIMIT = 50;
const PROCESSING_LOCK_MS = 2 * 60 * 1000;

const DEFAULT_SETTINGS = Object.freeze({
  automaticRemindersEnabled: true,
  defaultLeadMinutes: DEFAULT_LEAD_MINUTES,
  emailEnabled: false,
  whatsappEnabled: true,
  ...DEFAULT_TRAVEL_REMINDER_TEMPLATES,
});

const EVENT_LABELS = Object.freeze({
  air_ticket_departure: "Flight Departure",
  umrah_departure: "Umrah Departure",
  hotel_check_in: "Hotel Check-in",
  transport_departure: "Transport",
  travel_start: "Travel Start",
});

const ACTIVE_BOOKING_STATUSES = new Set([
  "draft",
  "quotation",
  "confirmed",
  "processing",
]);

const parseJsonField = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value === "boolean") {
    return value;
  }

  return ["true", "1", "yes", "on"].includes(
    String(value).trim().toLowerCase(),
  );
};

const normalizeLeadMinutes = (value, fallback = DEFAULT_LEAD_MINUTES) => {
  const minutes = Number(value);

  if (!Number.isFinite(minutes) || minutes < 0) {
    return fallback;
  }

  return Math.floor(minutes);
};

const serializeSettings = (settings) => {
  const plain = settings?.toObject ? settings.toObject() : settings || {};

  return {
    automaticRemindersEnabled: normalizeBoolean(
      plain.automaticRemindersEnabled,
      DEFAULT_SETTINGS.automaticRemindersEnabled,
    ),
    defaultLeadMinutes: normalizeLeadMinutes(
      plain.defaultLeadMinutes,
      DEFAULT_SETTINGS.defaultLeadMinutes,
    ),
    emailEnabled: normalizeBoolean(
      plain.emailEnabled,
      DEFAULT_SETTINGS.emailEnabled,
    ),
    whatsappEnabled: normalizeBoolean(
      plain.whatsappEnabled,
      DEFAULT_SETTINGS.whatsappEnabled,
    ),
    englishTemplate:
      String(plain.englishTemplate || "").trim() ||
      DEFAULT_SETTINGS.englishTemplate,
    urduTemplate:
      String(plain.urduTemplate || "").trim() || DEFAULT_SETTINGS.urduTemplate,
    updatedAt: plain.updatedAt || null,
  };
};

const getTravelReminderSettings = async (userId) => {
  if (!userId) {
    throw createHttpError(401, "Authentication required");
  }

  const settings = await TravelReminderSettings.findOneAndUpdate(
    { userId },
    {
      $setOnInsert: {
        userId,
        ...DEFAULT_SETTINGS,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return serializeSettings(settings);
};

const updateTravelReminderSettings = async ({ userId, actorId, payload }) => {
  const source = parseJsonField(payload, {}) || {};

  const update = {
    automaticRemindersEnabled: normalizeBoolean(
      source.automaticRemindersEnabled,
      DEFAULT_SETTINGS.automaticRemindersEnabled,
    ),
    defaultLeadMinutes: normalizeLeadMinutes(
      source.defaultLeadMinutes,
      DEFAULT_SETTINGS.defaultLeadMinutes,
    ),
    emailEnabled: normalizeBoolean(
      source.emailEnabled,
      DEFAULT_SETTINGS.emailEnabled,
    ),
    whatsappEnabled: normalizeBoolean(
      source.whatsappEnabled,
      DEFAULT_SETTINGS.whatsappEnabled,
    ),
    englishTemplate:
      String(source.englishTemplate || "").trim() ||
      DEFAULT_SETTINGS.englishTemplate,
    urduTemplate:
      String(source.urduTemplate || "").trim() || DEFAULT_SETTINGS.urduTemplate,
    updatedBy: actorId || null,
  };

  const settings = await TravelReminderSettings.findOneAndUpdate(
    { userId },
    {
      $set: update,
      $setOnInsert: { userId },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
      setDefaultsOnInsert: true,
    },
  ).lean();

  return serializeSettings(settings);
};

const normalizeBookingReminderSettings = (rawSettings, businessSettings) => {
  const source = parseJsonField(rawSettings, null);
  const defaults = serializeSettings(businessSettings);

  if (!source || source.inheritBusinessDefaults !== false) {
    return {
      inheritBusinessDefaults: true,
      enabled: defaults.automaticRemindersEnabled,
      leadMinutes: defaults.defaultLeadMinutes,
      emailEnabled: defaults.emailEnabled,
      whatsappEnabled: defaults.whatsappEnabled,
    };
  }

  return {
    inheritBusinessDefaults: false,
    enabled: normalizeBoolean(
      source.enabled,
      defaults.automaticRemindersEnabled,
    ),
    leadMinutes: normalizeLeadMinutes(
      source.leadMinutes,
      defaults.defaultLeadMinutes,
    ),
    emailEnabled: normalizeBoolean(source.emailEnabled, defaults.emailEnabled),
    whatsappEnabled: normalizeBoolean(
      source.whatsappEnabled,
      defaults.whatsappEnabled,
    ),
  };
};

const asDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const earliestDate = (values = []) =>
  values
    .map(asDate)
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;

const getPriorityEvent = (booking) => {
  const items = Array.isArray(booking?.bookingItems)
    ? booking.bookingItems
    : [];
  const candidates = [];
  const now = new Date();

  const addCandidate = (itemType, eventType, dateValue) => {
    const date = asDate(dateValue);

    if (!date || date <= now) {
      return;
    }

    candidates.push({
      itemType,
      eventType,
      eventLabel: EVENT_LABELS[eventType],
      eventDateTime: date,
    });
  };

  items.forEach((item) => {
    const range = getItemDateRange(item || {});

    if (item?.itemType === "air_ticket") {
      const passengerDeparture = earliestDate(
        (item.ticketDetails?.passengerTickets || [])
          .map((passenger) => asDate(passenger?.departureDateTime))
          .filter((date) => date && date > now),
      );

      addCandidate(
        "air_ticket",
        "air_ticket_departure",
        passengerDeparture || range.start,
      );
      return;
    }

    if (item?.itemType === "umrah_package") {
      addCandidate("umrah_package", "umrah_departure", range.start);
      return;
    }

    if (item?.itemType === "hotel") {
      addCandidate("hotel", "hotel_check_in", range.start);
      return;
    }

    if (item?.itemType === "transport") {
      addCandidate("transport", "transport_departure", range.start);
    }
  });

  const priority = [
    "air_ticket_departure",
    "umrah_departure",
    "hotel_check_in",
    "transport_departure",
  ];

  for (const eventType of priority) {
    const match = earliestDate(
      candidates
        .filter((candidate) => candidate.eventType === eventType)
        .map((candidate) => candidate.eventDateTime),
    );

    if (match) {
      return {
        eventType,
        eventLabel: EVENT_LABELS[eventType],
        eventDateTime: match,
      };
    }
  }

  const fallbackDate = asDate(booking?.travelStartDate);

  if (!fallbackDate || fallbackDate <= now) {
    return null;
  }

  return {
    eventType: "travel_start",
    eventLabel: EVENT_LABELS.travel_start,
    eventDateTime: fallbackDate,
  };
};

const shouldKeepReminderForBooking = (booking) =>
  booking &&
  booking.isActive !== false &&
  booking.isDeleted !== true &&
  booking.isVoided !== true &&
  ACTIVE_BOOKING_STATUSES.has(booking.status || "draft");

const getBookingNumber = (booking) =>
  booking?.invoiceNumber ||
  booking?.bookingNumber ||
  String(booking?._id || "");

const buildIdempotencyKey = ({
  userId,
  bookingId,
  customerId,
  eventType,
  eventDateTime,
  remindAt,
}) => {
  const parts = [
    "travel-reminder",
    userId,
    bookingId,
    customerId,
    eventType,
    eventDateTime.toISOString(),
    remindAt.toISOString(),
  ];

  return crypto.createHash("sha256").update(parts.join(":")).digest("hex");
};

const cancelReminderQuery = (userId, bookingId, includeDue = false) => ({
  userId,
  bookingId,
  status: includeDue ? { $in: ["pending", "processing", "due"] } : "pending",
});

const cancelBookingReminders = async ({
  userId,
  bookingId,
  reason = "Booking reminder cancelled",
  includeDue = false,
}) => {
  if (!userId || !bookingId) {
    return { modifiedCount: 0 };
  }

  const now = new Date();

  return TravelReminder.updateMany(
    cancelReminderQuery(userId, bookingId, includeDue),
    {
      $set: {
        status: "cancelled",
        inAppStatus: "cancelled",
        enabled: false,
        cancelledAt: now,
        cancelledReason: reason,
        processingUntil: null,
        lockId: "",
      },
    },
  );
};

const getPopulatedBooking = (bookingId, userId) =>
  TravelBooking.findOne({
    _id: bookingId,
    userId,
  })
    .populate("customerId", "name phone email moduleScope")
    .lean();

const syncTravelBookingReminder = async ({
  booking,
  bookingId,
  userId,
  actorId,
  settings,
}) => {
  try {
    const sourceBooking =
      booking && booking.bookingItems
        ? booking
        : await getPopulatedBooking(bookingId || booking?._id, userId);

    if (!sourceBooking?._id) {
      return { skipped: true, reason: "booking_not_found" };
    }

    if (!sourceBooking.customerId?._id && !sourceBooking.customerId) {
      await cancelBookingReminders({
        userId,
        bookingId: sourceBooking._id,
        reason: "Booking customer missing",
      });

      return { skipped: true, reason: "customer_missing" };
    }

    const businessSettings = await getTravelReminderSettings(userId);
    const effectiveSettings = normalizeBookingReminderSettings(
      settings ?? sourceBooking.reminderSettings,
      businessSettings,
    );

    if (
      !shouldKeepReminderForBooking(sourceBooking) ||
      !effectiveSettings.enabled
    ) {
      await cancelBookingReminders({
        userId,
        bookingId: sourceBooking._id,
        reason: effectiveSettings.enabled
          ? "Booking no longer needs reminders"
          : "Reminder disabled",
        includeDue: !effectiveSettings.enabled,
      });

      return { skipped: true, reason: "disabled_or_inactive" };
    }

    const event = getPriorityEvent(sourceBooking);
    const now = new Date();

    if (!event || event.eventDateTime <= now) {
      await cancelBookingReminders({
        userId,
        bookingId: sourceBooking._id,
        reason: "No future event date",
      });

      return { skipped: true, reason: "no_future_event" };
    }

    const remindAt = new Date(
      event.eventDateTime.getTime() - effectiveSettings.leadMinutes * 60 * 1000,
    );
    const customerId =
      sourceBooking.customerId?._id || sourceBooking.customerId;
    const idempotencyKey = buildIdempotencyKey({
      userId,
      bookingId: sourceBooking._id,
      customerId,
      eventType: event.eventType,
      eventDateTime: event.eventDateTime,
      remindAt,
    });

    await TravelReminder.updateMany(
      {
        userId,
        bookingId: sourceBooking._id,
        status: "pending",
        idempotencyKey: { $ne: idempotencyKey },
      },
      {
        $set: {
          status: "cancelled",
          inAppStatus: "cancelled",
          enabled: false,
          cancelledAt: now,
          cancelledReason: "Booking reminder rescheduled",
        },
      },
    );

    const existing = await TravelReminder.findOne({ idempotencyKey });

    if (existing && existing.status !== "pending") {
      return {
        skipped: true,
        reason: "history_not_rewritten",
        reminder: serializeReminder(existing),
      };
    }

    const reminderPayload = {
      userId,
      bookingId: sourceBooking._id,
      customerId,
      bookingNumber: getBookingNumber(sourceBooking),
      customerName: sourceBooking.customerId?.name || "",
      eventType: event.eventType,
      eventLabel: event.eventLabel,
      eventDateTime: event.eventDateTime,
      remindAt,
      leadMinutes: effectiveSettings.leadMinutes,
      enabled: true,
      emailEnabled: effectiveSettings.emailEnabled,
      whatsappEnabled: effectiveSettings.whatsappEnabled,
      emailStatus: effectiveSettings.emailEnabled ? "pending" : "disabled",
      inAppStatus: "pending",
      status: "pending",
      isRead: false,
      readAt: null,
      readBy: null,
      cancelledAt: null,
      cancelledReason: "",
      processingUntil: null,
      lockId: "",
      idempotencyKey,
    };

    const reminder = await TravelReminder.findOneAndUpdate(
      { idempotencyKey },
      {
        $set: reminderPayload,
        $setOnInsert: {
          createdBy: actorId || null,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );

    return {
      skipped: false,
      reminder: serializeReminder(reminder),
    };
  } catch (error) {
    console.error("Travel reminder sync failed:", error.message);

    return { skipped: true, reason: "sync_failed", error: error.message };
  }
};

const formatDatePart = (value) => {
  const date = nullableDate(value);

  if (!date) {
    return "";
  }

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Karachi",
  });
};

const formatTimePart = (value) => {
  const date = nullableDate(value);

  if (!date) {
    return "";
  }

  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();

  if (hours === 0 && minutes === 0) {
    return "";
  }

  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Karachi",
  });
};

const getBusinessName = async (userId) => {
  const user = await User.findById(userId).select("businessName name").lean();

  return user?.businessName || user?.name || "Smart Khata";
};

const buildTemplateVariables = async (reminder) => {
  const booking = reminder.bookingId;
  const customer = reminder.customerId;

  return {
    customerName: customer?.name || reminder.customerName || "Customer",
    bookingNumber:
      booking?.invoiceNumber ||
      booking?.bookingNumber ||
      reminder.bookingNumber ||
      "-",
    eventType:
      reminder.eventLabel || EVENT_LABELS[reminder.eventType] || "Travel",
    eventDate: formatDatePart(reminder.eventDateTime),
    eventTime: formatTimePart(reminder.eventDateTime),
    businessName: await getBusinessName(reminder.userId),
  };
};

const applyTemplate = (template, variables) =>
  String(template || "").replace(/\{\{(\w+)\}\}/g, (match, key) =>
    variables[key] === undefined || variables[key] === null
      ? match
      : String(variables[key]),
  );

const populateReminder = (query) =>
  query
    .populate("customerId", "name phone email moduleScope")
    .populate(
      "bookingId",
      "bookingNumber invoiceNumber serviceType status travelStartDate travelEndDate isDeleted isVoided",
    );

const serializeReminder = (reminder) => {
  if (!reminder) {
    return null;
  }

  const plain = reminder.toObject ? reminder.toObject() : reminder;
  const booking =
    plain.bookingId && typeof plain.bookingId === "object"
      ? plain.bookingId
      : null;
  const customer =
    plain.customerId && typeof plain.customerId === "object"
      ? plain.customerId
      : null;

  return {
    _id: plain._id,
    bookingId: booking?._id || plain.bookingId,
    customerId: customer?._id || plain.customerId,
    bookingNumber:
      booking?.invoiceNumber ||
      booking?.bookingNumber ||
      plain.bookingNumber ||
      "",
    customerName: customer?.name || plain.customerName || "",
    customerPhone: customer?.phone || "",
    customerEmail: customer?.email || "",
    eventType: plain.eventType,
    eventLabel: plain.eventLabel || EVENT_LABELS[plain.eventType] || "",
    eventDateTime: plain.eventDateTime,
    remindAt: plain.remindAt,
    leadMinutes: plain.leadMinutes,
    enabled: plain.enabled !== false,
    emailEnabled: plain.emailEnabled === true,
    whatsappEnabled: plain.whatsappEnabled !== false,
    status: plain.status,
    inAppStatus: plain.inAppStatus,
    dueAt: plain.dueAt,
    isRead: plain.isRead === true,
    readAt: plain.readAt,
    emailStatus: plain.emailStatus,
    emailSentAt: plain.emailSentAt,
    emailError: plain.emailError || "",
    emailAttempts: Number(plain.emailAttempts || 0),
    cancelledAt: plain.cancelledAt,
    cancelledReason: plain.cancelledReason || "",
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
  };
};

const dueAttentionFilter = (now = new Date()) => ({
  enabled: true,
  status: { $ne: "cancelled" },
  $or: [
    { status: "due" },
    { status: "pending", remindAt: { $lte: now } },
    { emailStatus: "failed" },
  ],
});

const getTravelReminderSummary = async (userId) => {
  const now = new Date();

  const [
    attentionCount,
    dueCount,
    upcomingCount,
    failedEmailCount,
    nextReminder,
  ] = await Promise.all([
    TravelReminder.countDocuments({
      userId,
      isRead: false,
      ...dueAttentionFilter(now),
    }),
    TravelReminder.countDocuments({
      userId,
      enabled: true,
      status: { $ne: "cancelled" },
      $or: [{ status: "due" }, { status: "pending", remindAt: { $lte: now } }],
    }),
    TravelReminder.countDocuments({
      userId,
      enabled: true,
      status: "pending",
      remindAt: { $gt: now },
    }),
    TravelReminder.countDocuments({
      userId,
      enabled: true,
      status: { $ne: "cancelled" },
      emailStatus: "failed",
    }),
    populateReminder(
      TravelReminder.findOne({
        userId,
        enabled: true,
        status: "pending",
        remindAt: { $gt: now },
      }).sort({ remindAt: 1 }),
    ).lean(),
  ]);

  return {
    attentionCount,
    dueCount,
    upcomingCount,
    failedEmailCount,
    nextReminder: serializeReminder(nextReminder),
    loadedAt: new Date(),
  };
};

const buildReminderListQuery = (userId, status = "") => {
  const now = new Date();
  const base = { userId };

  if (status === "due") {
    return {
      ...base,
      ...dueAttentionFilter(now),
    };
  }

  if (status === "upcoming") {
    return {
      ...base,
      enabled: true,
      status: "pending",
      remindAt: { $gt: now },
    };
  }

  if (status === "failed") {
    return {
      ...base,
      enabled: true,
      status: { $ne: "cancelled" },
      emailStatus: "failed",
    };
  }

  if (status === "completed") {
    return {
      ...base,
      status: { $in: ["due", "cancelled"] },
      isRead: true,
    };
  }

  return {
    ...base,
    $or: [
      dueAttentionFilter(now),
      { enabled: true, status: "pending" },
      {
        status: "cancelled",
        updatedAt: { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
    ],
  };
};

const listTravelReminders = async ({ userId, status = "", limit = 80 }) => {
  const safeLimit = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const reminders = await populateReminder(
    TravelReminder.find(buildReminderListQuery(userId, status))
      .sort({ isRead: 1, remindAt: 1, updatedAt: -1 })
      .limit(safeLimit),
  ).lean();

  return reminders.map(serializeReminder);
};

const getBookingReminderState = async ({ userId, bookingId }) => {
  if (!mongoose.Types.ObjectId.isValid(String(bookingId))) {
    throw createHttpError(400, "Invalid booking ID");
  }

  const booking = await TravelBooking.findOne({
    _id: bookingId,
    userId,
  }).lean();

  if (!booking) {
    throw createHttpError(404, "Travel booking not found");
  }

  const [settings, reminders] = await Promise.all([
    getTravelReminderSettings(userId),
    populateReminder(
      TravelReminder.find({
        userId,
        bookingId,
        status: { $ne: "cancelled" },
      }).sort({ remindAt: 1, updatedAt: -1 }),
    ).lean(),
  ]);

  return {
    settings,
    reminders: reminders.map(serializeReminder),
  };
};

const completeReminderEmail = async (reminder) => {
  if (!reminder.emailEnabled) {
    return {
      emailStatus: "disabled",
      emailError: "",
    };
  }

  const populated = await populateReminder(
    TravelReminder.findById(reminder._id),
  ).lean();
  const customer = populated?.customerId;

  if (!customer?.email) {
    return {
      emailStatus: "skipped",
      emailError: "Customer email is missing",
    };
  }

  const variables = await buildTemplateVariables(populated);

  await sendTravelReminderEmail({
    toEmail: customer.email,
    customerName: variables.customerName,
    bookingNumber: variables.bookingNumber,
    eventType: variables.eventType,
    eventDate: variables.eventDate,
    eventTime: variables.eventTime,
    businessName: variables.businessName,
  });

  return {
    emailStatus: "sent",
    emailSentAt: new Date(),
    emailError: "",
  };
};

const finalizeClaimedReminder = async (reminder) => {
  const now = new Date();
  const update = {
    status: "due",
    inAppStatus: "due",
    dueAt: reminder.dueAt || now,
    lastProcessedAt: now,
    processingUntil: null,
    lockId: "",
  };

  if (!reminder.emailEnabled) {
    update.emailStatus = "disabled";
    update.emailError = "";
  } else if (reminder.emailStatus !== "sent") {
    update.emailAttempts = Number(reminder.emailAttempts || 0) + 1;
    update.emailLastAttemptAt = now;

    try {
      Object.assign(update, await completeReminderEmail(reminder));
    } catch (error) {
      update.emailStatus = "failed";
      update.emailError = error.message || "Email sending failed";
    }
  }

  const saved = await TravelReminder.findOneAndUpdate(
    {
      _id: reminder._id,
      status: "processing",
      lockId: reminder.lockId,
    },
    { $set: update },
    { new: true },
  );

  return serializeReminder(saved);
};

const processDueTravelReminders = async ({
  limit = MAX_PROCESS_LIMIT,
} = {}) => {
  const startedAt = new Date();
  const safeLimit = Math.min(
    Math.max(Number(limit) || MAX_PROCESS_LIMIT, 1),
    200,
  );
  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };

  for (let index = 0; index < safeLimit; index += 1) {
    const now = new Date();
    const lockId = crypto.randomUUID();
    const reminder = await TravelReminder.findOneAndUpdate(
      {
        enabled: true,
        status: "pending",
        remindAt: { $lte: now },
        $or: [
          { processingUntil: null },
          { processingUntil: { $exists: false } },
          { processingUntil: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          processingStartedAt: now,
          processingUntil: new Date(now.getTime() + PROCESSING_LOCK_MS),
          lockId,
        },
        $inc: {
          processAttempts: 1,
        },
      },
      {
        sort: { remindAt: 1, createdAt: 1 },
        new: true,
      },
    );

    if (!reminder) {
      break;
    }

    const finalReminder = await finalizeClaimedReminder(reminder);

    results.processed += 1;

    if (finalReminder?.emailStatus === "sent") {
      results.sent += 1;
    } else if (finalReminder?.emailStatus === "failed") {
      results.failed += 1;
    } else {
      results.skipped += 1;
    }
  }

  return {
    ...results,
    startedAt,
    finishedAt: new Date(),
  };
};

const getReminderForAction = async ({ userId, reminderId }) => {
  if (!mongoose.Types.ObjectId.isValid(String(reminderId))) {
    throw createHttpError(400, "Invalid reminder ID");
  }

  const reminder = await populateReminder(
    TravelReminder.findOne({
      _id: reminderId,
      userId,
      status: { $ne: "cancelled" },
    }),
  ).lean();

  if (!reminder) {
    throw createHttpError(404, "Travel reminder not found");
  }

  return reminder;
};

const sendReminderEmailNow = async ({ userId, reminderId }) => {
  const reminder = await getReminderForAction({ userId, reminderId });
  const now = new Date();

  if (!reminder.emailEnabled) {
    const saved = await TravelReminder.findOneAndUpdate(
      { _id: reminderId, userId },
      {
        $set: {
          emailStatus: "disabled",
          emailError: "",
          emailLastAttemptAt: now,
        },
      },
      { new: true },
    );

    return serializeReminder(saved);
  }

  const update = {
    emailAttempts: Number(reminder.emailAttempts || 0) + 1,
    emailLastAttemptAt: now,
  };

  try {
    Object.assign(update, await completeReminderEmail(reminder));
  } catch (error) {
    update.emailStatus = "failed";
    update.emailError = error.message || "Email sending failed";
  }

  const saved = await TravelReminder.findOneAndUpdate(
    { _id: reminderId, userId },
    { $set: update },
    { new: true },
  );

  return serializeReminder(saved);
};

const markReminderRead = async ({
  userId,
  reminderId,
  actorId,
  read = true,
}) => {
  if (!mongoose.Types.ObjectId.isValid(String(reminderId))) {
    throw createHttpError(400, "Invalid reminder ID");
  }

  const now = new Date();
  const saved = await TravelReminder.findOneAndUpdate(
    {
      _id: reminderId,
      userId,
      status: { $ne: "cancelled" },
    },
    {
      $set: {
        isRead: read,
        readAt: read ? now : null,
        readBy: read ? actorId || null : null,
        inAppStatus: read ? "read" : "due",
      },
    },
    { new: true },
  );

  if (!saved) {
    throw createHttpError(404, "Travel reminder not found");
  }

  return serializeReminder(saved);
};

const getWhatsAppReminderMessage = async ({
  userId,
  reminderId,
  lang = "en",
}) => {
  const reminder = await getReminderForAction({ userId, reminderId });

  if (!reminder.whatsappEnabled) {
    throw createHttpError(400, "WhatsApp action is disabled for this reminder");
  }

  const customer = reminder.customerId;

  if (!customer?.phone) {
    throw createHttpError(400, "Customer phone number is missing");
  }

  const settings = await getTravelReminderSettings(userId);
  const variables = await buildTemplateVariables(reminder);
  const template =
    String(lang).toLowerCase() === "ur"
      ? settings.urduTemplate
      : settings.englishTemplate;

  return {
    phone: customer.phone,
    message: applyTemplate(template, variables),
  };
};

const serializeRequestUserId = (req) => getUserId(req);

module.exports = {
  DEFAULT_SETTINGS,
  EVENT_LABELS,
  cancelBookingReminders,
  getTravelReminderSettings,
  getTravelReminderSummary,
  getBookingReminderState,
  getWhatsAppReminderMessage,
  listTravelReminders,
  markReminderRead,
  normalizeBookingReminderSettings,
  processDueTravelReminders,
  sendReminderEmailNow,
  serializeReminder,
  serializeRequestUserId,
  syncTravelBookingReminder,
  updateTravelReminderSettings,
};
