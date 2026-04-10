const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const { getProductStock } = require("../utils/stockHelper");
const InventoryTransaction = require("../models/InventoryTransaction");

// ✅ Dashboard Summary – Professional Version
const getDashboardSummary = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    // 🔍 Sample entry دیکھنے کے لیے

    const { startDate, endDate } = req.query;

    // ✅ Date filter
    let dateFilter = {};

    if (startDate && endDate) {
      dateFilter = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    // 🔍 FILTERED ENTRIES چیک کریں
    const filteredEntries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      ...dateFilter,
    });

    // 🔍 ALL ENTRIES (TOTAL)
    const allEntries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
    });

    /* ======================================================
       1️⃣ SALES & EXPENSES (WITH FILTER)
    ====================================================== */

    const salesExpenseData = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
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
            type: "$accountInfo.type",
            lineType: "$lines.type",
          },
          total: { $sum: "$lines.amount" },
        },
      },
    ]);

    /* ======================================================
       2️⃣ CASH / BANK / RECEIVABLE / PAYABLE (NO FILTER)
    ====================================================== */

    const balanceData = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
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
            type: "$accountInfo.type",
            category: "$accountInfo.category",
            lineType: "$lines.type",
          },
          total: { $sum: "$lines.amount" },
        },
      },
    ]);

    /* ======================================================
       🔢 CALCULATIONS
    ====================================================== */

    let totalSales = 0;
    let totalExpenses = 0;

    let totalCash = 0;
    let totalBank = 0;
    let totalReceivable = 0;
    let totalPayable = 0;

    let customerNet = 0;

    // 🔹 Sales & Expense
    salesExpenseData.forEach((item) => {
      const { type, lineType } = item._id;
      const amount = item.total;

      if (type === "Income" && lineType === "credit") {
        totalSales += amount;
      }

      if (type === "Expense" && lineType === "debit") {
        totalExpenses += amount;
      }
    });

    // 🔹 Balance
    balanceData.forEach((item) => {
      const { type, category, lineType } = item._id;
      const amount = item.total;

      if (category === "cash") {
        if (lineType === "debit") totalCash += amount;
        else totalCash -= amount;
      }

      if (type === "Asset" && ["bank", "online", "cheque"].includes(category)) {
        if (lineType === "debit") totalBank += amount;
        else totalBank -= amount;
      }

      if (type === "Asset" && category === "customer") {
        if (lineType === "debit") customerNet += amount;
        else customerNet -= amount;
      }

      if (type === "Liability") {
        if (lineType === "credit") totalPayable += amount;
        else totalPayable -= amount;
      }
    });

    totalReceivable = customerNet;

    const netProfit = totalSales - totalExpenses;

    res.json({
      totalSales: Number(totalSales.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      totalCash: Number(totalCash.toFixed(2)),
      totalBank: Number(totalBank.toFixed(2)),
      totalReceivable: Number(totalReceivable.toFixed(2)),
      totalPayable: Number(totalPayable.toFixed(2)),
    });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);

    res.status(500).json({
      message: "Server Error",
      error,
    });
  }
};
// ✅ Monthly Sales – Fully Professional Aggregation
const getMonthlySales = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const salesData = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
          date: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      { $unwind: "$lines" },

      // 🔎 Join account info
      {
        $lookup: {
          from: "accounts",
          localField: "lines.account",
          foreignField: "_id",
          as: "accountInfo",
        },
      },
      { $unwind: "$accountInfo" },

      // ✅ Only Income + credit
      {
        $match: {
          "accountInfo.type": "Income",
          "lines.type": "credit",
        },
      },

      // 📊 Group by month
      {
        $group: {
          _id: { $month: "$date" },
          total: { $sum: "$lines.amount" },
        },
      },

      { $sort: { _id: 1 } },
    ]);

    // 🗓 Always return 12 months
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const monthlyTotals = new Array(12).fill(0);

    salesData.forEach((item) => {
      monthlyTotals[item._id - 1] = item.total;
    });

    res.json({
      labels: monthNames,
      data: monthlyTotals,
    });
  } catch (error) {
    console.error("Monthly Sales Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Monthly Cash Flow – Enterprise Aggregation
const getMonthlyCashFlow = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const year = parseInt(req.query.year) || new Date().getFullYear();

    const cashFlowData = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
          date: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
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
        $match: {
          "accountInfo.category": { $in: ["cash", "bank"] },
        },
      },

      {
        $group: {
          _id: {
            month: { $month: "$date" },
            type: "$lines.type",
          },
          total: { $sum: "$lines.amount" },
        },
      },
    ]);

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    const inflow = new Array(12).fill(0);
    const outflow = new Array(12).fill(0);

    cashFlowData.forEach((item) => {
      const monthIndex = item._id.month - 1;

      if (item._id.type === "debit") {
        inflow[monthIndex] += item.total;
      } else {
        outflow[monthIndex] += item.total;
      }
    });

    res.json({
      labels: monthNames,
      inflow,
      outflow,
    });
  } catch (error) {
    console.error("Monthly Cash Flow Error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getDashboardAlerts = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    /* ======================================================
       🔎 QUERY FILTERS
    ====================================================== */

    const {
      startDate,
      endDate,
      includeZeroThreshold = "false",
      categoryId,
      onlyNegativeStock = "false",
      onlyOverdue = "false",
      onlyPending = "false",
    } = req.query;

    const today = new Date();

    let invoiceDateFilter = {};
    if (startDate && endDate) {
      invoiceDateFilter = {
        invoiceDate: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    /* ======================================================
       1️⃣ OVERDUE INVOICES
    ====================================================== */

    const overdueQuery = {
      createdBy: userId,
      isDeleted: { $ne: true },
      status: { $ne: "Paid" },
      dueDate: { $lt: today },
      ...invoiceDateFilter,
    };

    const overdueInvoicesPromise =
      onlyPending === "true"
        ? Promise.resolve(0)
        : Invoice.countDocuments(overdueQuery);

    /* ======================================================
       2️⃣ PENDING PAYMENTS
    ====================================================== */

    const pendingQuery = {
      createdBy: userId,
      isDeleted: { $ne: true },
      status: { $in: ["Unpaid", "Partial"] },
      ...invoiceDateFilter,
    };

    const pendingPaymentsPromise =
      onlyOverdue === "true"
        ? Promise.resolve(0)
        : Invoice.countDocuments(pendingQuery);

    /* ======================================================
       3️⃣ LOW STOCK (Filtered + Optimized)
    ====================================================== */

    let productFilter = { userId };

    if (categoryId) {
      productFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    const products = await Product.find(productFilter).select(
      "_id lowStockThreshold",
    );

    const productIds = products.map((p) => p._id);

    const stockData = await InventoryTransaction.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          userId,
        },
      },
      {
        $group: {
          _id: "$productId",
          stock: {
            $sum: {
              $switch: {
                branches: [
                  { case: { $eq: ["$type", "IN"] }, then: "$quantity" },
                  {
                    case: { $eq: ["$type", "OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                  { case: { $eq: ["$type", "ADJUST_IN"] }, then: "$quantity" },
                  {
                    case: { $eq: ["$type", "ADJUST_OUT"] },
                    then: { $multiply: ["$quantity", -1] },
                  },
                ],
                default: 0,
              },
            },
          },
        },
      },
    ]);

    const stockMap = {};
    stockData.forEach((item) => {
      stockMap[item._id.toString()] = item.stock;
    });

    let lowStock = 0;
    let negativeStock = 0;

    products.forEach((product) => {
      const currentStock = stockMap[product._id.toString()] || 0;
      const threshold = product.lowStockThreshold || 0;

      if (currentStock < 0) {
        negativeStock++;
      }

      if (
        (includeZeroThreshold === "true" || threshold > 0) &&
        currentStock <= threshold
      ) {
        lowStock++;
      }
    });

    /* ======================================================
       FINAL PARALLEL EXECUTION
    ====================================================== */

    const [overdueInvoices, pendingPayments] = await Promise.all([
      overdueInvoicesPromise,
      pendingPaymentsPromise,
    ]);

    res.json({
      summary: {
        lowStock,
        negativeStock,
        overdueInvoices,
        pendingPayments,
      },
      filtersApplied: {
        startDate,
        endDate,
        categoryId,
        includeZeroThreshold,
        onlyNegativeStock,
        onlyOverdue,
        onlyPending,
      },
      generatedAt: new Date(),
    });
  } catch (error) {
    console.error("Dashboard Alerts Error:", error);
    res.status(500).json({
      message: "Dashboard alerts calculation failed",
      error: error.message,
    });
  }
};

module.exports = {
  getDashboardSummary,
  getMonthlySales,
  getMonthlyCashFlow,
  getDashboardAlerts,
};
