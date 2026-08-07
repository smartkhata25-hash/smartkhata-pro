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
    });

    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error("Profit Summary Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load profit summary",
      error: error.message,
    });
  }
};

const getExpenseBreakdown = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const expenses = await JournalEntry.aggregate([
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
        $match: {
          "accountInfo.type": "Expense",
          "lines.type": "debit",
          "accountInfo.code": { $ne: "COGS" },
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

    res.status(200).json({
      success: true,
      count: expenses.length,
      data: expenses,
    });
  } catch (error) {
    console.error("Expense Breakdown Error:", error);

    res.status(500).json({
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

      // پرانے Frontend کے ساتھ Compatibility
      total: product.netCogs,

      _id: {
        accountName: product.productName,
      },
    }));

    res.status(200).json({
      success: true,
      count: cogs.length,
      data: cogs,
    });
  } catch (error) {
    console.error("COGS Breakdown Error:", error);

    res.status(500).json({
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

    const rawDateFilter = buildDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const dateFilter = {};

    if (rawDateFilter.date) {
      dateFilter.invoiceDate = rawDateFilter.date;
    }

    const buildPipeline = (isRefund = false) => [
      {
        $match: {
          createdBy: userId,
          isDeleted: false,
          isOpening: false,
          ...dateFilter,
        },
      },

      { $unwind: "$items" },

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
        $project: {
          _id: 1,

          invoiceNo: "$billNo",

          customerName: "$customerName",

          invoiceDate: "$invoiceDate",

          productName: "$productInfo.name",

          qty: isRefund
            ? {
                $multiply: ["$items.quantity", -1],
              }
            : "$items.quantity",

          amount: isRefund
            ? {
                $multiply: ["$items.total", -1],
              }
            : "$items.total",

          transactionType: {
            $literal: isRefund ? "refund" : "sale",
          },
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

    res.status(200).json({
      success: true,
      count: combinedData.length,
      data: combinedData,
    });
  } catch (error) {
    console.error("Sales Breakdown Error:", error);

    res.status(500).json({
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

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Product Profitability Error:", error);

    res.status(500).json({
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
