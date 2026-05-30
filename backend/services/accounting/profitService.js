const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");

const Invoice = require("../../models/Invoice");

/* ======================================================
   ✅ DATE FILTER HELPER
====================================================== */

const buildDateFilter = ({ filterType, startDate, endDate }) => {
  let dateFilter = {};

  const now = new Date();

  /* =========================
     TODAY
  ========================= */

  if (filterType === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    dateFilter = {
      date: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (filterType === "this_month") {
    /* =========================
     THIS MONTH
  ========================= */
    const start = new Date(now.getFullYear(), now.getMonth(), 1);

    const end = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    dateFilter = {
      date: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (filterType === "last_month") {
    /* =========================
     LAST MONTH
  ========================= */
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    dateFilter = {
      date: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (filterType === "this_year") {
    /* =========================
     THIS YEAR
  ========================= */
    const start = new Date(now.getFullYear(), 0, 1);

    const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

    dateFilter = {
      date: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (filterType === "last_year") {
    /* =========================
     LAST YEAR
  ========================= */
    const start = new Date(now.getFullYear() - 1, 0, 1);

    const end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);

    dateFilter = {
      date: {
        $gte: start,
        $lte: end,
      },
    };
  } else if (startDate && endDate) {
    /* =========================
     CUSTOM RANGE
  ========================= */
    dateFilter = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };
  }

  return dateFilter;
};

/* ======================================================
   ✅ PROFIT SUMMARY
====================================================== */

const getProfitSummary = async ({
  userId,
  startDate,
  endDate,
  filterType,
  productId,
  categoryId,
}) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);

  /* ======================================================
     DATE FILTER
  ====================================================== */

  const dateFilter = buildDateFilter({
    filterType,
    startDate,
    endDate,
  });

  /* ======================================================
     PRODUCT FILTERS
  ====================================================== */

  const invoiceFilters = {};

  // ✅ Detect product/category mode

  const isProductMode =
    (productId && mongoose.Types.ObjectId.isValid(productId)) ||
    (categoryId && mongoose.Types.ObjectId.isValid(categoryId));

  // ✅ Product filter

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    invoiceFilters["items.productId"] = new mongoose.Types.ObjectId(productId);
  }

  /* ======================================================
     PRODUCT / CATEGORY MODE
  ====================================================== */

  if (isProductMode) {
    const rawDateFilter = buildDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const invoiceDateFilter = {};

    if (rawDateFilter.date) {
      invoiceDateFilter.invoiceDate = rawDateFilter.date;
    }

    const products = await Invoice.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          isOpening: false,

          ...invoiceDateFilter,

          ...invoiceFilters,
        },
      },

      { $unwind: "$items" },

      // ✅ Product filter after unwind

      ...(productId && mongoose.Types.ObjectId.isValid(productId)
        ? [
            {
              $match: {
                "items.productId": new mongoose.Types.ObjectId(productId),
              },
            },
          ]
        : []),

      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productInfo",
        },
      },

      {
        $unwind: {
          path: "$productInfo",
          preserveNullAndEmptyArrays: true,
        },
      },

      // ✅ Category filter

      ...(categoryId && mongoose.Types.ObjectId.isValid(categoryId)
        ? [
            {
              $match: {
                "productInfo.categoryId": new mongoose.Types.ObjectId(
                  categoryId,
                ),
              },
            },
          ]
        : []),

      {
        $group: {
          _id: null,

          totalSales: {
            $sum: "$items.total",
          },

          cogs: {
            $sum: {
              $multiply: ["$items.costPrice", "$items.quantity"],
            },
          },

          grossProfit: {
            $sum: "$items.profit",
          },
        },
      },
    ]);

    const summary = products[0] || {};

    return {
      totalSales: Number((summary.totalSales || 0).toFixed(2)),

      salesReturn: 0,

      netSales: Number((summary.totalSales || 0).toFixed(2)),

      cogs: Number((summary.cogs || 0).toFixed(2)),

      grossProfit: Number((summary.grossProfit || 0).toFixed(2)),

      // ✅ Global expenses hidden in product mode

      operatingExpenses: 0,

      netProfit: Number((summary.grossProfit || 0).toFixed(2)),

      expenseBreakdown: [],

      cogsBreakdown: [],
    };
  }

  /* ======================================================
     NORMAL BUSINESS MODE
  ====================================================== */

  const data = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: objectUserId,
        isDeleted: false,
        ...dateFilter,
      },
    },

    { $unwind: "$lines" },

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
          accountId: "$lines.account",
          accountName: "$accountInfo.name",
          accountType: "$accountInfo.type",
          accountCode: "$accountInfo.code",
          accountCategory: "$accountInfo.category",
          lineType: "$lines.type",
        },

        total: {
          $sum: "$lines.amount",
        },
      },
    },
  ]);

  /* ======================================================
     CALCULATIONS
  ====================================================== */

  let totalSales = 0;

  let salesReturn = 0;

  let cogs = 0;

  let operatingExpenses = 0;

  const expenseBreakdown = [];

  const cogsBreakdown = [];

  data.forEach((item) => {
    const account = item._id;

    const amount = Number(item.total || 0);

    /* =========================
       SALES
    ========================= */

    if (account.accountType === "Income" && account.lineType === "credit") {
      if (String(account.accountCode || "").toUpperCase() === "SALES_RETURN") {
        salesReturn += amount;
      } else {
        totalSales += amount;
      }
    }

    /* =========================
       COGS
    ========================= */

    if (
      account.accountType === "Expense" &&
      account.lineType === "debit" &&
      String(account.accountCode || "").toUpperCase() === "COGS"
    ) {
      cogs += amount;

      cogsBreakdown.push({
        accountName: account.accountName,
        amount,
      });
    }

    /* =========================
       OPERATING EXPENSES
    ========================= */

    if (
      account.accountType === "Expense" &&
      account.lineType === "debit" &&
      String(account.accountCode || "").toUpperCase() !== "COGS"
    ) {
      operatingExpenses += amount;

      expenseBreakdown.push({
        accountName: account.accountName,
        amount,
      });
    }
  });

  /* ======================================================
     FINAL TOTALS
  ====================================================== */

  const netSales = totalSales - salesReturn;

  const grossProfit = netSales - cogs;

  const netProfit = grossProfit - operatingExpenses;

  return {
    totalSales: Number(totalSales.toFixed(2)),

    salesReturn: Number(salesReturn.toFixed(2)),

    netSales: Number(netSales.toFixed(2)),

    cogs: Number(cogs.toFixed(2)),

    grossProfit: Number(grossProfit.toFixed(2)),

    operatingExpenses: Number(operatingExpenses.toFixed(2)),

    netProfit: Number(netProfit.toFixed(2)),

    expenseBreakdown,

    cogsBreakdown,
  };
};

module.exports = {
  getProfitSummary,
  buildDateFilter,
};
