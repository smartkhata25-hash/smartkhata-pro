const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");

const { calculateProfitMetrics } = require("./profitCalculationService");
const { buildBusinessPresetDateRange } = require("../../utils/businessDate");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
} = require("../../utils/employeePayrollOrigins");

const TRAVEL_JOURNAL_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
  ...TRAVEL_EMPLOYEE_ORIGIN_VALUES,
  ...TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
]);

const TRAVEL_JOURNAL_SOURCE_TYPES = Object.freeze([
  "travel_booking",
  "travel_customer_advance",
  "travel_vendor_cost",
  "travel_vendor_advance",
  "travel_vendor_return",
  "travel_commission",
  "travel_refund",
  "travel_adjustment",
]);

const getTravelJournalConditions = () => [
  { originModule: { $in: TRAVEL_JOURNAL_ORIGINS } },
  { sourceType: { $in: TRAVEL_JOURNAL_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_JOURNAL_ORIGINS },
  },
];

const getTradingJournalFilter = () => ({
  $nor: getTravelJournalConditions(),
});

const buildDateFilter = ({ filterType, startDate, endDate }) => {
  return buildBusinessPresetDateRange({
    dateFilter: filterType,
    fromDate: startDate,
    toDate: endDate,
  });
};

const buildInvoiceDateFilter = ({ filterType, startDate, endDate }) => {
  const rawDateFilter = buildDateFilter({
    filterType,
    startDate,
    endDate,
  });

  if (!rawDateFilter.date) {
    return {};
  }

  return {
    invoiceDate: rawDateFilter.date,
  };
};

const getOperatingExpenses = async ({
  objectUserId,
  journalDateFilter,
  includeExpenses,
  includeBreakdown = true,
}) => {
  if (!includeExpenses) {
    return {
      operatingExpenses: 0,
      expenseBreakdown: [],
    };
  }

  const basePipeline = [
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        ...getTradingJournalFilter(),
        ...journalDateFilter,
      },
    },
    {
      $unwind: "$lines",
    },
    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "accountInfo",
      },
    },
    {
      $unwind: "$accountInfo",
    },
    {
      $match: {
        "accountInfo.type": "Expense",
        "accountInfo.code": {
          $ne: "COGS",
        },
        "lines.type": "debit",
      },
    },
  ];

  if (!includeBreakdown) {
    const result = await JournalEntry.aggregate([
      ...basePipeline,
      {
        $group: {
          _id: null,
          total: {
            $sum: "$lines.amount",
          },
        },
      },
    ]);

    return {
      operatingExpenses: Number(Number(result?.[0]?.total || 0).toFixed(2)),
      expenseBreakdown: [],
    };
  }

  const expenseData = await JournalEntry.aggregate([
    ...basePipeline,
    {
      $group: {
        _id: {
          accountId: "$lines.account",
          accountName: "$accountInfo.name",
          accountCode: "$accountInfo.code",
        },
        total: {
          $sum: "$lines.amount",
        },
      },
    },
    {
      $sort: {
        total: -1,
      },
    },
  ]);

  const expenseBreakdown = expenseData.map((item) => ({
    accountId: item._id?.accountId || null,
    accountName: item._id?.accountName || "Unknown",
    accountCode: item._id?.accountCode || "",
    amount: Number(Number(item.total || 0).toFixed(2)),
  }));

  const operatingExpenses = expenseBreakdown.reduce(
    (total, item) => total + Number(item.amount || 0),
    0,
  );

  return {
    operatingExpenses: Number(operatingExpenses.toFixed(2)),
    expenseBreakdown,
  };
};

const getProfitSummary = async ({
  userId,
  startDate,
  endDate,
  filterType,
  productId,
  categoryId,
  includeBreakdowns = true,
}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Valid userId is required");
  }

  const objectUserId = new mongoose.Types.ObjectId(userId);

  const journalDateFilter = buildDateFilter({
    filterType,
    startDate,
    endDate,
  });

  const invoiceDateFilter = buildInvoiceDateFilter({
    filterType,
    startDate,
    endDate,
  });

  const isProductMode =
    (productId && mongoose.Types.ObjectId.isValid(productId)) ||
    (categoryId && mongoose.Types.ObjectId.isValid(categoryId));

  const { products, totals } = await calculateProfitMetrics({
    userId,
    invoiceDateFilter,
    productId,
    categoryId,
    includeProducts: includeBreakdowns,
  });

  const { operatingExpenses, expenseBreakdown } = await getOperatingExpenses({
    objectUserId,
    journalDateFilter,
    includeExpenses: !isProductMode,
    includeBreakdown: includeBreakdowns,
  });

  const grossProfit = Number(totals.grossProfit || 0);

  const netProfit = grossProfit - Number(operatingExpenses || 0);

  const cogsBreakdown = includeBreakdowns
    ? products.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        soldQty: product.soldQty,
        refundQty: product.refundQty,
        netQty: product.netQty,
        saleCost: product.saleCost,
        refundCost: product.refundCost,
        netCogs: product.netCogs,
        amount: product.netCogs,
      }))
    : [];

  return {
    totalSales: Number(Number(totals.netSales || 0).toFixed(2)),

    grossSales: Number(Number(totals.grossSales || 0).toFixed(2)),

    salesReturn: Number(Number(totals.refundAmount || 0).toFixed(2)),

    netSales: Number(Number(totals.netSales || 0).toFixed(2)),

    cogs: Number(Number(totals.netCogs || 0).toFixed(2)),

    saleCost: Number(Number(totals.saleCost || 0).toFixed(2)),

    refundCost: Number(Number(totals.refundCost || 0).toFixed(2)),

    grossProfit: Number(grossProfit.toFixed(2)),

    operatingExpenses: Number(Number(operatingExpenses || 0).toFixed(2)),

    netProfit: Number(netProfit.toFixed(2)),

    margin: Number(Number(totals.margin || 0).toFixed(2)),

    soldQty: Number(Number(totals.soldQty || 0).toFixed(2)),

    refundQty: Number(Number(totals.refundQty || 0).toFixed(2)),

    netQty: Number(Number(totals.netQty || 0).toFixed(2)),

    expenseBreakdown,
    cogsBreakdown,
    productBreakdown: includeBreakdowns ? products : [],
  };
};

module.exports = {
  getProfitSummary,
  buildDateFilter,
  buildInvoiceDateFilter,
};
