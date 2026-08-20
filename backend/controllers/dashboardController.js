const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Product = require("../models/Product");
const { getProductStock } = require("../utils/stockHelper");
const InventoryTransaction = require("../models/InventoryTransaction");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");

const { getProfitSummary } = require("../services/accounting/profitService");

const {
  getDashboardCache,
  setDashboardCache,
} = require("../services/dashboardCacheService");

const getDashboardSummary = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const {
      startDate = "",
      endDate = "",
      filterType = "",
      refresh = "false",
    } = req.query;

    const forceRefresh = String(refresh).toLowerCase() === "true";

    if (!forceRefresh) {
      const cachedResult = getDashboardCache({
        userId,
        filterType,
        startDate,
        endDate,
      });

      if (cachedResult) {
        return res.json(cachedResult.data);
      }
    }

    let dateFilter = {};

    if (filterType === "today") {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      dateFilter = {
        date: {
          $gte: todayStart,
          $lte: todayEnd,
        },
      };
    } else if (startDate && endDate) {
      dateFilter = {
        date: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      };
    }

    const profitData = await getProfitSummary({
      userId,
      startDate,
      endDate,
      filterType,
    });

    const { netSales, netProfit, grossProfit, cogs } = profitData;

    const [activeCustomers, activeSuppliers, activeParties] = await Promise.all(
      [
        Customer.find({
          createdBy: userId,
          isActive: true,
        })
          .select("_id name account")
          .lean(),

        Supplier.find({
          userId,
          isDeleted: { $ne: true },
        })
          .select("_id name account")
          .lean(),

        Party.find({
          userId,
          isActive: true,
          isDeleted: false,
        })
          .select("_id name account")
          .lean(),
      ],
    );

    const activeCustomerAccountIds = activeCustomers
      .map((customer) => customer.account)
      .filter(Boolean);

    const activeSupplierAccountIds = activeSuppliers
      .map((supplier) => supplier.account)
      .filter(Boolean);

    const activePartyAccountIds = activeParties
      .map((party) => party.account)
      .filter(Boolean);

    const combinedData = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
          ...dateFilter,
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
          $or: [
            {
              "accountInfo.category": {
                $nin: ["customer", "supplier", "party"],
              },
            },
            {
              "accountInfo.category": "customer",
              "lines.account": {
                $in: activeCustomerAccountIds,
              },
            },
            {
              "accountInfo.category": "supplier",
              "lines.account": {
                $in: activeSupplierAccountIds,
              },
            },
            {
              "accountInfo.category": "party",
              "lines.account": {
                $in: activePartyAccountIds,
              },
            },
          ],
        },
      },

      {
        $group: {
          _id: {
            account: "$lines.account",
            type: "$accountInfo.type",
            category: "$accountInfo.category",
            lineType: "$lines.type",
            accountCode: "$accountInfo.code",
          },

          total: {
            $sum: "$lines.amount",
          },
        },
      },
    ]);

    let totalCash = 0;
    let totalBank = 0;

    const customerBalances = {};
    const supplierBalances = {};
    const partyBalances = {};

    combinedData.forEach((item) => {
      const { account, type, category, lineType } = item._id;

      const amount = Number(item.total || 0);
      const accountId = account?.toString();

      // ✅ Cash balance
      if (category === "cash") {
        if (lineType === "debit") {
          totalCash += amount;
        } else {
          totalCash -= amount;
        }
      }

      // ✅ Bank / Online / Cheque balance
      if (
        type === "Asset" &&
        ["bank", "online", "cheque", "wallet"].includes(category)
      ) {
        if (lineType === "debit") {
          totalBank += amount;
        } else {
          totalBank -= amount;
        }
      }

      // ✅ Customer balance: Debit - Credit
      if (category === "customer" && accountId) {
        if (!customerBalances[accountId]) {
          customerBalances[accountId] = 0;
        }

        if (lineType === "debit") {
          customerBalances[accountId] += amount;
        } else {
          customerBalances[accountId] -= amount;
        }
      }

      // ✅ Supplier balance: Credit - Debit
      if (category === "supplier" && accountId) {
        if (!supplierBalances[accountId]) {
          supplierBalances[accountId] = 0;
        }

        if (lineType === "credit") {
          supplierBalances[accountId] += amount;
        } else {
          supplierBalances[accountId] -= amount;
        }
      }

      // ✅ Party balance: Debit - Credit
      if (category === "party" && accountId) {
        if (!partyBalances[accountId]) {
          partyBalances[accountId] = 0;
        }

        if (lineType === "debit") {
          partyBalances[accountId] += amount;
        } else {
          partyBalances[accountId] -= amount;
        }
      }
    });

    const receivableDetails = [];
    const payableDetails = [];

    // ✅ Customer balances
    activeCustomers.forEach((customer) => {
      const accountId = customer.account?.toString();

      if (!accountId) {
        return;
      }

      const balance = Number(customerBalances[accountId] || 0);

      if (balance > 0) {
        receivableDetails.push({
          entityId: customer._id,
          accountId: customer.account,
          name: customer.name || "Unnamed Customer",
          entityType: "customer",
          amount: Number(balance.toFixed(2)),
        });
      } else if (balance < 0) {
        payableDetails.push({
          entityId: customer._id,
          accountId: customer.account,
          name: customer.name || "Unnamed Customer",
          entityType: "customer",
          amount: Number(Math.abs(balance).toFixed(2)),
        });
      }
    });

    activeSuppliers.forEach((supplier) => {
      const accountId = supplier.account?.toString();

      if (!accountId) {
        return;
      }

      const balance = Number(supplierBalances[accountId] || 0);

      if (balance > 0) {
        payableDetails.push({
          entityId: supplier._id,
          accountId: supplier.account,
          name: supplier.name || "Unnamed Supplier",
          entityType: "supplier",
          amount: Number(balance.toFixed(2)),
        });
      } else if (balance < 0) {
        receivableDetails.push({
          entityId: supplier._id,
          accountId: supplier.account,
          name: supplier.name || "Unnamed Supplier",
          entityType: "supplier",
          amount: Number(Math.abs(balance).toFixed(2)),
        });
      }
    });

    activeParties.forEach((party) => {
      const accountId = party.account?.toString();

      if (!accountId) {
        return;
      }

      const balance = Number(partyBalances[accountId] || 0);

      if (balance > 0) {
        receivableDetails.push({
          entityId: party._id,
          accountId: party.account,
          name: party.name || "Unnamed Party",
          entityType: "party",
          amount: Number(balance.toFixed(2)),
        });
      } else if (balance < 0) {
        payableDetails.push({
          entityId: party._id,
          accountId: party.account,
          name: party.name || "Unnamed Party",
          entityType: "party",
          amount: Number(Math.abs(balance).toFixed(2)),
        });
      }
    });

    receivableDetails.sort((first, second) => second.amount - first.amount);

    payableDetails.sort((first, second) => second.amount - first.amount);

    const totalReceivable = receivableDetails.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );

    const totalPayable = payableDetails.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );

    const dashboardExpenses = combinedData
      .filter((item) => {
        const { type, lineType, accountCode } = item._id;

        const code = String(accountCode || "").toUpperCase();

        return (
          type === "Expense" &&
          lineType === "debit" &&
          code !== "COGS" &&
          !code.includes("DISCOUNT")
        );
      })
      .reduce((sum, item) => sum + Number(item.total || 0), 0);

    const dashboardData = {
      totalSales: Number(Number(netSales || 0).toFixed(2)),
      totalExpenses: Number(dashboardExpenses.toFixed(2)),
      netProfit: Number(Number(netProfit || 0).toFixed(2)),
      grossProfit: Number(Number(grossProfit || 0).toFixed(2)),
      cogs: Number(Number(cogs || 0).toFixed(2)),
      totalCash: Number(totalCash.toFixed(2)),
      totalBank: Number(totalBank.toFixed(2)),
      totalReceivable: Number(totalReceivable.toFixed(2)),
      totalPayable: Number(totalPayable.toFixed(2)),

      receivableDetails,
      payableDetails,
    };

    setDashboardCache({
      userId,
      filterType,
      startDate,
      endDate,
      data: dashboardData,
    });

    return res.json(dashboardData);
  } catch (error) {
    console.error("Dashboard Summary Error:", error);

    res.status(500).json({
      message: "Server Error",
      error: error.message,
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
          let: { accId: "$lines.account" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$accId"] },
              },
            },
            {
              $project: {
                type: 1,
                category: 1,
              },
            },
          ],
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

    const activeCustomers = await Customer.find({
      createdBy: userId,
      isActive: true,
    }).select("_id");

    const activeCustomerIds = activeCustomers.map((c) => c._id);

    const overdueQuery = {
      createdBy: userId,
      isDeleted: { $ne: true },

      // ✅ hidden customer invoices ignore
      customerId: { $in: activeCustomerIds },

      status: { $ne: "Paid" },
      dueDate: { $lt: today },
      ...invoiceDateFilter,
    };

    const overdueInvoicesPromise =
      onlyPending === "true"
        ? Promise.resolve(0)
        : Invoice.countDocuments(overdueQuery);

    const pendingQuery = {
      createdBy: userId,
      isDeleted: { $ne: true },

      // ✅ hidden customer invoices ignore
      customerId: { $in: activeCustomerIds },

      status: { $in: ["Unpaid", "Partial"] },
      ...invoiceDateFilter,
    };

    const pendingPaymentsPromise =
      onlyOverdue === "true"
        ? Promise.resolve(0)
        : Invoice.countDocuments(pendingQuery);

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
