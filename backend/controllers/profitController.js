const mongoose = require("mongoose");

const JournalEntry = require("../models/JournalEntry");

const Invoice = require("../models/Invoice");

const {
  getProfitSummary,
  buildDateFilter,
} = require("../services/accounting/profitService");

/* ======================================================
   ✅ PROFIT SUMMARY
====================================================== */

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

/* ======================================================
   ✅ EXPENSE BREAKDOWN
====================================================== */

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

/* ======================================================
   ✅ COGS BREAKDOWN
====================================================== */

const getCogsBreakdown = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const cogs = await JournalEntry.aggregate([
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
          "accountInfo.code": "COGS",
          "accountInfo.type": "Expense",
          "lines.type": "debit",
        },
      },

      {
        $group: {
          _id: {
            accountName: "$accountInfo.name",
          },

          total: {
            $sum: "$lines.amount",
          },
        },
      },
    ]);

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

/* ======================================================
   ✅ SALES BREAKDOWN
====================================================== */

const getSalesBreakdown = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { filterType, startDate, endDate, productId, categoryId } = req.query;

    // ✅ Invoice date filter

    const rawDateFilter = buildDateFilter({
      filterType,
      startDate,
      endDate,
    });

    const dateFilter = {};

    if (rawDateFilter.date) {
      dateFilter.invoiceDate = rawDateFilter.date;
    }

    const sales = await Invoice.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,

          isOpening: false,

          ...dateFilter,
        },
      },

      { $unwind: "$items" },

      // ✅ Product filter

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
        $project: {
          _id: 1,

          invoiceNo: "$billNo",

          customerName: "$customerName",

          invoiceDate: "$invoiceDate",

          productName: "$productInfo.name",

          qty: "$items.quantity",

          amount: "$items.total",
        },
      },

      {
        $sort: {
          invoiceDate: -1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: sales.length,
      data: sales,
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

/* ======================================================
   ✅ PRODUCT PROFITABILITY
====================================================== */

const getProductProfitability = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const { filterType, startDate, endDate, productId, categoryId } = req.query;

    // ✅ Invoice date filter
    const rawDateFilter = buildDateFilter({
      filterType,
      startDate,
      endDate,
    });

    // ✅ Convert date -> invoiceDate
    const dateFilter = {};

    if (rawDateFilter.date) {
      dateFilter.invoiceDate = rawDateFilter.date;
    }

    const products = await Invoice.aggregate([
      {
        $match: {
          createdBy: userId,
          isDeleted: false,

          isOpening: false,

          ...dateFilter,
        },
      },

      { $unwind: "$items" },
      // 🎯 Single product filter after unwind
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
          _id: "$items.productId",

          productName: {
            $first: "$productInfo.name",
          },

          totalQty: {
            $sum: "$items.quantity",
          },

          totalSales: {
            $sum: "$items.total",
          },

          totalCost: {
            $sum: {
              $multiply: ["$items.costPrice", "$items.quantity"],
            },
          },

          totalProfit: {
            $sum: "$items.profit",
          },
        },
      },

      {
        $project: {
          _id: 0,

          productId: "$_id",

          productName: 1,

          qtySold: {
            $round: ["$totalQty", 2],
          },

          sales: {
            $round: ["$totalSales", 2],
          },

          cost: {
            $round: ["$totalCost", 2],
          },

          profit: {
            $round: ["$totalProfit", 2],
          },

          margin: {
            $cond: [
              { $gt: ["$totalSales", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      {
                        $divide: ["$totalProfit", "$totalSales"],
                      },
                      100,
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
        },
      },

      {
        $sort: {
          profit: -1,
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: products.length,
      data: products,
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
