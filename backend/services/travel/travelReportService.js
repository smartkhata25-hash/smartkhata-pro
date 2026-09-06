const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Customer = require("../../models/Customer");
const Expense = require("../../models/Expense");
const JournalEntry = require("../../models/JournalEntry");
const Party = require("../../models/Party");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");
const TravelRefund = require("../../models/TravelRefund");
const TravelService = require("../../models/TravelService");
const TravelVendorReturn = require("../../models/TravelVendorReturn");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../utils/moduleScope");
const { POSTING_STATUSES } = require("./travelInvoiceAccountingService");
const {
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_RECEIVE_PAYMENT_ORIGIN,
  TRAVEL_REFUND_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_RETURN_ORIGIN,
  getTravelCustomerBalanceMap,
  getTravelPartyBalanceMap,
  getTravelVendorBalanceMap,
  roundMoney,
} = require("./travelAccountingMetricsService");
const { buildTravelPartyRoleQuery } = require("./travelCounterpartyService");
const {
  getCachedTravelReport,
  getTravelReportCacheKey,
  setCachedTravelReport,
} = require("./travelReportCacheService");
const { getBusinessValueSummary } = require("../businessValueService");
const {
  BUSINESS_TIME_ZONE,
  buildBusinessPresetDateRange,
  getBusinessDateKey,
} = require("../../utils/businessDate");
const {
  TRAVEL_EMPLOYEE_ORIGINS,
} = require("../../utils/employeePayrollOrigins");

const PK_TIME_ZONE = BUSINESS_TIME_ZONE;
const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];
const TRAVEL_EXPENSE_ORIGIN = "travel_expense";
const TRAVEL_EXPENSE_ORIGINS = [
  TRAVEL_EXPENSE_ORIGIN,
  TRAVEL_EMPLOYEE_ORIGINS.SALARY,
];
const TRAVEL_EMPLOYEE_CASH_OUT_ORIGINS = [
  TRAVEL_EMPLOYEE_ORIGINS.SALARY_PAYMENT,
  TRAVEL_EMPLOYEE_ORIGINS.ADVANCE,
  TRAVEL_EMPLOYEE_ORIGINS.LOAN,
];
const TRAVEL_EMPLOYEE_CASH_IN_ORIGINS = [
  TRAVEL_EMPLOYEE_ORIGINS.ADVANCE_RECOVERY,
  TRAVEL_EMPLOYEE_ORIGINS.LOAN_RECOVERY,
];
const TRAVEL_PROFIT_SOURCE_TYPES = [
  "travel_booking",
  "travel_vendor_cost",
  "travel_refund",
  "travel_vendor_return",
];
const TRAVEL_PROFIT_ACCOUNT_CODES = [
  "TRAVEL_SALES",
  "TRAVEL_DISCOUNT",
  "TRAVEL_REFUND",
  "TRAVEL_PENALTY_INCOME",
  "TRAVEL_COST",
];

const SERVICE_LABELS = Object.freeze({
  air_ticket: "Air Ticket",
  visit_visa: "Visit Visa",
  hotel: "Hotel",
  umrah_package: "Umrah Package",
  transport: "Transport",
  appointment: "Appointment",
  token: "Token",
  insurance: "Insurance",
  service: "Other Service",
  other: "Other Service",
  mixed: "Mixed Service",
});

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const cleanString = (value = "") => String(value || "").trim();

const toObjectId = (value, label = "id") => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const addMoney = (...values) =>
  roundMoney(values.reduce((sum, value) => sum + Number(value || 0), 0));

const subtractMoney = (value, ...subtractions) =>
  roundMoney(Number(value || 0) - subtractions.reduce((sum, item) => sum + Number(item || 0), 0));

const calculateTravelProfitMath = ({
  grossSales = 0,
  discounts = 0,
  grossRefunds = 0,
  customerPenalties = 0,
  originalTravelCost = 0,
  vendorRecoveries = 0,
  vendorReturns = 0,
  travelExpenses = 0,
} = {}) => {
  const netRevenue = addMoney(grossSales, customerPenalties, -discounts, -grossRefunds);
  const netTravelCost = subtractMoney(originalTravelCost, vendorRecoveries, vendorReturns);
  const grossProfit = subtractMoney(netRevenue, netTravelCost);
  const netProfit = subtractMoney(grossProfit, travelExpenses);

  return {
    grossSales: roundMoney(grossSales),
    discounts: roundMoney(discounts),
    grossRefunds: roundMoney(grossRefunds),
    customerPenalties: roundMoney(customerPenalties),
    netRevenue,
    totalSales: netRevenue,
    originalTravelCost: roundMoney(originalTravelCost),
    vendorRecoveries: roundMoney(vendorRecoveries),
    vendorReturns: roundMoney(vendorReturns),
    netTravelCost,
    grossProfit,
    travelExpenses: roundMoney(travelExpenses),
    netProfit,
    grossMarginPct: netRevenue ? roundMoney((grossProfit / netRevenue) * 100) : 0,
    netMarginPct: netRevenue ? roundMoney((netProfit / netRevenue) * 100) : 0,
  };
};

const extractDateString = (value, label) => {
  const cleanValue = cleanString(value);
  const match = cleanValue.match(/^(\d{4}-\d{2}-\d{2})/);

  if (!match) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return match[1];
};

const normalizePreset = (value = "") => {
  const cleanValue = cleanString(value)
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

  const aliases = {
    all: "all_time",
    alltime: "all_time",
    all_time: "all_time",
    today: "today",
    yesterday: "yesterday",
    this_week: "this_week",
    week: "this_week",
    this_month: "this_month",
    month: "this_month",
    this_year: "this_year",
    year: "this_year",
    custom: "custom",
  };

  return aliases[cleanValue] || "all_time";
};

const buildTravelReportDateContext = (query = {}) => {
  const hasExplicitDates = Boolean(query.startDate || query.endDate || query.fromDate || query.toDate);
  const preset = normalizePreset(query.preset || query.filterType || (hasExplicitDates ? "custom" : "all_time"));

  if (preset === "custom" && !(query.startDate || query.fromDate) && !(query.endDate || query.toDate)) {
    throw createHttpError(400, "Custom report range requires startDate and endDate");
  }

  if (preset === "custom") {
    extractDateString(query.startDate || query.fromDate, "start date");
    extractDateString(query.endDate || query.toDate, "end date");
  }

  const dateFilter =
    preset === "all_time"
      ? {}
      : buildBusinessPresetDateRange({
          dateFilter: preset,
          fromDate: query.startDate || query.fromDate,
          toDate: query.endDate || query.toDate,
        });
  const range = dateFilter.date;

  if (!range?.$gte || !(range.$lt || range.$lte)) {
    return {
      preset: "all_time",
      startDate: "",
      endDate: "",
      hasDateRange: false,
      start: null,
      end: null,
      endExclusive: null,
      groupBy: "month",
    };
  }

  const start = range.$gte;
  const endExclusive = range.$lt || new Date(range.$lte.getTime() + 1);
  const end = new Date(endExclusive.getTime() - 1);

  if (start.getTime() >= endExclusive.getTime()) {
    throw createHttpError(400, "Start date cannot be after end date");
  }

  const dayCount = Math.ceil((endExclusive.getTime() - start.getTime()) / 86400000);

  return {
    preset,
    startDate: getBusinessDateKey(start),
    endDate: getBusinessDateKey(end),
    hasDateRange: true,
    start,
    end,
    endExclusive,
    groupBy: dayCount <= 92 ? "day" : "month",
  };
};

