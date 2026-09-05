const mongoose = require("mongoose");

const Account = require("../../../models/Account");
const Customer = require("../../../models/Customer");
const Supplier = require("../../../models/Supplier");
const TravelBooking = require("../../../models/TravelBooking");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../../utils/moduleScope");
const {
  BOOKING_STATUSES,
  SERVICE_TYPES,
  cleanString,
  escapeRegex,
  getUserId,
  populateBooking,
  sendError,
  serializeBooking,
} = require("../../../services/travel/travelBookingService");
const {
  buildBusinessDateRange,
  startOfBusinessDay,
} = require("../../../utils/businessDate");

const SERVICE_TYPE_ALIASES = Object.freeze({
  ticket: "air_ticket",
  tickets: "air_ticket",
  air: "air_ticket",
  air_ticket: "air_ticket",
  visa: "visit_visa",
  visas: "visit_visa",
  visit_visa: "visit_visa",
  hotel: "hotel",
  hotels: "hotel",
  umrah: "umrah_package",
  umrah_package: "umrah_package",
});

const PAYMENT_STATE_FILTERS = new Set(["paid", "partial", "due"]);

const normalizeServiceTypeFilter = (value = "") => {
  const clean = cleanString(value).toLowerCase();

  return SERVICE_TYPE_ALIASES[clean] || clean;
};

const optionalObjectId = (value) => {
  if (!value) {
    return null;
  }

  return mongoose.Types.ObjectId.isValid(String(value))
    ? new mongoose.Types.ObjectId(String(value))
    : null;
};

const addAndClause = (query, clause) => {
  query.$and = [...(query.$and || []), clause];
};

const applyBookingDateRange = (query, fromDate, toDate) => {
  const range = buildBusinessDateRange({
    startDate: fromDate,
    endDate: toDate,
    field: "travelStartDate",
  }).travelStartDate;

  if (range) {
    query.travelStartDate = {
      ...(query.travelStartDate || {}),
      ...range,
    };
  }
};

const applyPaymentStateFilter = (query, value = "") => {
  const state = cleanString(value).toLowerCase();

  if (!PAYMENT_STATE_FILTERS.has(state)) {
    return;
  }

  if (state === "paid") {
    addAndClause(query, {
      accountingPosted: true,
      netSale: { $gt: 0 },
      customerDue: { $lte: 0 },
    });
  }

  if (state === "partial") {
    addAndClause(query, {
      receivedAmount: { $gt: 0 },
      customerDue: { $gt: 0 },
    });
  }

  if (state === "due") {
    addAndClause(query, {
      customerDue: { $gt: 0 },
    });
  }
};

