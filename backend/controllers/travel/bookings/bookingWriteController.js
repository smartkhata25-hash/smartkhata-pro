const mongoose = require("mongoose");

const TravelBooking = require("../../../models/TravelBooking");
const { logActivity } = require("../../../utils/activityLogger");
const {
  assertAccountingEditsAllowed,
  postTravelInvoiceAccounting,
  recalculateTravelAccountingAccounts,
  TRAVEL_INVOICE_ORIGIN,
} = require("../../../services/travel/travelInvoiceAccountingService");
const {
  clearTravelReportCache,
} = require("../../../services/travel/travelReportCacheService");
const {
  applySoftDeleteFields,
  applyVoidFields,
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../../../services/travel/travelSoftDeleteService");
const {
  applyPrimaryAttachmentFields,
  cleanupTravelInvoiceAttachments,
  mergeTravelInvoiceAttachments,
  uploadTravelInvoiceFiles,
} = require("../../../services/travel/travelInvoiceAttachmentService");
const {
  buildBookingPayload,
  cleanString,
  generateTemporaryBookingNumber,
  getActorId,
  getUserId,
  populateBooking,
  sendError,
  serializeBooking,
} = require("../../../services/travel/travelBookingService");
const {
  cancelBookingReminders,
  syncTravelBookingReminder,
} = require("../../../services/travel/travelReminderService");

const runReminderTask = async (task, label) => {
  try {
    await task();
  } catch (error) {
    console.error(label, error.message);
  }
};

exports.createTravelBooking = async (req, res) => {
  const session = await mongoose.startSession();
  let uploadedAttachments = [];
  let booking = null;
  let accountingAccountIds = [];
  let transactionCommitted = false;

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const payload = await buildBookingPayload(req.body, req);
    uploadedAttachments = await uploadTravelInvoiceFiles(req.files, userId);

    await session.withTransaction(async () => {
      const bookingId = new mongoose.Types.ObjectId();
      const bookingNumber = generateTemporaryBookingNumber({
        id: bookingId,
        status: payload.status,
        date: payload.invoiceDate || new Date(),
      });

      booking = new TravelBooking({
        _id: bookingId,
        ...payload,
        userId,
        bookingNumber,
        createdBy: actorId,
        statusHistory: [
          {
            status: payload.status,
            changedBy: actorId,
            changedAt: new Date(),
            note:
              payload.status === "quotation"
                ? "Quotation saved"
                : "Booking created",
          },
        ],
      });

      applyPrimaryAttachmentFields(booking, uploadedAttachments);

      await booking.save({ session });

      const accountingResult = await postTravelInvoiceAccounting({
        booking,
        userId,
        actorId,
        session,
      });

      accountingAccountIds = accountingResult.accountIds;
    });
    transactionCommitted = true;

    await recalculateTravelAccountingAccounts(accountingAccountIds);
    clearTravelReportCache(userId);
    await runReminderTask(
      () =>
        syncTravelBookingReminder({
          bookingId: booking._id,
          userId,
          actorId,
          settings: req.body?.reminderSettings,
        }),
      "Travel booking reminder sync failed:",
    );

    try {
      await logActivity({
        req,
        action: "create",
        module: "travel.bookings",
        entityType: "TravelBooking",
        entityId: booking._id,
        title: `Booking ${booking.bookingNumber}`,
        billNo: booking.bookingNumber,
        description:
          booking.status === "quotation"
            ? `Quotation ${booking.bookingNumber} saved`
            : `Booking ${booking.bookingNumber} created`,
        after: booking,
      });
    } catch (logError) {
      console.error("Travel booking activity log failed:", logError.message);
    }

    const populated = await populateBooking(
      TravelBooking.findById(booking._id),
    ).lean();

    return res.status(201).json(serializeBooking(populated));
  } catch (error) {
    if (!transactionCommitted) {
      await cleanupTravelInvoiceAttachments(uploadedAttachments);
    }

    return sendError(res, error, "Travel booking create failed");
  } finally {
    await session.endSession();
  }
};

exports.updateTravelBooking = async (req, res) => {
  const session = await mongoose.startSession();
  let uploadedAttachments = [];
  let removedAttachments = [];
  let accountingAccountIds = [];
  let booking = null;
  let before = null;
  let transactionCommitted = false;

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    booking = await TravelBooking.findOne({
      _id: req.params.id,
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
    });

    if (!booking) {
      return res.status(404).json({ message: "Travel booking not found" });
    }

    before = booking.toObject();
    const payload = await buildBookingPayload(req.body, req, booking);
    assertAccountingEditsAllowed(booking, payload);

    uploadedAttachments = await uploadTravelInvoiceFiles(req.files, userId);

    const mergedAttachments = mergeTravelInvoiceAttachments({
      existingAttachments: booking.attachments || [],
      uploadedAttachments,
      keepAttachmentKeys: req.body?.keepAttachmentKeys,
    });

    removedAttachments = mergedAttachments.removed;

    await session.withTransaction(async () => {
      if (payload.status !== booking.status) {
        booking.statusHistory.push({
          status: payload.status,
          changedBy: actorId,
          changedAt: new Date(),
          note: cleanString(req.body?.statusNote),
        });
      }

      Object.assign(booking, payload);
      applyPrimaryAttachmentFields(booking, mergedAttachments.attachments);

      await booking.save({ session });

      const accountingResult = await postTravelInvoiceAccounting({
        booking,
        userId,
        actorId,
        session,
      });

      accountingAccountIds = accountingResult.accountIds;
    });
    transactionCommitted = true;

    await recalculateTravelAccountingAccounts(accountingAccountIds);
    clearTravelReportCache(userId);
    await cleanupTravelInvoiceAttachments(removedAttachments);
    await runReminderTask(
      () =>
        syncTravelBookingReminder({
          bookingId: booking._id,
          userId,
          actorId,
          settings: req.body?.reminderSettings,
        }),
      "Travel booking reminder sync failed:",
    );

    try {
      await logActivity({
        req,
        action: "update",
        module: "travel.bookings",
        entityType: "TravelBooking",
        entityId: booking._id,
        title: `Booking ${booking.bookingNumber}`,
        billNo: booking.bookingNumber,
        description: `Booking ${booking.bookingNumber} updated`,
        before,
        after: booking,
      });
    } catch (logError) {
      console.error("Travel booking activity log failed:", logError.message);
    }

    const populated = await populateBooking(
      TravelBooking.findById(booking._id),
    ).lean();

    return res.json(serializeBooking(populated));
  } catch (error) {
    if (!transactionCommitted) {
      await cleanupTravelInvoiceAttachments(uploadedAttachments);
    }

    return sendError(res, error, "Travel booking update failed");
  } finally {
    await session.endSession();
  }
};

