const mongoose = require("mongoose");

const Product = require("../models/Product");

const escapeRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getSafePositiveInteger = (value, fallback, max = null) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  if (max && parsed > max) {
    return max;
  }

  return parsed;
};

exports.getStockValueReport = async (req, res) => {
  try {
    const rawUserId = req.user?.id || req.userId;

    if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user",
      });
    }

    const userId = new mongoose.Types.ObjectId(rawUserId);

    const {
      startDate = "",
      endDate = "",
      search = "",
      categoryId = "",
      hideZero = "false",
      negativeOnly = "false",
      page = 1,
      limit = 50,
    } = req.query;

    const currentPage = getSafePositiveInteger(page, 1);
    const pageLimit = getSafePositiveInteger(limit, 50, 200);

    const productMatch = {
      userId,
    };

    const cleanSearch = String(search || "").trim();

    if (cleanSearch) {
      productMatch.name = {
        $regex: escapeRegex(cleanSearch),
        $options: "i",
      };
    }

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      productMatch.categoryId = new mongoose.Types.ObjectId(categoryId);
    }

    const transactionDateMatch = {};

    if (startDate) {
      const start = new Date(startDate);

      if (!Number.isNaN(start.getTime())) {
        start.setHours(0, 0, 0, 0);

        transactionDateMatch.$gte = start;
      }
    }

    if (endDate) {
      const end = new Date(endDate);

      if (!Number.isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);

        transactionDateMatch.$lte = end;
      }
    }

    const inventoryMatchExpr = [
      {
        $eq: ["$productId", "$$productId"],
      },
      {
        $eq: ["$userId", userId],
      },
    ];

    if (Object.keys(transactionDateMatch).length > 0) {
      inventoryMatchExpr.push({
        $gte: ["$date", transactionDateMatch.$gte || new Date(0)],
      });

      if (transactionDateMatch.$lte) {
        inventoryMatchExpr.push({
          $lte: ["$date", transactionDateMatch.$lte],
        });
      }
    }

    const rowMatch = {};

    if (negativeOnly === "true") {
      rowMatch.stockQty = {
        $lt: 0,
      };
    } else if (hideZero === "true") {
      rowMatch.stockQty = {
        $ne: 0,
      };
    }

    const inventoryCollection = mongoose.connection.collection(
      "inventorytransactions",
    ).collectionName;

    const categoryCollection =
      mongoose.connection.collection("categories").collectionName;

    const pipeline = [
      {
        $match: productMatch,
      },

      {
        $lookup: {
          from: inventoryCollection,
          let: {
            productId: "$_id",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: inventoryMatchExpr,
                },
              },
            },

            {
              $group: {
                _id: null,

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
          ],

          as: "stockData",
        },
      },

      {
        $lookup: {
          from: categoryCollection,
          localField: "categoryId",
          foreignField: "_id",
          as: "categoryData",
        },
      },

      {
        $set: {
          stockQty: {
            $ifNull: [
              {
                $arrayElemAt: ["$stockData.stock", 0],
              },
              0,
            ],
          },

          unitCost: {
            $convert: {
              input: "$unitCost",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },

          salePrice: {
            $convert: {
              input: "$salePrice",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },

          category: {
            $ifNull: [
              {
                $arrayElemAt: ["$categoryData.name", 0],
              },
              "-",
            ],
          },
        },
      },

      {
        $set: {
          costValue: {
            $multiply: ["$stockQty", "$unitCost"],
          },

          saleValue: {
            $multiply: ["$stockQty", "$salePrice"],
          },

          isNegative: {
            $lt: ["$stockQty", 0],
          },
        },
      },

      ...(Object.keys(rowMatch).length > 0
        ? [
            {
              $match: rowMatch,
            },
          ]
        : []),

      {
        $facet: {
          rows: [
            {
              $sort: {
                costValue: -1,
                name: 1,
                _id: 1,
              },
            },

            {
              $skip: (currentPage - 1) * pageLimit,
            },

            {
              $limit: pageLimit,
            },

            {
              $project: {
                _id: 0,

                productId: "$_id",
                productName: "$name",
                category: 1,

                stockQty: 1,
                unitCost: 1,
                salePrice: 1,

                costValue: 1,
                saleValue: 1,
                isNegative: 1,
              },
            },
          ],

          summary: [
            {
              $group: {
                _id: null,

                totalProducts: {
                  $sum: 1,
                },

                totalQty: {
                  $sum: "$stockQty",
                },

                totalCostValue: {
                  $sum: "$costValue",
                },

                totalSaleValue: {
                  $sum: "$saleValue",
                },

                negativeStockValue: {
                  $sum: {
                    $cond: [
                      {
                        $lt: ["$stockQty", 0],
                      },
                      "$costValue",
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const result = await Product.aggregate(pipeline);

    const rows = Array.isArray(result?.[0]?.rows) ? result[0].rows : [];

    const rawSummary = result?.[0]?.summary?.[0] || {};

    const totalProducts = Number(rawSummary.totalProducts || 0);

    const totalPages =
      totalProducts > 0 ? Math.ceil(totalProducts / pageLimit) : 0;

    return res.json({
      success: true,

      summary: {
        totalProducts,

        totalQty: Number(Number(rawSummary.totalQty || 0).toFixed(2)),

        totalCostValue: Number(
          Number(rawSummary.totalCostValue || 0).toFixed(2),
        ),

        totalSaleValue: Number(
          Number(rawSummary.totalSaleValue || 0).toFixed(2),
        ),

        negativeStockValue: Number(
          Number(rawSummary.negativeStockValue || 0).toFixed(2),
        ),
      },

      rows,

      pagination: {
        page: currentPage,
        limit: pageLimit,
        totalRows: totalProducts,
        totalPages,
        hasPreviousPage: currentPage > 1,
        hasNextPage: currentPage < totalPages,
      },
    });
  } catch (error) {
    console.error("Stock Value Report Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate stock value report",
      error: error.message,
    });
  }
};
