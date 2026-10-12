const mongoose = require("mongoose");

const Party = require("../../models/Party");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");
const TravelRefund = require("../../models/TravelRefund");
const TravelVendorReturn = require("../../models/TravelVendorReturn");
const {
  POSTING_STATUSES,
  getVendorCostKey,
} = require("../../services/travel/travelInvoiceAccountingService");
const { roundMoney } = require("../../services/travel/travelAccountingMetricsService");
const {
  buildPurchaseRowKey,
  buildVendorPurchaseGroups,
  calculateRemainingReturnAmount,
} = require("../../services/travel/travelPurchaseInvoiceService");
const {
  cleanString,
  escapeRegex,
  getUserId,
  sendError,
} = require("../../services/travel/travelBookingService");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../utils/moduleScope");
const { buildBusinessDateRange } = require("../../utils/businessDate");

const SERVICE_TYPE_ALIASES = Object.freeze({
  ticket: "air_ticket",
  tickets: "air_ticket",
  visa: "visit_visa",
  visas: "visit_visa",
  hotel: "hotel",
  hotels: "hotel",
  umrah: "umrah_package",
});

const PAYMENT_STATUSES = new Set(["paid", "partial", "due"]);

const addAndClause = (query, clause) => {
  query.$and = [...(query.$and || []), clause];
};

const normalizeServiceType = (value = "") => {
  const normalized = cleanString(value).toLowerCase();

  return SERVICE_TYPE_ALIASES[normalized] || normalized;
};