const getDateMatch = (dateContext, field = "date") => {
  if (!dateContext?.hasDateRange) {
    return {};
  }

  return {
    [field]: {
      $gte: dateContext.start,
      $lt: dateContext.endExclusive || dateContext.end,
    },
  };
};

const getStringDateMatch = (dateContext, field = "date") => {
  if (!dateContext?.hasDateRange) {
    return {};
  }

  return {
    [field]: {
      $gte: dateContext.startDate,
      $lte: dateContext.endDate,
    },
  };
};

const getPeriodFormat = (dateContext) =>
  dateContext?.groupBy === "day" ? "%Y-%m-%d" : "%Y-%m";

const getPeriodLabel = (dateContext) =>
  dateContext?.groupBy === "day" ? "Daily" : "Monthly";

const getAccountRowsByCodeAndSource = async ({ objectUserId, dateContext }) => {
  const accounts = await Account.find(
    applyModuleScopeFilter(
      {
        userId: objectUserId,
        code: { $in: TRAVEL_PROFIT_ACCOUNT_CODES },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id code")
    .lean();

  const accountIds = accounts.map((account) => account._id);

  if (accountIds.length === 0) {
    return [];
  }

  return JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        sourceType: { $in: TRAVEL_PROFIT_SOURCE_TYPES },
        "lines.account": { $in: accountIds },
        ...getDateMatch(dateContext),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: accountIds },
      },
    },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "accountInfo",
      },
    },
    { $unwind: "$accountInfo" },
    {
      $group: {
        _id: {
          code: "$accountInfo.code",
          sourceType: "$sourceType",
        },
        debit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
          },
        },
        credit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
          },
        },
      },
    },
  ]);
};

const getProfitTotals = async ({ objectUserId, dateContext }) => {
  const rows = await getAccountRowsByCodeAndSource({ objectUserId, dateContext });
  const rowMap = new Map();

  rows.forEach((row) => {
    rowMap.set(`${row._id?.code || ""}:${row._id?.sourceType || ""}`, {
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
    });
  });

  const rowsForCode = (code) =>
    rows.filter((row) => row._id?.code === code);
  const sourceRow = (code, sourceType) =>
    rowMap.get(`${code}:${sourceType}`) || { debit: 0, credit: 0 };
  const creditBalance = (code) =>
    roundMoney(
      rowsForCode(code).reduce(
        (total, row) => total + Number(row.credit || 0) - Number(row.debit || 0),
        0,
      ),
    );
  const debitBalance = (code) =>
    roundMoney(
      rowsForCode(code).reduce(
        (total, row) => total + Number(row.debit || 0) - Number(row.credit || 0),
        0,
      ),
    );

  const grossSales = creditBalance("TRAVEL_SALES");
  const customerPenalties = creditBalance("TRAVEL_PENALTY_INCOME");
  const discounts = debitBalance("TRAVEL_DISCOUNT");
  const grossRefunds = debitBalance("TRAVEL_REFUND");
  const originalTravelCost = roundMoney(sourceRow("TRAVEL_COST", "travel_vendor_cost").debit);
  const vendorRecoveries = roundMoney(sourceRow("TRAVEL_COST", "travel_refund").credit);
  const vendorReturns = roundMoney(sourceRow("TRAVEL_COST", "travel_vendor_return").credit);

  return calculateTravelProfitMath({
    grossSales,
    customerPenalties,
    discounts,
    grossRefunds,
    originalTravelCost,
    vendorRecoveries,
    vendorReturns,
  });
};

