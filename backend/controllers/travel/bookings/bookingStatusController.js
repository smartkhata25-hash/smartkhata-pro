const mongoose = require("mongoose");

const TravelBooking = require("../../../models/TravelBooking");
const { logActivity } = require("../../../utils/activityLogger");
const {
  POSTING_STATUSES,
  postTravelInvoiceAccounting,
  recalculateTravelAccountingAccounts,
} = require("../../../services/travel/travelInvoiceAccountingService");
const { clearTravelReportCache } = require("../../../services/travel/travelReportCacheService");
const {
  cleanString,
  getActorId,
  getUserId,
  normalizeStatus,
  populateBooking,
  sendError,
  serializeBooking,
} = require("../../../services/travel/travelBookingService");
const {
  cancelBookingReminders,
} = require("../../../services/travel/travelReminderService");

const cancelRemindersAfterStatusChange = async ({
  userId,
  bookingId,
  status,
}) => {
  if (!["cancelled", "completed"].includes(status)) {
    return;
  }

  try {
    await cancelBookingReminders({
      userId,
      bookingId,
      reason:
        status === "completed"
          ? "Travel booking completed"
          : "Travel booking cancelled",
      includeDue: true,
    });
  } catch (error) {
    console.error("Travel booking reminder status cancellation failed:", error.message);
  }
};

exports.updateTravelBookingStatus = async (req, res) => {
  const session = await mongoose.startSession();
  let accountingAccountIds = [];

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const status = normalizeStatus(req.body?.status);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await TravelBooking.findOne({
      _id: req.params.id,
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
    });

    if (!booking) {
      return res.status(404).json({ message: "Travel booking not found" });
    }

    const before = {
      status: booking.status,
      confirmedAt: booking.confirmedAt,
      quotationDate: booking.quotationDate,
    };

    if (booking.accountingPosted && status === "cancelled") {
      return res.status(400).json({
        message: "Posted travel invoices cannot be cancelled. Use the Travel Refund flow for reversals.",
      });
    }

    await session.withTransaction(async () => {
      if (booking.status !== status) {
        booking.status = status;

        if (status === "quotation" && !booking.quotationDate) {
          booking.quotationDate = new Date();
        }

        if (POSTING_STATUSES.has(status) && !booking.confirmedAt) {
          booking.confirmedAt = new Date();
        }

        booking.statusHistory.push({
          status,
          changedBy: actorId,
          changedAt: new Date(),
          note: cleanString(req.body?.note),
        });
      }

      await booking.save({ session });

      const accountingResult = await postTravelInvoiceAccounting({
        booking,
        userId,
        actorId,
        session,
      });

      accountingAccountIds = accountingResult.accountIds;
    });

    await recalculateTravelAccountingAccounts(accountingAccountIds);
    clearTravelReportCache(userId);
    await cancelRemindersAfterStatusChange({
      userId,
      bookingId: booking._id,
      status: booking.status,
    });

    try {
      await logActivity({
        req,
        action: "update",
        module: "travel.bookings",
        entityType: "TravelBooking",
        entityId: booking._id,
        title: `Booking ${booking.bookingNumber}`,
        billNo: booking.bookingNumber,
        description: `Booking ${booking.bookingNumber} status changed to ${status}`,
        before,
        after: {
          status: booking.status,
          confirmedAt: booking.confirmedAt,
          quotationDate: booking.quotationDate,
          accountingPosted: booking.accountingPosted,
        },
      });
    } catch (logError) {
      console.error("Travel booking status activity log failed:", logError.message);
    }

    const populated = await populateBooking(TravelBooking.findById(booking._id)).lean();

    return res.json(serializeBooking(populated));
  } catch (error) {
    return sendError(res, error, "Travel booking status update failed");
  } finally {
    await session.endSession();
  }
};

exports.cancelTravelBooking = async (req, res) => {
  req.body = {
    ...req.body,
    status: "cancelled",
  };

  return exports.updateTravelBookingStatus(req, res);
};
