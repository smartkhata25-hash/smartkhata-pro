const mongoose = require("mongoose");

const JournalEntry = require("../../models/JournalEntry");

const Invoice = require("../../models/Invoice");

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

    const end = new Date(pakistanNow.getFullYear(), pakistanNow.getMonth(), 0);

    dateFilter = {
      date: {
        $gte: new Date(`${formatDate(start)}T00:00:00.000+05:00`),
        $lte: new Date(`${formatDate(end)}T23:59:59.999+05:00`),
      },
    };
  }

  // THIS YEAR
  else if (filterType === "this_year") {
    dateFilter = {
      date: {
        $gte: new Date(`${pakistanNow.getFullYear()}-01-01T00:00:00.000+05:00`),
        $lte: new Date(`${pakistanNow.getFullYear()}-12-31T23:59:59.999+05:00`),
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
    dateFilter = {
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    };
  }

  return dateFilter;
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
  const objectUserId = new mongoose.Types.ObjectId(userId);

  // DATE FILTER

  const dateFilter = buildDateFilter({
    filterType,
    startDate,
    endDate,
  });

  // PRODUCT FILTERS

  const invoiceFilters = {};

  // ✅ Detect product/category mode

  const isProductMode =
    (productId && mongoose.Types.ObjectId.isValid(productId)) ||
    (categoryId && mongoose.Types.ObjectId.isValid(categoryId));

  // ✅ Product filter

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    invoiceFilters["items.productId"] = new mongoose.Types.ObjectId(productId);
  }

  // PRODUCT / CATEGORY MODE

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

      operatingExpenses: 0,

      netProfit: Number((summary.grossProfit || 0).toFixed(2)),

      expenseBreakdown: [],

      cogsBreakdown: [],
    };
  }

  // NORMAL BUSINESS MODE

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

  // CALCULATIONS

  let totalSales = 0;

  let salesReturn = 0;

  let cogs = 0;

  let operatingExpenses = 0;

  const expenseBreakdown = [];

  const cogsBreakdown = [];

  data.forEach((item) => {
    const account = item._id;
    const amount = Number(item.total || 0);

    const accountCode = String(account.accountCode || "").toUpperCase();
    const accountName = String(account.accountName || "").toLowerCase();

    //SALES

    if (
      account.accountType === "Income" &&
      account.lineType === "credit" &&
      accountCode !== "SALES_RETURN" &&
      accountCode !== "PURCHASE_RETURN" &&
      accountCode !== "PURCHASE_DISCOUNT" &&
      !accountName.includes("return") &&
      !accountName.includes("discount")
    ) {
      totalSales += amount;
    }

    if (
      account.accountType === "Income" &&
      account.lineType === "debit" &&
      (accountCode === "SALES_RETURN" || accountName.includes("sales return"))
    ) {
      salesReturn += amount;
    }

    // COGS

    if (account.accountType === "Expense" && accountCode === "COGS") {
      if (account.lineType === "debit") {
        cogs += amount;

        cogsBreakdown.push({
          accountName: account.accountName,
          amount,
        });
      }

      if (account.lineType === "credit") {
        cogs -= amount;

        cogsBreakdown.push({
          accountName: account.accountName,
          amount: -amount,
        });
      }
    }

    // OPERATING EXPENSES

    if (
      account.accountType === "Expense" &&
      account.lineType === "debit" &&
      accountCode !== "COGS"
    ) {
      operatingExpenses += amount;

      expenseBreakdown.push({
        accountName: account.accountName,
        amount,
      });
    }
  });

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