const getTravelExpenses = async ({ objectUserId, dateContext }) => {
  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        sourceType: "expense",
        originModule: { $in: TRAVEL_EXPENSE_ORIGINS },
        ...getDateMatch(dateContext),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.type": "debit",
      },
    },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "accountInfo",
      },
    },
    { $unwind: "$accountInfo" },
    {
      $match: {
        "accountInfo.type": "Expense",
        "accountInfo.code": { $nin: TRAVEL_PROFIT_ACCOUNT_CODES },
      },
    },
    {
      $group: {
        _id: {
          accountId: "$lines.account",
          accountName: "$accountInfo.name",
          accountCode: "$accountInfo.code",
        },
        amount: { $sum: "$lines.amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  const recent = await Expense.find({
    userId: objectUserId,
    isDeleted: false,
    moduleScope: { $in: [MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH] },
    ...getStringDateMatch(dateContext),
  })
    .select("title date time amount paymentType description category moduleScope")
    .populate("category", "name code")
    .sort({ date: -1, time: -1, createdAt: -1 })
    .limit(20)
    .lean();

  const breakdown = rows.map((row) => ({
    accountId: row._id?.accountId || null,
    accountName: row._id?.accountName || "Expense",
    accountCode: row._id?.accountCode || "",
    amount: roundMoney(row.amount),
    count: Number(row.count || 0),
  }));

  return {
    total: roundMoney(breakdown.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    breakdown,
    count: recent.length,
    recent: recent.map((expense) => ({
      _id: expense._id,
      title: expense.title || "",
      date: expense.date || "",
      time: expense.time || "",
      amount: roundMoney(expense.amount),
      paymentType: expense.paymentType || "",
      category: expense.category || null,
      description: expense.description || "",
    })),
  };
};

const getBookingItemRows = async ({ objectUserId, dateContext }) =>
  TravelBooking.aggregate([
    {
      $match: {
        userId: objectUserId,
        isActive: true,
        isDeleted: false,
        isVoided: { $ne: true },
        accountingPosted: true,
        status: { $in: [...POSTING_STATUSES] },
        ...getDateMatch(dateContext, "invoiceDate"),
      },
    },
    { $unwind: "$bookingItems" },
    {
      $project: {
        bookingItemId: "$bookingItems._id",
        invoiceId: "$_id",
        itemType: { $ifNull: ["$bookingItems.itemType", "service"] },
        serviceId: "$bookingItems.serviceId",
        title: { $ifNull: ["$bookingItems.title", ""] },
        grossSales: { $ifNull: ["$bookingItems.estimatedSellingBase", 0] },
        originalCost: {
          $cond: [
            {
              $and: [
                { $eq: ["$bookingItems.itemType", "umrah_package"] },
                {
                  $eq: [
                    "$bookingItems.umrahDetails.packageMode",
                    "custom_component_package",
                  ],
                },
                {
                  $gt: [
                    {
                      $size: {
                        $ifNull: ["$bookingItems.umrahDetails.components", []],
                      },
                    },
                    0,
                  ],
                },
              ],
            },
            {
              $sum: {
                $ifNull: ["$bookingItems.umrahDetails.components.estimatedCostBase", []],
              },
            },
            { $ifNull: ["$bookingItems.estimatedCostBase", 0] },
          ],
        },
      },
    },
  ]);

const groupRefundItemsByBookingItem = async ({ objectUserId, dateContext }) =>
  TravelRefund.aggregate([
    {
      $match: {
        userId: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        ...getDateMatch(dateContext, "refundDate"),
      },
    },
    { $unwind: "$refundItems" },
    {
      $group: {
        _id: "$refundItems.bookingItemId",
        refundAmount: { $sum: "$refundItems.refundAmount" },
        vendorRecoveryAmount: { $sum: "$refundItems.vendorRecoveryAmount" },
      },
    },
  ]);

const groupVendorReturnsByBookingItem = async ({ objectUserId, dateContext }) =>
  TravelVendorReturn.aggregate([
    {
      $match: {
        userId: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        bookingItemId: { $ne: null },
        ...getDateMatch(dateContext, "returnDate"),
      },
    },
    {
      $group: {
        _id: "$bookingItemId",
        vendorReturnAmount: { $sum: "$vendorReturnAmount" },
      },
    },
  ]);

const getRefundAndReturnAllocationTotals = async ({ objectUserId, dateContext }) => {
  const [refundTotals, returnTotals] = await Promise.all([
    TravelRefund.aggregate([
      {
        $match: {
          userId: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          ...getDateMatch(dateContext, "refundDate"),
        },
      },
      {
        $group: {
          _id: null,
          grossRefunds: { $sum: "$grossRefundAmount" },
          vendorRecoveries: { $sum: "$vendorRecoveryAmount" },
        },
      },
    ]),
    TravelVendorReturn.aggregate([
      {
        $match: {
          userId: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          ...getDateMatch(dateContext, "returnDate"),
        },
      },
      {
        $group: {
          _id: null,
          vendorReturns: { $sum: "$vendorReturnAmount" },
        },
      },
    ]),
  ]);

  return {
    grossRefunds: roundMoney(refundTotals[0]?.grossRefunds || 0),
    vendorRecoveries: roundMoney(refundTotals[0]?.vendorRecoveries || 0),
    vendorReturns: roundMoney(returnTotals[0]?.vendorReturns || 0),
  };
};

const createPerformanceAccumulator = ({ key, label, itemType = "", serviceId = null }) => ({
  key,
  label,
  itemType,
  serviceId,
  itemCount: 0,
  invoiceIds: new Set(),
  grossSales: 0,
  refunds: 0,
  netSales: 0,
  originalCost: 0,
  vendorRecoveries: 0,
  vendorReturns: 0,
  netCost: 0,
  grossProfit: 0,
});

const addPerformanceValues = (target, values) => {
  target.itemCount += 1;

  if (values.invoiceId) {
    target.invoiceIds.add(String(values.invoiceId));
  }

  target.grossSales = addMoney(target.grossSales, values.grossSales);
  target.refunds = addMoney(target.refunds, values.refunds);
  target.netSales = addMoney(target.netSales, values.netSales);
  target.originalCost = addMoney(target.originalCost, values.originalCost);
  target.vendorRecoveries = addMoney(target.vendorRecoveries, values.vendorRecoveries);
  target.vendorReturns = addMoney(target.vendorReturns, values.vendorReturns);
  target.netCost = addMoney(target.netCost, values.netCost);
  target.grossProfit = addMoney(target.grossProfit, values.grossProfit);
};

const finalizePerformanceRows = (rows) =>
  rows
    .map((row) => ({
      key: row.key,
      label: row.label,
      itemType: row.itemType,
      serviceId: row.serviceId,
      itemCount: row.itemCount,
      invoiceCount: row.invoiceIds.size,
      grossSales: roundMoney(row.grossSales),
      refunds: roundMoney(row.refunds),
      netSales: roundMoney(row.netSales),
      originalCost: roundMoney(row.originalCost),
      vendorRecoveries: roundMoney(row.vendorRecoveries),
      vendorReturns: roundMoney(row.vendorReturns),
      netCost: roundMoney(row.netCost),
      grossProfit: roundMoney(row.grossProfit),
      marginPct: row.netSales ? roundMoney((row.grossProfit / row.netSales) * 100) : 0,
    }))
    .sort((first, second) => Number(second.netSales || 0) - Number(first.netSales || 0));

const getServicePerformance = async ({ objectUserId, dateContext }) => {
  const [bookingItems, refundItems, vendorReturnItems, allocationTotals] = await Promise.all([
    getBookingItemRows({ objectUserId, dateContext }),
    groupRefundItemsByBookingItem({ objectUserId, dateContext }),
    groupVendorReturnsByBookingItem({ objectUserId, dateContext }),
    getRefundAndReturnAllocationTotals({ objectUserId, dateContext }),
  ]);

  const serviceIds = [
    ...new Set(
      bookingItems
        .map((item) => item.serviceId)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const services = serviceIds.length
    ? await TravelService.find({
        userId: objectUserId,
        _id: { $in: serviceIds.map((serviceId) => toObjectId(serviceId, "service")) },
      })
        .select("_id name code")
        .lean()
    : [];
  const serviceNameById = new Map(
    services.map((service) => [String(service._id), service.name || service.code || "Travel Service"]),
  );
  const refundByItemId = new Map(
    refundItems
      .filter((row) => row._id)
      .map((row) => [
        String(row._id),
        {
          refundAmount: roundMoney(row.refundAmount),
          vendorRecoveryAmount: roundMoney(row.vendorRecoveryAmount),
        },
      ]),
  );
  const returnByItemId = new Map(
    vendorReturnItems
      .filter((row) => row._id)
      .map((row) => [String(row._id), roundMoney(row.vendorReturnAmount)]),
  );
  const typeMap = new Map();
  const customMap = new Map();

  bookingItems.forEach((item) => {
    const itemId = String(item.bookingItemId || "");
    const itemType = cleanString(item.itemType || "service") || "service";
    const typeLabel = SERVICE_LABELS[itemType] || SERVICE_LABELS.service;
    const serviceId = item.serviceId ? String(item.serviceId) : "";
    const customLabel = serviceId
      ? serviceNameById.get(serviceId) || cleanString(item.title) || typeLabel
      : cleanString(item.title) || typeLabel;
    const refundRow = refundByItemId.get(itemId) || {};
    const vendorReturnAmount = returnByItemId.get(itemId) || 0;
    const grossSales = roundMoney(item.grossSales);
    const refunds = roundMoney(refundRow.refundAmount || 0);
    const originalCost = roundMoney(item.originalCost);
    const vendorRecoveries = roundMoney(refundRow.vendorRecoveryAmount || 0);
    const vendorReturns = roundMoney(vendorReturnAmount);
    const netSales = subtractMoney(grossSales, refunds);
    const netCost = subtractMoney(originalCost, vendorRecoveries, vendorReturns);
    const grossProfit = subtractMoney(netSales, netCost);
    const values = {
      invoiceId: item.invoiceId,
      grossSales,
      refunds,
      netSales,
      originalCost,
      vendorRecoveries,
      vendorReturns,
      netCost,
      grossProfit,
    };

    if (!typeMap.has(itemType)) {
      typeMap.set(
        itemType,
        createPerformanceAccumulator({
          key: `type:${itemType}`,
          label: typeLabel,
          itemType,
        }),
      );
    }

    addPerformanceValues(typeMap.get(itemType), values);

    if (serviceId) {
      const customKey = `service:${serviceId}`;

      if (!customMap.has(customKey)) {
        customMap.set(
          customKey,
          createPerformanceAccumulator({
            key: customKey,
            label: customLabel,
            itemType,
            serviceId,
          }),
        );
      }

      addPerformanceValues(customMap.get(customKey), values);
    }
  });

  const allocatedRefunds = roundMoney(
    [...refundByItemId.values()].reduce((sum, row) => sum + Number(row.refundAmount || 0), 0),
  );
  const allocatedRecoveries = roundMoney(
    [...refundByItemId.values()].reduce(
      (sum, row) => sum + Number(row.vendorRecoveryAmount || 0),
      0,
    ),
  );
  const allocatedReturns = roundMoney(
    [...returnByItemId.values()].reduce((sum, value) => sum + Number(value || 0), 0),
  );

  return {
    servicePerformance: finalizePerformanceRows([...typeMap.values()]),
    customServicePerformance: finalizePerformanceRows([...customMap.values()]),
    unallocatedAdjustments: {
      refunds: Math.max(roundMoney(allocationTotals.grossRefunds - allocatedRefunds), 0),
      vendorRecoveries: Math.max(roundMoney(allocationTotals.vendorRecoveries - allocatedRecoveries), 0),
      vendorReturns: Math.max(roundMoney(allocationTotals.vendorReturns - allocatedReturns), 0),
    },
  };
};

const getPaymentStatus = ({ total = 0, paid = 0 }) => {
  const safeTotal = roundMoney(total);
  const safePaid = roundMoney(paid);

  if (safeTotal <= 0) {
    return "settled";
  }

  if (safePaid >= safeTotal) {
    return "paid";
  }

  if (safePaid > 0) {
    return "partial";
  }

  return "credit";
};

const getRefundReport = async ({ objectUserId, dateContext }) => {
  const match = {
    userId: objectUserId,
    isDeleted: false,
    isReversed: { $ne: true },
    ...getDateMatch(dateContext, "refundDate"),
  };
  const [totals, recent] = await Promise.all([
    TravelRefund.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          grossRefund: { $sum: "$grossRefundAmount" },
          customerPenalties: { $sum: "$penaltyAmount" },
          customerRefund: { $sum: "$customerRefundAmount" },
          paidBack: { $sum: "$paidBackAmount" },
          vendorRecovery: { $sum: "$vendorRecoveryAmount" },
        },
      },
    ]),
    TravelRefund.find(match)
      .select(
        "refundNumber refundDate refundTime originalInvoiceId originalInvoiceNumber customerId customerPartyId grossRefundAmount penaltyAmount customerRefundAmount paidBackAmount vendorRecoveryAmount",
      )
      .populate("customerId", "name phone email moduleScope")
      .populate("customerPartyId", "name phone email role moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
      .sort({ refundDate: -1, createdAt: -1, _id: -1 })
      .limit(20)
      .lean(),
  ]);

  const row = totals[0] || {};
  const customerRefund = roundMoney(row.customerRefund);
  const paidBack = roundMoney(row.paidBack);

  return {
    totals: {
      count: Number(row.count || 0),
      grossRefund: roundMoney(row.grossRefund),
      customerPenalties: roundMoney(row.customerPenalties),
      customerRefund,
      paidBack,
      outstandingCustomerCredit: Math.max(roundMoney(customerRefund - paidBack), 0),
      vendorRecovery: roundMoney(row.vendorRecovery),
    },
    recent: recent.map((refund) => ({
      _id: refund._id,
      refundNumber: refund.refundNumber || "",
      date: refund.refundDate || null,
      time: refund.refundTime || "",
      originalInvoiceId: refund.originalInvoiceId?._id || refund.originalInvoiceId || null,
      originalInvoiceNumber:
        refund.originalInvoiceId?.invoiceNumber ||
        refund.originalInvoiceId?.bookingNumber ||
        refund.originalInvoiceNumber ||
        "",
      customer: refund.customerPartyId || refund.customerId || null,
      grossRefund: roundMoney(refund.grossRefundAmount),
      penalty: roundMoney(refund.penaltyAmount),
      customerRefund: roundMoney(refund.customerRefundAmount),
      paidBack: roundMoney(refund.paidBackAmount),
      outstandingCustomerCredit: Math.max(
        roundMoney(Number(refund.customerRefundAmount || 0) - Number(refund.paidBackAmount || 0)),
        0,
      ),
      vendorRecovery: roundMoney(refund.vendorRecoveryAmount),
      paymentStatus: getPaymentStatus({
        total: refund.customerRefundAmount,
        paid: refund.paidBackAmount,
      }),
    })),
  };
};