const findVendorMatches = async (userId, search) => {
  const safeSearch = escapeRegex(search);
  const match = {
    $or: [
      { name: { $regex: safeSearch, $options: "i" } },
      { phone: { $regex: safeSearch, $options: "i" } },
      { email: { $regex: safeSearch, $options: "i" } },
    ],
  };

  const [vendors, parties] = await Promise.all([
    Supplier.find(
      applySupplierModuleScopeFilter(
        { userId, ...match },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id")
      .lean(),
    Party.find(
      applyModuleScopeFilter(
        {
          userId,
          role: { $in: ["supplier", "both"] },
          ...match,
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id")
      .lean(),
  ]);

  return {
    vendorIds: vendors.map((vendor) => vendor._id),
    partyIds: parties.map((party) => party._id),
  };
};

const loadVendorMaps = async (userId, groups) => {
  const vendorIds = [
    ...new Set(groups.map((group) => String(group.vendorId || "")).filter(Boolean)),
  ];
  const partyIds = [
    ...new Set(groups.map((group) => String(group.vendorPartyId || "")).filter(Boolean)),
  ];

  const [vendors, parties] = await Promise.all([
    vendorIds.length
      ? Supplier.find(
          applySupplierModuleScopeFilter(
            {
              _id: { $in: vendorIds },
              userId,
            },
            MODULE_SCOPES.TRAVEL,
          ),
        )
          .select("name phone email account isDeleted hiddenReason")
          .lean()
      : [],
    partyIds.length
      ? Party.find(
          applyModuleScopeFilter(
            {
              _id: { $in: partyIds },
              userId,
              role: { $in: ["supplier", "both"] },
            },
            MODULE_SCOPES.TRAVEL,
          ),
        )
          .select("name phone email account isActive isDeleted role")
          .lean()
      : [],
  ]);

  return {
    vendors: new Map(vendors.map((vendor) => [String(vendor._id), vendor])),
    parties: new Map(parties.map((party) => [String(party._id), party])),
  };
};

const getRecoveryKey = (invoiceId, source = {}) =>
  `${String(invoiceId || "")}|${getVendorCostKey(source)}`;

const loadPriorRecoveries = async (userId, bookingIds) => {
  if (bookingIds.length === 0) {
    return {
      refundRecoveries: new Map(),
      vendorReturns: new Map(),
    };
  }

  const [returns, refunds] = await Promise.all([
    TravelVendorReturn.find({
      userId,
      originalInvoiceId: { $in: bookingIds },
      isDeleted: false,
      isReversed: { $ne: true },
    })
      .select("originalInvoiceId vendorType vendorId vendorPartyId vendorReturnAmount")
      .lean(),
    TravelRefund.find({
      userId,
      originalInvoiceId: { $in: bookingIds },
      isDeleted: false,
      isReversed: { $ne: true },
    })
      .select("originalInvoiceId refundItems")
      .lean(),
  ]);

  const vendorReturns = new Map();
  const refundRecoveries = new Map();

  returns.forEach((record) => {
    const key = getRecoveryKey(record.originalInvoiceId, record);
    vendorReturns.set(
      key,
      roundMoney((vendorReturns.get(key) || 0) + Number(record.vendorReturnAmount || 0)),
    );
  });

  refunds.forEach((refund) => {
    (refund.refundItems || []).forEach((item) => {
      const key = getRecoveryKey(refund.originalInvoiceId, item);
      refundRecoveries.set(
        key,
        roundMoney(
          (refundRecoveries.get(key) || 0) + Number(item.vendorRecoveryAmount || 0),
        ),
      );
    });
  });

  return {
    refundRecoveries,
    vendorReturns,
  };
};

const matchesSearch = (row, search) => {
  if (!search) {
    return true;
  }

  const haystack = [
    row.sourceInvoice,
    row.vendorName,
    row.vendorPhone,
    ...(row.serviceLabels || []),
    ...(row.serviceTypes || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
};

exports.getTravelPurchaseInvoices = async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const search = cleanString(req.query.search);
    const serviceType = normalizeServiceType(req.query.serviceType);
    const paymentStatus = cleanString(req.query.paymentStatus).toLowerCase();
    const query = {
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
      accountingPosted: true,
      status: { $in: [...POSTING_STATUSES] },
    };
    const dateRange = buildBusinessDateRange({
      startDate: req.query.fromDate,
      endDate: req.query.toDate,
      field: "invoiceDate",
    }).invoiceDate;

    if (dateRange) {
      query.invoiceDate = dateRange;
    }

    if (serviceType) {
      addAndClause(query, {
        $or: [
          { serviceType },
          { "bookingItems.itemType": serviceType },
          { "bookingItems.umrahDetails.components.componentType": serviceType },
        ],
      });
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const vendorMatches = await findVendorMatches(userId, search);

      addAndClause(query, {
        $or: [
          { bookingNumber: { $regex: safeSearch, $options: "i" } },
          { invoiceNumber: { $regex: safeSearch, $options: "i" } },
          { "bookingItems.title": { $regex: safeSearch, $options: "i" } },
          { "bookingItems.description": { $regex: safeSearch, $options: "i" } },
          {
            "bookingItems.umrahDetails.components.label": {
              $regex: safeSearch,
              $options: "i",
            },
          },
          { "bookingItems.vendorId": { $in: vendorMatches.vendorIds } },
          { "bookingItems.paxPricing.vendorId": { $in: vendorMatches.vendorIds } },
          {
            "bookingItems.umrahDetails.components.vendorId": {
              $in: vendorMatches.vendorIds,
            },
          },
          { "bookingItems.vendorPartyId": { $in: vendorMatches.partyIds } },
          {
            "bookingItems.paxPricing.vendorPartyId": {
              $in: vendorMatches.partyIds,
            },
          },
          {
            "bookingItems.umrahDetails.components.vendorPartyId": {
              $in: vendorMatches.partyIds,
            },
          },
        ],
      });
    }

    const bookings = await TravelBooking.find(query)
      .select(
        "bookingNumber invoiceNumber invoiceDate travelStartDate serviceType bookingItems vendorPayments baseCurrency updatedAt",
      )
      .sort({ invoiceDate: -1, updatedAt: -1, _id: -1 })
      .lean();

    const rawRows = [];

    bookings.forEach((booking) => {
      try {
        buildVendorPurchaseGroups(booking).forEach((group) => {
          rawRows.push({
            ...group,
            bookingId: booking._id,
            sourceInvoice: booking.invoiceNumber || booking.bookingNumber,
            invoiceDate: booking.invoiceDate,
            travelDate: booking.travelStartDate,
            baseCurrency: booking.baseCurrency,
          });
        });
      } catch (error) {
        console.error(
          `Travel purchase invoice skipped for booking ${booking._id}:`,
          error.message,
        );
      }
    });

    const vendorMaps = await loadVendorMaps(userId, rawRows);
    let rows = rawRows.map((row) => {
      const vendor =
        row.vendorType === "party"
          ? vendorMaps.parties.get(String(row.vendorPartyId || ""))
          : vendorMaps.vendors.get(String(row.vendorId || ""));
      const vendorActive =
        Boolean(vendor?.account) &&
        vendor?.isDeleted !== true &&
        (row.vendorType !== "party" || vendor?.isActive !== false);

      return {
        ...row,
        _id: buildPurchaseRowKey({ ...row, bookingId: row.bookingId }),
        vendorName: vendor?.name || "",
        vendorPhone: vendor?.phone || "",
        vendorActive,
      };
    });

    rows = rows.filter((row) => {
      const serviceMatches =
        !serviceType || (row.serviceTypes || []).includes(serviceType);
      const paymentMatches =
        !PAYMENT_STATUSES.has(paymentStatus) || row.paymentStatus === paymentStatus;

      return serviceMatches && paymentMatches && matchesSearch(row, search);
    });

    const bookingIds = [
      ...new Set(rows.map((row) => String(row.bookingId || "")).filter(Boolean)),
    ].map((id) => new mongoose.Types.ObjectId(id));
    const prior = await loadPriorRecoveries(userId, bookingIds);

    rows = rows.map((row) => {
      const recoveryKey = getRecoveryKey(row.bookingId, row);
      const priorVendorReturns = roundMoney(prior.vendorReturns.get(recoveryKey) || 0);
      const priorRefundRecovery = roundMoney(prior.refundRecoveries.get(recoveryKey) || 0);
      const remainingReturnAmount = calculateRemainingReturnAmount({
        purchaseAmount: row.purchaseAmount,
        priorVendorReturns,
        priorRefundRecovery,
      });
      const canReturn = row.vendorActive && remainingReturnAmount > 0;

      return {
        ...row,
        priorVendorReturns,
        priorRefundRecovery,
        remainingReturnAmount,
        canReturn,
        returnDisabledReason: canReturn
          ? ""
          : remainingReturnAmount <= 0
            ? "fully_returned"
            : "vendor_unavailable",
      };
    });

    const total = rows.length;
    const start = (page - 1) * limit;

    return res.json({
      data: rows.slice(start, start + limit),
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error, "Travel purchase invoice fetch failed");
  }
};

exports._test = {
  getRecoveryKey,
  matchesSearch,
};
