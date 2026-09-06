const mongoose = require("mongoose");

const JournalEntry = require("../models/JournalEntry");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");

const {
  getProfitSummary,
  buildDateFilter,
  buildInvoiceDateFilter,
} = require("../services/accounting/profitService");

const {
  calculateProfitMetrics,
} = require("../services/accounting/profitCalculationService");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
} = require("../utils/employeePayrollOrigins");

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

const getTradingJournalFilter = () => ({
  $nor: [
    { originModule: { $in: TRAVEL_JOURNAL_ORIGINS } },
    { sourceType: { $in: TRAVEL_JOURNAL_SOURCE_TYPES } },
    {
      sourceType: "reversal",
      originModule: { $in: TRAVEL_JOURNAL_ORIGINS },
    },
  ],
});

const getProfitSummaryController = async (req, res) => {
  try {
    const userId = req.user.id;

    const { startDate, endDate, filterType, productId, categoryId } = req.query;

    const summary = await getProfitSummary({
      userId,
      startDate,
      endDate,
      filterType,
      productId,
      categoryId,

      // Summary میں heavy breakdown arrays نہیں چاہئیں
      includeBreakdowns: false,
    });

    return res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Profit Summary Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load profit summary",
      error: error.message,
    });
  }
};

const getExpenseBreakdown = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { filterType, startDate, endDate } = req.query;

    const journalDateFilter = buildDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const expenses = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userId,
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
          "lines.type": "debit",
          "accountInfo.code": {
            $ne: "COGS",
          },
        },
      },

      {
        $group: {
          _id: {
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

    return res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error("Expense Breakdown Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load expense breakdown",
      error: error.message,
    });
  }
};

const getCogsBreakdown = async (req, res) => {
  try {
    const { filterType, startDate, endDate, productId, categoryId } = req.query;

    const invoiceDateFilter = buildInvoiceDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const { products } = await calculateProfitMetrics({
      userId: req.user.id,
      invoiceDateFilter,
      productId,
      categoryId,
      includeProducts: true,
    });

    const cogs = products.map((product) => ({
      productId: product.productId,
      productName: product.productName,

      soldQty: product.soldQty,
      refundQty: product.refundQty,
      netQty: product.netQty,

      saleCost: product.saleCost,
      refundCost: product.refundCost,
      netCogs: product.netCogs,

      total: product.netCogs,

      _id: {
        accountName: product.productName,
      },
    }));

    return res.status(200).json({
      success: true,
      count: cogs.length,
      data: cogs,
    });
  } catch (error) {
    console.error("COGS Breakdown Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load COGS breakdown",
      error: error.message,
    });
  }
};

const getSalesBreakdown = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { filterType, startDate, endDate, productId, categoryId } = req.query;

    const invoiceDateFilter = buildInvoiceDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const validProductId =
      productId && mongoose.Types.ObjectId.isValid(productId)
        ? new mongoose.Types.ObjectId(productId)
        : null;

    const validCategoryId =
      categoryId && mongoose.Types.ObjectId.isValid(categoryId)
        ? new mongoose.Types.ObjectId(categoryId)
        : null;

    const buildPipeline = (isRefund = false) => [
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
          isOpening: false,
          ...invoiceDateFilter,
        },
      },

      {
        $unwind: "$items",
      },

      ...(validProductId
        ? [
            {
              $match: {
                "items.productId": validProductId,
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

      ...(validCategoryId
        ? [
            {
              $match: {
                "productInfo.categoryId": validCategoryId,
              },
            },
          ]
        : []),

      {
        $project: {
          _id: 1,

          invoiceNo: "$billNo",

          customerName: "$customerName",

          invoiceDate: "$invoiceDate",

          productName: {
            $ifNull: ["$productInfo.name", "Unknown Product"],
          },

          qty: isRefund
            ? {
                $multiply: [
                  {
                    $ifNull: ["$items.quantity", 0],
                  },
                  -1,
                ],
              }
            : {
                $ifNull: ["$items.quantity", 0],
              },

          amount: isRefund
            ? {
                $multiply: [
                  {
                    $ifNull: ["$items.total", 0],
                  },
                  -1,
                ],
              }
            : {
                $ifNull: ["$items.total", 0],
              },

          transactionType: {
            $literal: isRefund ? "refund" : "sale",
          },
        },
      },

      {
        $sort: {
          invoiceDate: -1,
        },
      },
    ];

    const [sales, refunds] = await Promise.all([
      Invoice.aggregate(buildPipeline(false)),

      RefundInvoice.aggregate(buildPipeline(true)),
    ]);

    const combinedData = [...sales, ...refunds].sort(
      (a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate),
    );

    return res.status(200).json({
      success: true,
      count: combinedData.length,
      data: combinedData,
    });
  } catch (error) {
    console.error("Sales Breakdown Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load sales breakdown",
      error: error.message,
    });
  }
};

const getProductProfitability = async (req, res) => {
  try {
    const { filterType, startDate, endDate, productId, categoryId } = req.query;

    const invoiceDateFilter = buildInvoiceDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const { products } = await calculateProfitMetrics({
      userId: req.user.id,
      invoiceDateFilter,
      productId,
      categoryId,
      includeProducts: true,
    });

    const data = products.map((product) => ({
      productId: product.productId,
      productName: product.productName,

      qtySold: product.soldQty,
      soldQty: product.soldQty,

      refundQty: product.refundQty,
      netQty: product.netQty,

      sales: product.grossSales,
      grossSales: product.grossSales,

      refundAmount: product.refundAmount,
      netSales: product.netSales,

      saleCost: product.saleCost,
      refundCost: product.refundCost,

      cost: product.netCogs,
      netCogs: product.netCogs,

      profit: product.grossProfit,
      grossProfit: product.grossProfit,

      margin: product.margin,
    }));

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Product Profitability Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load product profitability",
      error: error.message,
    });
  }
};

module.exports = {
  getProfitSummaryController,
  getExpenseBreakdown,
  getCogsBreakdown,
  getSalesBreakdown,
  getProductProfitability,
};