const getVendorRecoveryReport = async ({ objectUserId, dateContext }) => {
  const refundMatch = {
    userId: objectUserId,
    isDeleted: false,
    isReversed: { $ne: true },
    ...getDateMatch(dateContext, "refundDate"),
  };
  const returnMatch = {
    userId: objectUserId,
    isDeleted: false,
    isReversed: { $ne: true },
    ...getDateMatch(dateContext, "returnDate"),
  };

  const [recoveriesByVendor, vendorReturnTotals, recentVendorReturns] = await Promise.all([
    TravelRefund.aggregate([
      { $match: refundMatch },
      { $unwind: "$refundItems" },
      {
        $match: {
          $or: [
            { "refundItems.vendorId": { $ne: null } },
            { "refundItems.vendorPartyId": { $ne: null } },
          ],
          "refundItems.vendorRecoveryAmount": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            entityType: {
              $cond: [
                { $ne: ["$refundItems.vendorPartyId", null] },
                "party",
                "supplier",
              ],
            },
            id: {
              $ifNull: ["$refundItems.vendorPartyId", "$refundItems.vendorId"],
            },
          },
          vendorRecovery: { $sum: "$refundItems.vendorRecoveryAmount" },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "suppliers",
          localField: "_id.id",
          foreignField: "_id",
          as: "vendor",
        },
      },
      {
        $lookup: {
          from: "parties",
          localField: "_id.id",
          foreignField: "_id",
          as: "party",
        },
      },
      { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$party", preserveNullAndEmptyArrays: true } },
      { $sort: { vendorRecovery: -1 } },
      { $limit: 20 },
    ]),
    TravelVendorReturn.aggregate([
      { $match: returnMatch },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          vendorReturns: { $sum: "$vendorReturnAmount" },
          vendorPenalties: { $sum: "$vendorPenaltyAmount" },
          cashReceived: { $sum: "$amountReceivedNow" },
        },
      },
    ]),
    TravelVendorReturn.find(returnMatch)
      .select(
        "returnNumber returnDate returnTime vendorId vendorPartyId originalInvoiceId originalInvoiceNumber serviceLabel vendorReturnAmount vendorPenaltyAmount amountReceivedNow",
      )
      .populate("vendorId", "name phone email travelVendorType moduleScope")
      .populate("vendorPartyId", "name phone email role moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
      .sort({ returnDate: -1, createdAt: -1, _id: -1 })
      .limit(20)
      .lean(),
  ]);

  const vendorReturnRow = vendorReturnTotals[0] || {};

  return {
    totals: {
      vendorReturns: roundMoney(vendorReturnRow.vendorReturns),
      vendorReturnCount: Number(vendorReturnRow.count || 0),
      vendorPenalties: roundMoney(vendorReturnRow.vendorPenalties),
      vendorReturnCashReceived: roundMoney(vendorReturnRow.cashReceived),
    },
    recoveriesByVendor: recoveriesByVendor.map((row) => ({
      vendorId: row._id?.id || row._id,
      vendor: row.party
        ? {
            _id: row.party._id,
            name: row.party.name,
            phone: row.party.phone,
            role: row.party.role,
            entityType: "party",
          }
        : row.vendor
        ? {
            _id: row.vendor._id,
            name: row.vendor.name,
            phone: row.vendor.phone,
            travelVendorType: row.vendor.travelVendorType,
            entityType: "supplier",
          }
        : null,
      entityType: row._id?.entityType || "supplier",
      vendorRecovery: roundMoney(row.vendorRecovery),
      count: Number(row.count || 0),
    })),
    recentVendorReturns: recentVendorReturns.map((record) => ({
      _id: record._id,
      returnNumber: record.returnNumber || "",
      date: record.returnDate || null,
      time: record.returnTime || "",
      vendor: record.vendorPartyId || record.vendorId || null,
      originalInvoiceId: record.originalInvoiceId?._id || record.originalInvoiceId || null,
      originalInvoiceNumber:
        record.originalInvoiceId?.invoiceNumber ||
        record.originalInvoiceId?.bookingNumber ||
        record.originalInvoiceNumber ||
        "",
      serviceLabel: record.serviceLabel || "",
      vendorReturnAmount: roundMoney(record.vendorReturnAmount),
      vendorPenaltyAmount: roundMoney(record.vendorPenaltyAmount),
      amountReceivedNow: roundMoney(record.amountReceivedNow),
      outstandingVendorCredit: Math.max(
        roundMoney(Number(record.vendorReturnAmount || 0) - Number(record.amountReceivedNow || 0)),
        0,
      ),
    })),
  };
};

