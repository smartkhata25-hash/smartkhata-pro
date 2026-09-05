const Counter = require("../../models/Counter");
const { getBusinessDateKey } = require("../../utils/businessDate");

const FINAL_TRAVEL_INVOICE_PATTERN = /^TR-\d{4}-\d{5}$/;

const getYear = (date = new Date()) => {
  return getBusinessDateKey(date, { fallback: new Date() }).slice(0, 4);
};

const isFinalTravelInvoiceNumber = (value = "") =>
  FINAL_TRAVEL_INVOICE_PATTERN.test(String(value || "").trim().toUpperCase());

const generateTravelInvoiceNumber = async (userId, date = new Date(), session = null) => {
  const year = getYear(date);

  const counter = await Counter.findOneAndUpdate(
    {
      userId,
      type: `travel_booking_${year}`,
    },
    {
      $inc: {
        seq: 1,
      },
      $setOnInsert: {
        userId,
        type: `travel_booking_${year}`,
      },
    },
    {
      new: true,
      upsert: true,
      session,
      setDefaultsOnInsert: false,
    },
  );

  return `TR-${year}-${String(counter.seq).padStart(5, "0")}`;
};

const generateTemporaryBookingNumber = ({
  id,
  status = "draft",
  date = new Date(),
}) => {
  const year = getYear(date);
  const prefix = status === "quotation" ? "TQ" : "TD";
  const suffix = String(id || "")
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(-8)
    .toUpperCase();

  return `${prefix}-${year}-${suffix || Date.now().toString(36).toUpperCase()}`;
};

const resolveTravelInvoiceNumber = async ({
  booking,
  userId,
  date = new Date(),
  session = null,
}) => {
  if (isFinalTravelInvoiceNumber(booking.invoiceNumber)) {
    return booking.invoiceNumber;
  }

  if (isFinalTravelInvoiceNumber(booking.bookingNumber)) {
    return booking.bookingNumber;
  }

  return generateTravelInvoiceNumber(userId, date, session);
};

module.exports = {
  FINAL_TRAVEL_INVOICE_PATTERN,
  generateTemporaryBookingNumber,
  generateTravelInvoiceNumber,
  isFinalTravelInvoiceNumber,
  resolveTravelInvoiceNumber,
};
