const {
  cancelBookingReminders,
  getBookingReminderState,
  getTravelReminderSettings,
  getTravelReminderSummary,
  getWhatsAppReminderMessage,
  listTravelReminders,
  markReminderRead,
  sendReminderEmailNow,
  serializeRequestUserId,
  updateTravelReminderSettings,
} = require("../../services/travel/travelReminderService");
const {
  getActorId,
  sendError,
} = require("../../services/travel/travelBookingService");

exports.getTravelReminderSummary = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(await getTravelReminderSummary(userId));
  } catch (error) {
    return sendError(res, error, "Travel reminder summary failed");
  }
};

exports.getTravelReminders = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    const reminders = await listTravelReminders({
      userId,
      status: req.query?.status || "",
      limit: req.query?.limit,
    });

    return res.json(reminders);
  } catch (error) {
    return sendError(res, error, "Travel reminders load failed");
  }
};

exports.getTravelBookingReminders = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(
      await getBookingReminderState({
        userId,
        bookingId: req.params.bookingId,
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel booking reminders load failed");
  }
};

exports.getTravelReminderSettings = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(await getTravelReminderSettings(userId));
  } catch (error) {
    return sendError(res, error, "Travel reminder settings load failed");
  }
};

exports.updateTravelReminderSettings = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);
    const actorId = getActorId(req);

    return res.json(
      await updateTravelReminderSettings({
        userId,
        actorId,
        payload: req.body || {},
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel reminder settings update failed");
  }
};

exports.sendTravelReminderEmail = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(
      await sendReminderEmailNow({
        userId,
        reminderId: req.params.id,
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel reminder email failed");
  }
};

exports.markTravelReminderRead = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);
    const actorId = getActorId(req);

    return res.json(
      await markReminderRead({
        userId,
        actorId,
        reminderId: req.params.id,
        read: req.body?.read !== false,
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel reminder read update failed");
  }
};

exports.getTravelReminderWhatsAppMessage = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(
      await getWhatsAppReminderMessage({
        userId,
        reminderId: req.params.id,
        lang: req.query?.lang || "en",
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel reminder WhatsApp message failed");
  }
};

exports.cancelTravelBookingReminders = async (req, res) => {
  try {
    const userId = serializeRequestUserId(req);

    return res.json(
      await cancelBookingReminders({
        userId,
        bookingId: req.params.bookingId,
        reason: "Cancelled by user",
        includeDue: true,
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel booking reminders cancel failed");
  }
};