const getMapFromRows = (rows = [], key = "_id", value = "total") =>
  new Map(rows.map((row) => [String(row[key] || ""), roundMoney(row[value])]));

const getCustomerReceivables = async ({ userId, objectUserId, dateContext }) => {
  const [customers, parties] = await Promise.all([
    Customer.find(
      applyModuleScopeFilter(
        {
          createdBy: objectUserId,
          isActive: { $ne: false },
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id name phone email account openingBalance moduleScope")
      .lean(),
    Party.find(buildTravelPartyRoleQuery(objectUserId, "customer"))
      .select("_id name phone email role account openingBalance moduleScope")
      .lean(),
  ]);

  if (customers.length === 0 && parties.length === 0) {
    return {
      totalReceivable: 0,
      totalCredit: 0,
      customers: [],
    };
  }

  const [
    balanceMap,
    partyBalanceMap,
    invoiceRows,
    partyInvoiceRows,
    paymentRows,
    partyPaymentRows,
    refundRows,
    partyRefundRows,
  ] = await Promise.all([
    getTravelCustomerBalanceMap(userId, customers),
    getTravelPartyBalanceMap(userId, parties),
    TravelBooking.aggregate([
      {
        $match: {
          userId: objectUserId,
          isActive: true,
          isDeleted: false,
          isVoided: { $ne: true },
          accountingPosted: true,
          status: { $in: [...POSTING_STATUSES] },
          customerId: { $ne: null },
          ...getDateMatch(dateContext, "invoiceDate"),
        },
      },
      {
        $group: {
          _id: "$customerId",
          invoices: { $sum: 1 },
          invoiceAmount: { $sum: "$netSale" },
        },
      },
    ]),
    TravelBooking.aggregate([
      {
        $match: {
          userId: objectUserId,
          isActive: true,
          isDeleted: false,
          isVoided: { $ne: true },
          accountingPosted: true,
          status: { $in: [...POSTING_STATUSES] },
          customerPartyId: { $ne: null },
          ...getDateMatch(dateContext, "invoiceDate"),
        },
      },
      {
        $group: {
          _id: "$customerPartyId",
          invoices: { $sum: 1 },
          invoiceAmount: { $sum: "$netSale" },
        },
      },
    ]),
    JournalEntry.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          sourceType: "receive_payment",
          originModule: {
            $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
          },
          customerId: { $ne: null },
          ...getDateMatch(dateContext),
        },
      },
      { $unwind: "$lines" },
      { $match: { "lines.type": "debit" } },
      {
        $group: {
          _id: "$customerId",
          total: { $sum: "$lines.amount" },
        },
      },
    ]),
    JournalEntry.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          sourceType: "receive_payment",
          originModule: {
            $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
          },
          partyId: { $ne: null },
          ...getDateMatch(dateContext),
        },
      },
      { $unwind: "$lines" },
      { $match: { "lines.type": "debit" } },
      {
        $group: {
          _id: "$partyId",
          total: { $sum: "$lines.amount" },
        },
      },
    ]),
    TravelRefund.aggregate([
      {
        $match: {
          userId: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          customerId: { $ne: null },
          ...getDateMatch(dateContext, "refundDate"),
        },
      },
      {
        $group: {
          _id: "$customerId",
          refundCredit: { $sum: "$customerRefundAmount" },
          refunds: { $sum: 1 },
        },
      },
    ]),
    TravelRefund.aggregate([
      {
        $match: {
          userId: objectUserId,
          isDeleted: false,
          isReversed: { $ne: true },
          customerPartyId: { $ne: null },
          ...getDateMatch(dateContext, "refundDate"),
        },
      },
      {
        $group: {
          _id: "$customerPartyId",
          refundCredit: { $sum: "$customerRefundAmount" },
          refunds: { $sum: 1 },
        },
      },
    ]),
  ]);

  const invoiceByCustomer = new Map(
    invoiceRows.map((row) => [
      String(row._id || ""),
      {
        invoices: Number(row.invoices || 0),
        invoiceAmount: roundMoney(row.invoiceAmount),
      },
    ]),
  );
  const invoiceByParty = new Map(
    partyInvoiceRows.map((row) => [
      String(row._id || ""),
      {
        invoices: Number(row.invoices || 0),
        invoiceAmount: roundMoney(row.invoiceAmount),
      },
    ]),
  );
  const paymentByCustomer = getMapFromRows(paymentRows);
  const paymentByParty = getMapFromRows(partyPaymentRows);
  const refundByCustomer = new Map(
    refundRows.map((row) => [
      String(row._id || ""),
      {
        refunds: Number(row.refunds || 0),
        refundCredit: roundMoney(row.refundCredit),
      },
    ]),
  );
  const refundByParty = new Map(
    partyRefundRows.map((row) => [
      String(row._id || ""),
      {
        refunds: Number(row.refunds || 0),
        refundCredit: roundMoney(row.refundCredit),
      },
    ]),
  );

  let totalReceivable = 0;
  let totalCredit = 0;
  const customerRows = customers.map((customer) => {
    const accountId = String(customer.account || "");
    const balance = roundMoney(balanceMap.get(accountId) || 0);
    const invoice = invoiceByCustomer.get(String(customer._id)) || {};
    const refund = refundByCustomer.get(String(customer._id)) || {};
    const currentDue = Math.max(balance, 0);
    const customerCredit = Math.max(roundMoney(-balance), 0);

    totalReceivable = addMoney(totalReceivable, currentDue);
    totalCredit = addMoney(totalCredit, customerCredit);

    return {
      customerId: customer._id,
      entityType: "customer",
      customer: {
        _id: customer._id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        entityType: "customer",
      },
      mobile: customer.phone || "",
      openingBalance: roundMoney(customer.openingBalance),
      invoiceCount: Number(invoice.invoices || 0),
      invoiceAmount: roundMoney(invoice.invoiceAmount),
      payments: roundMoney(paymentByCustomer.get(String(customer._id)) || 0),
      refunds: Number(refund.refunds || 0),
      refundCredit: roundMoney(refund.refundCredit),
      currentDue,
      customerCredit,
    };
  });

  const partyRows = parties.map((party) => {
    const accountId = String(party.account || "");
    const balance = roundMoney(partyBalanceMap.get(accountId) || 0);
    const invoice = invoiceByParty.get(String(party._id)) || {};
    const refund = refundByParty.get(String(party._id)) || {};
    const currentDue = Math.max(balance, 0);

    totalReceivable = addMoney(totalReceivable, currentDue);

    return {
      customerId: party._id,
      partyId: party._id,
      entityType: "party",
      customer: {
        _id: party._id,
        name: party.name,
        phone: party.phone,
        email: party.email,
        role: party.role,
        entityType: "party",
      },
      mobile: party.phone || "",
      openingBalance: roundMoney(party.openingBalance),
      invoiceCount: Number(invoice.invoices || 0),
      invoiceAmount: roundMoney(invoice.invoiceAmount),
      payments: roundMoney(paymentByParty.get(String(party._id)) || 0),
      refunds: Number(refund.refunds || 0),
      refundCredit: roundMoney(refund.refundCredit),
      currentDue,
      customerCredit: 0,
      netBalance: balance,
    };
  });

  return {
    totalReceivable,
    totalCredit,
    customers: [...customerRows, ...partyRows]
      .filter((row) => {
        const hasActivity =
          row.invoiceCount > 0 || row.payments > 0 || row.refundCredit > 0;

        if (row.entityType === "party" && row.netBalance < 0) {
          return false;
        }

        return row.currentDue > 0 || row.customerCredit > 0 || hasActivity;
      })
      .sort((first, second) => Number(second.currentDue || 0) - Number(first.currentDue || 0))
      .slice(0, 25),
  };
};

