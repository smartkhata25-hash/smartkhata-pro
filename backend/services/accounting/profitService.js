const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");

const { calculateProfitMetrics } = require("./profitCalculationService");

// DATE FILTER HELPER

const buildDateFilter = ({ filterType, startDate, endDate }) => {
  let dateFilter = {};

  const now = new Date();

  // ✅ Pakistan Time (+05:00)
  const pakistanNow = new Date(
    now.toLocaleString("en-US", {
      timeZone: "Asia/Karachi",
    }),
  );

  const formatDate = (date) => {
    const year = date.getFullYear();

    const month = String(date.getMonth() + 1).padStart(2, "0");

    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  };

  // TODAY
  if (filterType === "today") {
    const today = formatDate(pakistanNow);

    dateFilter = {
      date: {
        $gte: new Date(`${today}T00:00:00.000+05:00`),

        $lte: new Date(`${today}T23:59:59.999+05:00`),
      },
    };
  }

  // THIS MONTH
  else if (filterType === "this_month") {
    const start = new Date(
      pakistanNow.getFullYear(),

      pakistanNow.getMonth(),

      1,
    );

    const end = new Date(
      pakistanNow.getFullYear(),

      pakistanNow.getMonth() + 1,

      0,
    );

    dateFilter = {
      date: {
        $gte: new Date(`${formatDate(start)}T00:00:00.000+05:00`),

        $lte: new Date(`${formatDate(end)}T23:59:59.999+05:00`),
      },
    };
  }

  // LAST MONTH
  else if (filterType === "last_month") {
    const start = new Date(
      pakistanNow.getFullYear(),

      pakistanNow.getMonth() - 1,

      1,
    );

    const end = new Date(
      pakistanNow.getFullYear(),

      pakistanNow.getMonth(),

      0,
    );

    dateFilter = {
      date: {
        $gte: new Date(`${formatDate(start)}T00:00:00.000+05:00`),

        $lte: new Date(`${formatDate(end)}T23:59:59.999+05:00`),
      },
    };
  }

  // THIS YEAR
  else if (filterType === "this_year") {
    const currentYear = pakistanNow.getFullYear();

    dateFilter = {
      date: {
        $gte: new Date(`${currentYear}-01-01T00:00:00.000+05:00`),

        $lte: new Date(`${currentYear}-12-31T23:59:59.999+05:00`),
      },
    };
  }

  // LAST YEAR
  else if (filterType === "last_year") {
    const lastYear = pakistanNow.getFullYear() - 1;

    dateFilter = {
      date: {
        $gte: new Date(`${lastYear}-01-01T00:00:00.000+05:00`),

        $lte: new Date(`${lastYear}-12-31T23:59:59.999+05:00`),
      },
    };
  }

  // CUSTOM / MONTH / YEAR
  else if (
    (filterType === "custom" ||
      filterType === "month" ||
      filterType === "year") &&
    startDate &&
    endDate
  ) {
    const startHasTime = String(startDate).includes("T");
    const endHasTime = String(endDate).includes("T");

    const parsedStartDate = startHasTime
      ? new Date(startDate)
      : new Date(`${startDate}T00:00:00.000+05:00`);

    const parsedEndDate = endHasTime
      ? new Date(endDate)
      : new Date(`${endDate}T23:59:59.999+05:00`);

    dateFilter = {
      date: {
        $gte: parsedStartDate,
        $lte: parsedEndDate,
      },
    };
  }

  return dateFilter;
};

// HELPER: INVOICE DATE FILTER

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

// OPERATING EXPENSES

const getOperatingExpenses = async ({
  objectUserId,

  journalDateFilter,

  includeExpenses,
}) => {
  if (!includeExpenses) {
    return {
      operatingExpenses: 0,

      expenseBreakdown: [],
    };
  }

  const expenseData = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,

        isDeleted: false,

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

// PROFIT SUMMARY

const getProfitSummary = async ({
  userId,

  startDate,

  endDate,

  filterType,

  productId,

  categoryId,
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

  // ✅ Sales, Refund, COGS اور Profit ایک ہی Central Service سے
  const profitMetrics = await calculateProfitMetrics({
    userId,

    invoiceDateFilter,

    productId,

    categoryId,
  });

  const { products, totals } = profitMetrics;

  // ✅ Product یا Category Filter میں Business Expenses شامل نہیں ہوں گے
  const { operatingExpenses, expenseBreakdown } = await getOperatingExpenses({
    objectUserId,

    journalDateFilter,

    includeExpenses: !isProductMode,
  });

  const grossProfit = Number(totals.grossProfit || 0);

  const netProfit = grossProfit - operatingExpenses;

  const cogsBreakdown = products.map((product) => ({
    productId: product.productId,

    productName: product.productName,

    soldQty: product.soldQty,

    refundQty: product.refundQty,

    netQty: product.netQty,

    saleCost: product.saleCost,

    refundCost: product.refundCost,

    netCogs: product.netCogs,

    amount: product.netCogs,
  }));

  return {
    // ✅ UI میں Total Sales سے مراد Net Sales ہوگی
    totalSales: Number(Number(totals.netSales || 0).toFixed(2)),

    grossSales: Number(Number(totals.grossSales || 0).toFixed(2)),

    salesReturn: Number(Number(totals.refundAmount || 0).toFixed(2)),

    netSales: Number(Number(totals.netSales || 0).toFixed(2)),

    cogs: Number(Number(totals.netCogs || 0).toFixed(2)),

    saleCost: Number(Number(totals.saleCost || 0).toFixed(2)),

    refundCost: Number(Number(totals.refundCost || 0).toFixed(2)),

    grossProfit: Number(grossProfit.toFixed(2)),

    operatingExpenses: Number(operatingExpenses.toFixed(2)),

    netProfit: Number(netProfit.toFixed(2)),

    margin: Number(Number(totals.margin || 0).toFixed(2)),

    soldQty: Number(Number(totals.soldQty || 0).toFixed(2)),

    refundQty: Number(Number(totals.refundQty || 0).toFixed(2)),

    netQty: Number(Number(totals.netQty || 0).toFixed(2)),

    expenseBreakdown,

    cogsBreakdown,

    productBreakdown: products,
  };
};

module.exports = {
  getProfitSummary,

  buildDateFilter,

  buildInvoiceDateFilter,
};