const archiveOrVoidTravelBooking = async (
  req,
  res,
  { forceVoid = false } = {},
) => {
  const session = await mongoose.startSession();
  let booking = null;
  let before = null;
  let accountingAccountIds = [];
  let action = "delete";

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const reason = getSoftDeleteReason(req);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    booking = await TravelBooking.findOne({
      _id: req.params.id,
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
    });

    if (!booking) {
      return res.status(404).json({ message: "Travel booking not found" });
    }

    before = booking.toObject();

    await session.withTransaction(async () => {
      booking = await TravelBooking.findOne({
        _id: req.params.id,
        userId,
        isActive: true,
        isDeleted: false,
        isVoided: { $ne: true },
      }).session(session);

      if (!booking) {
        throw Object.assign(new Error("Travel booking not found"), {
          statusCode: 404,
        });
      }

      if (booking.accountingPosted || forceVoid) {
        const reversalResult = await reverseTravelJournals({
          userId,
          referenceId: booking._id,
          originModule: TRAVEL_INVOICE_ORIGIN,
          sourceTypes: [
            "travel_booking",
            "travel_vendor_cost",
            "receive_payment",
            "pay_bill",
          ],
          session,
          reason: reason || "Travel invoice voided",
        });

        if (booking.accountingPosted && reversalResult.journals.length === 0) {
          throw Object.assign(
            new Error(
              "Posted travel invoice journals were not found for reversal",
            ),
            { statusCode: 409 },
          );
        }

        accountingAccountIds = reversalResult.accountIds;
        booking.reversalJournalEntryIds = [
          ...new Set([
            ...(booking.reversalJournalEntryIds || []).map((id) => String(id)),
            ...reversalResult.reversalIds.map((id) => String(id)),
          ]),
        ];
        applyVoidFields(booking, {
          actorId,
          reason: reason || "Travel invoice voided",
        });
        booking.accountingStatus = "posted";
        booking.status = "cancelled";
        action = "void";
      }

      applySoftDeleteFields(booking, {
        actorId,
        reason:
          reason ||
          (booking.accountingPosted
            ? "Travel invoice voided"
            : "Travel booking archived"),
      });

      booking.statusHistory.push({
        status: booking.status,
        changedBy: actorId,
        changedAt: new Date(),
        note: booking.accountingPosted
          ? reason || "Travel invoice voided"
          : reason || "Travel booking archived",
      });

      await booking.save({ session });
    });

    await recalculateTravelSoftDeleteAccounts(accountingAccountIds);
    clearTravelReportCache(userId);
    await runReminderTask(
      () =>
        cancelBookingReminders({
          userId,
          bookingId: booking._id,
          reason:
            action === "void"
              ? "Travel booking voided"
              : "Travel booking archived",
          includeDue: true,
        }),
      "Travel booking reminder cancellation failed:",
    );

    try {
      await logActivity({
        req,
        action,
        module: "travel.bookings",
        entityType: "TravelBooking",
        entityId: booking._id,
        title: `Booking ${booking.bookingNumber}`,
        billNo: booking.bookingNumber,
        description:
          action === "void"
            ? `Booking ${booking.bookingNumber} voided with accounting reversal`
            : `Booking ${booking.bookingNumber} archived`,
        before,
        after: {
          isDeleted: booking.isDeleted,
          isActive: booking.isActive,
          isVoided: booking.isVoided,
          reversalJournalEntryIds: booking.reversalJournalEntryIds,
          deleteReason: booking.deleteReason,
          voidReason: booking.voidReason,
        },
      });
    } catch (logError) {
      console.error(
        "Travel booking delete activity log failed:",
        logError.message,
      );
    }

    return res.json({
      message:
        action === "void"
          ? "Travel invoice voided and archived successfully"
          : "Travel booking archived successfully",
      booking: serializeBooking(booking),
      reversed: action === "void",
    });
  } catch (error) {
    return sendError(res, error, "Travel booking delete failed");
  } finally {
    await session.endSession();
  }
};

exports.archiveTravelBooking = (req, res) =>
  archiveOrVoidTravelBooking(req, res);

exports.voidTravelBooking = (req, res) =>
  archiveOrVoidTravelBooking(req, res, { forceVoid: true });