const aggregateByLineAccount = async ({
  objectUserId,
  accountIds,
  dateContext,
  journalMatch,
  lineType,
}) => {
  if (!accountIds.length) {
    return new Map();
  }

  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        "lines.account": { $in: accountIds },
        ...journalMatch,
        ...getDateMatch(dateContext),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: accountIds },
        "lines.type": lineType,
      },
    },
    {
      $group: {
        _id: "$lines.account",
        total: { $sum: "$lines.amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        total: roundMoney(row.total),
        count: Number(row.count || 0),
      },
    ]),
  );
};

const getVendorPayables = async ({ userId, objectUserId, dateContext }) => {
  const [vendors, parties] = await Promise.all([
    Supplier.find(
      applySupplierModuleScopeFilter(
        {
          userId: objectUserId,
          isDeleted: false,
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id name phone email account openingBalance travelVendorType moduleScope isTravelVendor")
      .lean(),
    Party.find(buildTravelPartyRoleQuery(objectUserId, "supplier"))
      .select("_id name phone email role account openingBalance moduleScope")
      .lean(),
  ]);

  if (vendors.length === 0 && parties.length === 0) {
    return {
      totalPayable: 0,
      totalCredit: 0,
      vendors: [],
    };
  }

  const accountIds = [...vendors, ...parties]
    .map((vendor) => vendor.account)
    .filter(Boolean);
  const [balanceMap, partyBalanceMap, costMap, paymentMap, recoveryReturnMap] =
    await Promise.all([
      getTravelVendorBalanceMap(userId, vendors),
      getTravelPartyBalanceMap(userId, parties),
      aggregateByLineAccount({
        objectUserId,
        accountIds,
        dateContext,
        journalMatch: { sourceType: "travel_vendor_cost" },
        lineType: "credit",
      }),
      aggregateByLineAccount({
        objectUserId,
        accountIds,
        dateContext,
        journalMatch: {
          sourceType: "pay_bill",
          originModule: {
            $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_VENDOR_PAYMENT_ORIGIN],
          },
        },
        lineType: "debit",
      }),
      aggregateByLineAccount({
        objectUserId,
        accountIds,
        dateContext,
        journalMatch: {
          sourceType: { $in: ["travel_refund", "travel_vendor_return"] },
        },
        lineType: "debit",
      }),
    ]);

  let totalPayable = 0;
  let totalCredit = 0;
  const vendorRows = vendors.map((vendor) => {
    const accountId = String(vendor.account || "");
    const balance = roundMoney(balanceMap.get(accountId) || 0);
    const currentPayable = Math.max(balance, 0);
    const vendorCredit = Math.max(roundMoney(-balance), 0);

    totalPayable = addMoney(totalPayable, currentPayable);
    totalCredit = addMoney(totalCredit, vendorCredit);

    return {
      vendorId: vendor._id,
      entityType: "supplier",
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        phone: vendor.phone,
        email: vendor.email,
        travelVendorType: vendor.travelVendorType,
        entityType: "supplier",
      },
      vendorType: vendor.travelVendorType || "",
      openingBalance: roundMoney(vendor.openingBalance),
      costs: roundMoney(costMap.get(accountId)?.total || 0),
      payments: roundMoney(paymentMap.get(accountId)?.total || 0),
      recoveriesReturns: roundMoney(recoveryReturnMap.get(accountId)?.total || 0),
      currentPayable,
      vendorCredit,
    };
  });

  const partyRows = parties.map((party) => {
    const accountId = String(party.account || "");
    const balance = roundMoney(partyBalanceMap.get(accountId) || 0);
    const currentPayable = Math.max(roundMoney(-balance), 0);

    totalPayable = addMoney(totalPayable, currentPayable);

    return {
      vendorId: party._id,
      partyId: party._id,
      entityType: "party",
      vendor: {
        _id: party._id,
        name: party.name,
        phone: party.phone,
        email: party.email,
        role: party.role,
        entityType: "party",
      },
      vendorType: "party",
      openingBalance: roundMoney(party.openingBalance),
      costs: roundMoney(costMap.get(accountId)?.total || 0),
      payments: roundMoney(paymentMap.get(accountId)?.total || 0),
      recoveriesReturns: roundMoney(recoveryReturnMap.get(accountId)?.total || 0),
      currentPayable,
      vendorCredit: 0,
      netBalance: balance,
    };
  });

  return {
    totalPayable,
    totalCredit,
    vendors: [...vendorRows, ...partyRows]
      .filter((row) => {
        const hasActivity =
          row.costs > 0 || row.payments > 0 || row.recoveriesReturns > 0;

        if (row.entityType === "party" && row.netBalance > 0) {
          return false;
        }

        return row.currentPayable > 0 || row.vendorCredit > 0 || hasActivity;
      })
      .sort((first, second) => Number(second.currentPayable || 0) - Number(first.currentPayable || 0))
      .slice(0, 25),
  };
};

const aggregatePaymentMovement = async ({
  objectUserId,
  dateContext,
  sourceType,
  originModule,
  lineType,
}) => {
  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        sourceType,
        originModule,
        ...getDateMatch(dateContext),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.type": lineType,
      },
    },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "accountInfo",
      },
    },
    { $unwind: "$accountInfo" },
    {
      $match: {
        "accountInfo.type": "Asset",
        "accountInfo.category": { $in: PAYMENT_ACCOUNT_CATEGORIES },
      },
    },
    {
      $group: {
        _id: {
          paymentType: { $ifNull: ["$lines.paymentType", "cash"] },
          accountId: "$lines.account",
          accountName: "$accountInfo.name",
          accountCategory: "$accountInfo.category",
        },
        amount: { $sum: "$lines.amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { amount: -1 } },
  ]);

  return {
    total: roundMoney(rows.reduce((sum, row) => sum + Number(row.amount || 0), 0)),
    breakdown: rows.map((row) => ({
      paymentType: row._id?.paymentType || "cash",
      accountId: row._id?.accountId || null,
      accountName: row._id?.accountName || "",
      accountCategory: row._id?.accountCategory || "",
      amount: roundMoney(row.amount),
      count: Number(row.count || 0),
    })),
  };
};