const findCustomerIdsForBookingSearch = async (userId, search) => {
  const safeSearch = escapeRegex(search);

  return Customer.find(
    applyModuleScopeFilter(
      {
        createdBy: userId,
        isActive: { $ne: false },
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
        ],
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .limit(50)
    .lean();
};

const findVendorIdsForBookingSearch = async (userId, search) => {
  const safeSearch = escapeRegex(search);

  return Supplier.find(
    applySupplierModuleScopeFilter(
      {
        userId,
        isDeleted: false,
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { email: { $regex: safeSearch, $options: "i" } },
          { contactPerson: { $regex: safeSearch, $options: "i" } },
        ],
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .limit(50)
    .lean();
};

exports.getTravelBookings = async (req, res) => {
  try {
    const userId = getUserId(req);
    const {
      page = 1,
      limit = 50,
      search = "",
      status = "",
      serviceType = "",
      fromDate = "",
      toDate = "",
      customerId = "",
      vendorId = "",
      balance = "",
      paymentState = "",
      datePreset = "",
    } = req.query;

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const query = {
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
    };

    if (
      status &&
      BOOKING_STATUSES.includes(cleanString(status).toLowerCase())
    ) {
      query.status = cleanString(status).toLowerCase();
    }

    const normalizedServiceType = normalizeServiceTypeFilter(serviceType);

    if (
      normalizedServiceType &&
      SERVICE_TYPES.includes(normalizedServiceType)
    ) {
      addAndClause(query, {
        $or: [
          { serviceType: normalizedServiceType },
          { "bookingItems.itemType": normalizedServiceType },
        ],
      });
    }

    applyBookingDateRange(query, fromDate, toDate);

    const normalizedDatePreset = cleanString(datePreset).toLowerCase();

    if (normalizedDatePreset === "upcoming") {
      const today = startOfBusinessDay(new Date());
      query.travelStartDate = {
        ...(query.travelStartDate || {}),
        $gte:
          query.travelStartDate?.$gte && query.travelStartDate.$gte > today
            ? query.travelStartDate.$gte
            : today,
      };

      if (!query.status) {
        query.status = { $ne: "cancelled" };
      }
    }

    const selectedCustomerId = optionalObjectId(customerId);

    if (selectedCustomerId) {
      query.customerId = selectedCustomerId;
    }

    const selectedVendorId = optionalObjectId(vendorId);

    if (selectedVendorId) {
      addAndClause(query, {
        $or: [
          { "bookingItems.vendorId": selectedVendorId },
          { "bookingItems.umrahDetails.components.vendorId": selectedVendorId },
        ],
      });
    }

    applyPaymentStateFilter(query, paymentState || balance);

    const cleanSearch = cleanString(search);

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);
      const [matchingCustomers, matchingVendors] = await Promise.all([
        findCustomerIdsForBookingSearch(userId, cleanSearch),
        findVendorIdsForBookingSearch(userId, cleanSearch),
      ]);

      addAndClause(query, {
        $or: [
          { bookingNumber: { $regex: safeSearch, $options: "i" } },
          { invoiceNumber: { $regex: safeSearch, $options: "i" } },
          { notes: { $regex: safeSearch, $options: "i" } },
          { internalNotes: { $regex: safeSearch, $options: "i" } },
          { "bookingItems.title": { $regex: safeSearch, $options: "i" } },
          { "bookingItems.description": { $regex: safeSearch, $options: "i" } },
          {
            "bookingItems.ticketDetails.pnr": {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            "bookingItems.ticketDetails.ticketNumber": {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            "bookingItems.visaDetails.reference": {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            customerId: {
              $in: matchingCustomers.map((customer) => customer._id),
            },
          },
          {
            "bookingItems.vendorId": {
              $in: matchingVendors.map((vendor) => vendor._id),
            },
          },
          {
            "bookingItems.umrahDetails.components.vendorId": {
              $in: matchingVendors.map((vendor) => vendor._id),
            },
          },
        ],
      });
    }

    const sort =
      normalizedDatePreset === "upcoming"
        ? { travelStartDate: 1, updatedAt: -1, _id: 1 }
        : { updatedAt: -1, _id: -1 };

    const [bookings, total] = await Promise.all([
      populateBooking(
        TravelBooking.find(query)
          .select(
            "bookingNumber invoiceNumber invoiceDate status serviceType customerId travelers bookingItems travelStartDate travelEndDate sellingTotal costTotal discountAmount netSale receivedAmount customerDue vendorPayable grossProfit estimatedProfit refundedAmount customerRefundedAmount vendorRecoveredAmount refundCount baseCurrency currencyBreakdown accountingPosted accountingStatus attachments attachmentUrl attachmentType attachmentSize attachmentOriginalName updatedAt createdAt",
          )
          .sort(sort)
          .skip((pageNumber - 1) * limitNumber)
          .limit(limitNumber),
      ).lean(),
      TravelBooking.countDocuments(query),
    ]);

    return res.json({
      data: bookings.map(serializeBooking),
      total,
      page: pageNumber,
      limit: limitNumber,
    });
  } catch (error) {
    return sendError(res, error, "Travel booking fetch failed");
  }
};

exports.getTravelBookingById = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await populateBooking(
      TravelBooking.findOne({
        _id: req.params.id,
        userId,
        isActive: true,
        isDeleted: false,
        isVoided: { $ne: true },
      }),
    ).lean();

    if (!booking) {
      return res.status(404).json({ message: "Travel booking not found" });
    }

    return res.json(serializeBooking(booking));
  } catch (error) {
    return sendError(res, error, "Travel booking fetch failed");
  }
};

exports.getTravelPaymentAccounts = async (req, res) => {
  try {
    const userId = getUserId(req);

    const accounts = await Account.find(
      applyModuleScopeFilter(
        {
          userId,
          isActive: { $ne: false },
          type: "Asset",
          category: { $in: ["cash", "bank", "online", "cheque"] },
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("name code category type")
      .sort({ category: 1, name: 1, _id: 1 })
      .lean();

    return res.json(accounts);
  } catch (error) {
    return sendError(res, error, "Travel payment accounts fetch failed");
  }
};
