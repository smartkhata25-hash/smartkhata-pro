const mongoose = require("mongoose");

const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");

// 📦 STOCK VALUE REPORT

exports.getStockValueReport = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);

    const {
      startDate,
      endDate,
      search = "",
      categoryId,
      hideZero = "false",
      negativeOnly = "false",
    } = req.query;

    //  📅 DATE FILTER

    let transactionDateFilter = {};

    if (startDate || endDate) {
      transactionDateFilter.date = {};

      if (startDate) {
        transactionDateFilter.date.$gte = new Date(startDate);
      }

      if (endDate) {
        transactionDateFilter.date.$lte = new Date(endDate);
      }
    }

    //📦 PRODUCT FILTER

    const productFilter = {
      userId,
    };

    if (search.trim()) {
      productFilter.name = {
        $regex: search.trim(),
        $options: "i",
      };
    }

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      productFilter.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    //📦 GET PRODUCTS

    const products = await Product.find(productFilter)
      .populate("categoryId", "name")
      .lean();

    const productIds = products.map((p) => p._id);

    // 📊 STOCK AGGREGATION

    const stockData = await InventoryTransaction.aggregate([
      {
        $match: {
          productId: { $in: productIds },
          userId,
          ...transactionDateFilter,
        },
      },

      {
        $group: {
          _id: "$productId",

          stock: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: {
                      $in: ["$type", ["IN", "ADJUST_IN"]],
                    },
                    then: "$quantity",
                  },

                  {
                    case: {
                      $in: ["$type", ["OUT", "ADJUST_OUT"]],
                    },
                    then: {
                      $multiply: ["$quantity", -1],
                    },
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
      stockMap[item._id.toString()] = item.stock || 0;
    });

    let rows = products.map((product) => {
      const stockQty = stockMap[product._id.toString()] || 0;

      const unitCost = Number(product.unitCost || 0);

      const salePrice = Number(product.salePrice || 0);

      const costValue = stockQty * unitCost;

      const saleValue = stockQty * salePrice;

      return {
        productId: product._id,

        productName: product.name,

        category: product.categoryId?.name || "-",

        stockQty,

        unitCost,

        salePrice,

        costValue,

        saleValue,

        isNegative: stockQty < 0,
      };
    });

    if (hideZero === "true") {
      rows = rows.filter((row) => row.stockQty !== 0);
    }

    if (negativeOnly === "true") {
      rows = rows.filter((row) => row.stockQty < 0);
    }

    // 📊 SUMMARY

    const summary = rows.reduce(
      (acc, row) => {
        acc.totalProducts += 1;

        acc.totalQty += row.stockQty;

        acc.totalCostValue += row.costValue;

        acc.totalSaleValue += row.saleValue;

        if (row.isNegative) {
          acc.negativeStockValue += row.costValue;
        }

        return acc;
      },

      {
        totalProducts: 0,
        totalQty: 0,
        totalCostValue: 0,
        totalSaleValue: 0,
        negativeStockValue: 0,
      },
    );

    res.json({
      success: true,

      summary: {
        totalProducts: Number(summary.totalProducts || 0),

        totalQty: Number(summary.totalQty || 0),

        totalCostValue: Number(summary.totalCostValue.toFixed(2) || 0),

        totalSaleValue: Number(summary.totalSaleValue.toFixed(2) || 0),

        negativeStockValue: Number(summary.negativeStockValue.toFixed(2) || 0),
      },

      rows,
    });
  } catch (error) {
    console.error("Stock Value Report Error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to generate stock value report",
      error: error.message,
    });
  }
};