const getPaymentLine = (journal, lineType) => {
  const line = (journal.lines || []).find((item) => item.type === lineType);

  if (!line) {
    return null;
  }

  const account = line.account || null;

  return {
    amount: roundMoney(line.amount),
    paymentType: line.paymentType || "",
    account,
  };
};

const getRecentPaymentRows = async ({
  objectUserId,
  dateContext,
  sourceType,
  originModule,
  lineType,
  partyField,
}) => {
  const journals = await JournalEntry.find({
    createdBy: objectUserId,
    isDeleted: false,
    isReversed: { $ne: true },
    sourceType,
    originModule,
    ...getDateMatch(dateContext),
  })
    .select("date time description billNo originModule referenceId invoiceId customerId supplierId partyId lines createdAt")
    .populate("customerId", "name phone email moduleScope")
    .populate("supplierId", "name phone email travelVendorType moduleScope")
    .populate("partyId", "name phone email role moduleScope")
    .populate("lines.account", "name code category type")
    .sort({ date: -1, time: -1, createdAt: -1, _id: -1 })
    .limit(20)
    .lean();

  return journals.map((journal) => {
    const paymentLine = getPaymentLine(journal, lineType);
    const party =
      journal.partyId ||
      (partyField === "supplierId" ? journal.supplierId : journal.customerId);

    return {
      _id: journal._id,
      journalEntryId: journal._id,
      sourceRecordId: journal.referenceId || null,
      date: journal.date || null,
      time: journal.time || "",
      referenceNo: journal.billNo || "",
      party,
      customer: partyField === "customerId" ? party : null,
      vendor: partyField === "supplierId" ? party : null,
      paymentMethod: paymentLine?.paymentType || "",
      paymentAccount: paymentLine?.account || null,
      amount: roundMoney(paymentLine?.amount || 0),
      invoiceId: originModule === TRAVEL_INVOICE_ORIGIN ? journal.referenceId || journal.invoiceId || null : null,
      notes: journal.description || "",
    };
  });
};

const getPaymentsReport = async ({ objectUserId, dateContext }) => {
  const [
    received,
    vendorPayments,
    refundPaid,
    vendorReturnReceipts,
    expensePaid,
    employeeCashIn,
    employeeCashOut,
    receivedRecent,
    vendorRecent,
  ] = await Promise.all([
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "receive_payment",
      originModule: { $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN] },
      lineType: "debit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "pay_bill",
      originModule: { $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_VENDOR_PAYMENT_ORIGIN] },
      lineType: "credit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "refund_payment",
      originModule: TRAVEL_REFUND_ORIGIN,
      lineType: "credit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "purchase_return_payment",
      originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
      lineType: "debit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "expense",
      originModule: { $in: TRAVEL_EXPENSE_ORIGINS },
      lineType: "credit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "payment",
      originModule: { $in: TRAVEL_EMPLOYEE_CASH_IN_ORIGINS },
      lineType: "debit",
    }),
    aggregatePaymentMovement({
      objectUserId,
      dateContext,
      sourceType: "payment",
      originModule: { $in: TRAVEL_EMPLOYEE_CASH_OUT_ORIGINS },
      lineType: "credit",
    }),
    getRecentPaymentRows({
      objectUserId,
      dateContext,
      sourceType: "receive_payment",
      originModule: { $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN] },
      lineType: "debit",
      partyField: "customerId",
    }),
    getRecentPaymentRows({
      objectUserId,
      dateContext,
      sourceType: "pay_bill",
      originModule: { $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_VENDOR_PAYMENT_ORIGIN] },
      lineType: "credit",
      partyField: "supplierId",
    }),
  ]);

  const cashIn = addMoney(
    received.total,
    vendorReturnReceipts.total,
    employeeCashIn.total,
  );
  const cashOut = roundMoney(
    vendorPayments.total +
      refundPaid.total +
      expensePaid.total +
      employeeCashOut.total,
  );

  return {
    receivedTotal: received.total,
    vendorPaymentTotal: vendorPayments.total,
    refundPaidTotal: refundPaid.total,
    vendorReturnReceiptTotal: vendorReturnReceipts.total,
    travelExpensePaidTotal: expensePaid.total,
    employeeCashInTotal: employeeCashIn.total,
    employeeCashOutTotal: employeeCashOut.total,
    cashIn,
    cashOut,
    netCashMovement: subtractMoney(cashIn, cashOut),
    receivedBreakdown: received.breakdown,
    vendorPaymentBreakdown: vendorPayments.breakdown,
    refundPaidBreakdown: refundPaid.breakdown,
    vendorReturnReceiptBreakdown: vendorReturnReceipts.breakdown,
    travelExpensePaidBreakdown: expensePaid.breakdown,
    receivedRecent,
    vendorRecent,
  };
};

const getRevenueProfitTrend = async ({ objectUserId, dateContext }) => {
  const accounts = await Account.find(
    applyModuleScopeFilter(
      {
        userId: objectUserId,
        code: { $in: TRAVEL_PROFIT_ACCOUNT_CODES },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id code")
    .lean();

  const accountIds = accounts.map((account) => account._id);

  if (!accountIds.length) {
    return [];
  }

  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        sourceType: { $in: TRAVEL_PROFIT_SOURCE_TYPES },
        "lines.account": { $in: accountIds },
        ...getDateMatch(dateContext),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: accountIds },
      },
    },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "accountInfo",
      },
    },
    { $unwind: "$accountInfo" },
    {
      $group: {
        _id: {
          period: {
            $dateToString: {
              format: getPeriodFormat(dateContext),
              date: "$date",
              timezone: PK_TIME_ZONE,
            },
          },
          code: "$accountInfo.code",
          sourceType: "$sourceType",
        },
        debit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
          },
        },
        credit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
          },
        },
      },
    },
    { $sort: { "_id.period": 1 } },
  ]);

  const periods = new Map();
  const ensurePeriod = (period) => {
    if (!periods.has(period)) {
      periods.set(period, {
        period,
        grossSales: 0,
        discounts: 0,
        grossRefunds: 0,
        customerPenalties: 0,
        originalTravelCost: 0,
        vendorRecoveries: 0,
        vendorReturns: 0,
      });
    }

    return periods.get(period);
  };

  rows.forEach((row) => {
    const period = ensurePeriod(row._id?.period || "");
    const code = row._id?.code || "";
    const sourceType = row._id?.sourceType || "";
    const debit = Number(row.debit || 0);
    const credit = Number(row.credit || 0);

    if (code === "TRAVEL_SALES") {
      period.grossSales = addMoney(period.grossSales, credit - debit);
    } else if (code === "TRAVEL_DISCOUNT") {
      period.discounts = addMoney(period.discounts, debit - credit);
    } else if (code === "TRAVEL_REFUND") {
      period.grossRefunds = addMoney(period.grossRefunds, debit - credit);
    } else if (code === "TRAVEL_PENALTY_INCOME") {
      period.customerPenalties = addMoney(period.customerPenalties, credit - debit);
    } else if (code === "TRAVEL_COST" && sourceType === "travel_vendor_cost") {
      period.originalTravelCost = addMoney(period.originalTravelCost, debit - credit);
    } else if (code === "TRAVEL_COST" && sourceType === "travel_refund") {
      period.vendorRecoveries = addMoney(period.vendorRecoveries, credit - debit);
    } else if (code === "TRAVEL_COST" && sourceType === "travel_vendor_return") {
      period.vendorReturns = addMoney(period.vendorReturns, credit - debit);
    }
  });

  return [...periods.values()]
    .map((period) => ({
      ...period,
      ...calculateTravelProfitMath(period),
    }))
    .sort((first, second) => String(first.period).localeCompare(String(second.period)));
};

const getRefundTrend = async ({ objectUserId, dateContext }) =>
  TravelRefund.aggregate([
    {
      $match: {
        userId: objectUserId,
        isDeleted: false,
        isReversed: { $ne: true },
        ...getDateMatch(dateContext, "refundDate"),
      },
    },
    {
      $group: {
        _id: {
          $dateToString: {
            format: getPeriodFormat(dateContext),
            date: "$refundDate",
            timezone: PK_TIME_ZONE,
          },
        },
        refunds: { $sum: "$grossRefundAmount" },
        penalties: { $sum: "$penaltyAmount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]).then((rows) =>
    rows.map((row) => ({
      period: row._id,
      refunds: roundMoney(row.refunds),
      penalties: roundMoney(row.penalties),
      count: Number(row.count || 0),
    })),
  );

const getInvoiceCount = async ({ objectUserId, dateContext }) =>
  TravelBooking.countDocuments({
    userId: objectUserId,
    isActive: true,
    isDeleted: false,
    isVoided: { $ne: true },
    accountingPosted: true,
    status: { $in: [...POSTING_STATUSES] },
    ...getDateMatch(dateContext, "invoiceDate"),
  });

const getTravelReportSummary = async ({ userId, query = {} }) => {
  const objectUserId = toObjectId(userId, "user");
  const dateContext = buildTravelReportDateContext(query);
  const cacheKey = getTravelReportCacheKey({
    userId: objectUserId,
    filters: dateContext,
  });
  const bypassCache =
    String(query.refresh || "").toLowerCase() === "true" ||
    String(query.forceRefresh || "").toLowerCase() === "true";

  if (!bypassCache) {
    const cached = getCachedTravelReport(cacheKey);

    if (cached) {
      return cached;
    }
  }

  const [
    profit,
    expenses,
    serviceResult,
    refunds,
    vendorRecovery,
    receivables,
    payables,
    payments,
    businessValue,
    trend,
    refundTrend,
    invoiceCount,
  ] = await Promise.all([
    getProfitTotals({ objectUserId, dateContext }),
    getTravelExpenses({ objectUserId, dateContext }),
    getServicePerformance({ objectUserId, dateContext }),
    getRefundReport({ objectUserId, dateContext }),
    getVendorRecoveryReport({ objectUserId, dateContext }),
    getCustomerReceivables({ userId, objectUserId, dateContext }),
    getVendorPayables({ userId, objectUserId, dateContext }),
    getPaymentsReport({ objectUserId, dateContext }),
    getBusinessValueSummary({
      userId: objectUserId,
      moduleScope: MODULE_SCOPES.TRAVEL,
    }),
    getRevenueProfitTrend({ objectUserId, dateContext }),
    getRefundTrend({ objectUserId, dateContext }),
    getInvoiceCount({ objectUserId, dateContext }),
  ]);

  const totals = {
    ...calculateTravelProfitMath({
      grossSales: profit.grossSales,
      discounts: profit.discounts,
      grossRefunds: profit.grossRefunds,
      customerPenalties: profit.customerPenalties,
      originalTravelCost: profit.originalTravelCost,
      vendorRecoveries: profit.vendorRecoveries,
      vendorReturns: profit.vendorReturns,
      travelExpenses: expenses.total,
    }),
    invoiceCount,
    refundCount: refunds.totals.count,
    customerReceivable: receivables.totalReceivable,
    customerCredit: receivables.totalCredit,
    vendorPayable: payables.totalPayable,
    vendorCredit: payables.totalCredit,
    received: payments.receivedTotal,
    refundPaid: payments.refundPaidTotal,
    vendorPayments: payments.vendorPaymentTotal,
    vendorReturnCashReceived: payments.vendorReturnReceiptTotal,
    travelExpensePaid: payments.travelExpensePaidTotal,
    cashIn: payments.cashIn,
    cashOut: payments.cashOut,
    netCashMovement: payments.netCashMovement,
    travelBusinessValue: businessValue.netBusinessValue,
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    currency: "PKR",
    filters: {
      preset: dateContext.preset,
      startDate: dateContext.startDate,
      endDate: dateContext.endDate,
      hasDateRange: dateContext.hasDateRange,
      groupBy: dateContext.groupBy,
      periodLabel: getPeriodLabel(dateContext),
      timezone: PK_TIME_ZONE,
    },
    formulas: {
      netRevenue: "grossSales - discounts - grossRefunds + customerPenalties",
      netTravelCost: "originalTravelCost - vendorRecoveries - vendorReturns",
      grossProfit: "netRevenue - netTravelCost",
      netProfit: "grossProfit - travelExpenses",
      cashMovement: "cashIn - cashOut",
    },
    totals,
    revenueBreakdown: {
      grossSales: totals.grossSales,
      discounts: totals.discounts,
      grossRefunds: totals.grossRefunds,
      customerPenalties: totals.customerPenalties,
      netRevenue: totals.netRevenue,
    },
    costBreakdown: {
      originalTravelCost: totals.originalTravelCost,
      vendorRecoveries: totals.vendorRecoveries,
      vendorReturns: totals.vendorReturns,
      netTravelCost: totals.netTravelCost,
    },
    expenses,
    servicePerformance: serviceResult.servicePerformance,
    customServicePerformance: serviceResult.customServicePerformance,
    unallocatedServiceAdjustments: serviceResult.unallocatedAdjustments,
    refunds,
    vendorRecovery,
    receivables,
    payables,
    payments,
    businessValue: {
      route: "/travel/business-value",
      netBusinessValue: businessValue.netBusinessValue,
      totalPositiveValue: businessValue.totalPositiveValue,
      totalNegativeValue: businessValue.totalNegativeValue,
      selectedComponents: businessValue.selectedComponents,
      components: businessValue.components,
      generatedAt: businessValue.generatedAt,
    },
    charts: {
      revenueProfitTrend: trend,
      serviceSales: serviceResult.servicePerformance.slice(0, 8).map((row) => ({
        key: row.key,
        label: row.label,
        netSales: row.netSales,
        grossProfit: row.grossProfit,
      })),
      receivablePayable: [
        { key: "receivable", label: "Receivable", amount: totals.customerReceivable },
        { key: "payable", label: "Payable", amount: totals.vendorPayable },
      ],
      refundTrend,
      cashMovement: [
        { key: "cashIn", label: "Cash In", amount: totals.cashIn },
        { key: "cashOut", label: "Cash Out", amount: totals.cashOut },
      ],
    },
  };

  setCachedTravelReport(cacheKey, payload);

  return payload;
};

module.exports = {
  TRAVEL_EXPENSE_ORIGIN,
  buildTravelReportDateContext,
  calculateTravelProfitMath,
  getTravelReportSummary,
};
