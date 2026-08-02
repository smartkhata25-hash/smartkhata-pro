const mongoose = require("mongoose");

const Product = require("../../models/Product");
const Invoice = require("../../models/Invoice");
const RefundInvoice = require("../../models/RefundInvoice");
const InventoryTransaction = require("../../models/InventoryTransaction");

const {
  PERFORMANCE_VIEWS,
  PERFORMANCE_DEFAULTS,
  PRODUCT_STATUSES,
  calculatePerformanceScore,
  getPerformanceScoreLabel,
  calculateDaysDifference,
  classifyProductStatus,
  calculateBlockedStockValue,
  roundAmount,
  toSafeNumber,
} = require("../../utils/productPerformanceRules");

// BASIC HELPERS

const toObjectId = (value, fieldName = "ID") => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return new mongoose.Types.ObjectId(value);
};

const escapeRegex = (value = "") => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const createMap = (rows = []) => {
  const map = {};

  rows.forEach((row) => {
    if (row?._id) {
      map[row._id.toString()] = row;
    }
  });

  return map;
};

const buildDateMatch = (fieldName, startDate = null, endDate = null) => {
  if (!startDate && !endDate) {
    return {};
  }

  const range = {};

  if (startDate) {
    range.$gte = startDate;
  }

  if (endDate) {
    range.$lte = endDate;
  }

  return {
    [fieldName]: range,
  };
};

//📦 PRODUCT FILTER

const getFilteredProducts = async ({
  userId,
  search = "",
  categoryId = null,
  productId = null,
}) => {
  const filter = {
    userId,
  };

  if (productId) {
    filter._id = productId;
  }

  if (search) {
    filter.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (categoryId) {
    filter.categoryId = categoryId;
  }

  return Product.find(filter)
    .select(
      [
        "name",
        "rackNo",
        "description",
        "categoryId",
        "unit",
        "unitCost",
        "salePrice",
        "createdAt",
      ].join(" "),
    )
    .populate("categoryId", "name")
    .lean();
};

const getSalesMetrics = async ({
  userId,
  productIds,
  startDate = null,
  endDate = null,
}) => {
  if (!productIds.length) {
    return [];
  }

  const dateMatch = buildDateMatch("invoiceDate", startDate, endDate);

  return Invoice.aggregate([
    {
      $match: {
        createdBy: userId,
        isDeleted: { $ne: true },
        isOpening: { $ne: true },
        "items.productId": { $in: productIds },
        ...dateMatch,
      },
    },

    {
      $addFields: {
        invoiceItemsTotal: {
          $sum: {
            $map: {
              input: "$items",
              as: "invoiceItem",
              in: {
                $cond: [
                  {
                    $gt: [
                      {
                        $ifNull: ["$$invoiceItem.total", 0],
                      },
                      0,
                    ],
                  },

                  {
                    $ifNull: ["$$invoiceItem.total", 0],
                  },

                  {
                    $multiply: [
                      {
                        $ifNull: ["$$invoiceItem.price", 0],
                      },

                      {
                        $ifNull: ["$$invoiceItem.quantity", 0],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    },

    {
      $unwind: "$items",
    },

    {
      $match: {
        "items.productId": {
          $in: productIds,
        },
      },
    },

    {
      $addFields: {
        itemGrossSales: {
          $cond: [
            {
              $gt: [
                {
                  $ifNull: ["$items.total", 0],
                },
                0,
              ],
            },

            {
              $ifNull: ["$items.total", 0],
            },

            {
              $multiply: [
                {
                  $ifNull: ["$items.price", 0],
                },

                {
                  $ifNull: ["$items.quantity", 0],
                },
              ],
            },
          ],
        },
      },
    },

    {
      $addFields: {
        allocatedDiscount: {
          $cond: [
            {
              $and: [
                {
                  $gt: [
                    {
                      $ifNull: ["$discountAmount", 0],
                    },
                    0,
                  ],
                },

                {
                  $gt: [
                    {
                      $ifNull: ["$invoiceItemsTotal", 0],
                    },
                    0,
                  ],
                },
              ],
            },

            {
              $multiply: [
                {
                  $ifNull: ["$discountAmount", 0],
                },

                {
                  $divide: ["$itemGrossSales", "$invoiceItemsTotal"],
                },
              ],
            },

            0,
          ],
        },
      },
    },

    {
      $group: {
        _id: "$items.productId",

        grossSoldQty: {
          $sum: {
            $ifNull: ["$items.quantity", 0],
          },
        },

        grossSales: {
          $sum: {
            $max: [
              {
                $subtract: ["$itemGrossSales", "$allocatedDiscount"],
              },
              0,
            ],
          },
        },

        grossCost: {
          $sum: {
            $multiply: [
              {
                $ifNull: ["$items.costPrice", 0],
              },

              {
                $ifNull: ["$items.quantity", 0],
              },
            ],
          },
        },

        invoiceIds: {
          $addToSet: "$_id",
        },

        lastSaleDate: {
          $max: "$invoiceDate",
        },

        firstSaleDate: {
          $min: "$invoiceDate",
        },
      },
    },

    {
      $project: {
        _id: 1,
        grossSoldQty: 1,
        grossSales: 1,
        grossCost: 1,
        lastSaleDate: 1,
        firstSaleDate: 1,

        invoiceCount: {
          $size: "$invoiceIds",
        },
      },
    },
  ]);
};

const getLifetimeSaleMetrics = async ({ userId, productIds }) => {
  if (!productIds.length) {
    return [];
  }

  return Invoice.aggregate([
    {
      $match: {
        createdBy: userId,
        isDeleted: { $ne: true },
        isOpening: { $ne: true },
        "items.productId": { $in: productIds },
      },
    },

    {
      $unwind: "$items",
    },

    {
      $match: {
        "items.productId": {
          $in: productIds,
        },
      },
    },

    {
      $group: {
        _id: "$items.productId",

        lifetimeSoldQty: {
          $sum: {
            $ifNull: ["$items.quantity", 0],
          },
        },

        lastSaleDate: {
          $max: "$invoiceDate",
        },

        firstSaleDate: {
          $min: "$invoiceDate",
        },
      },
    },
  ]);
};

const getRefundMetrics = async ({
  userId,
  productIds,
  startDate = null,
  endDate = null,
}) => {
  if (!productIds.length) {
    return [];
  }

  const dateMatch = buildDateMatch("invoiceDate", startDate, endDate);

  return RefundInvoice.aggregate([
    {
      $match: {
        createdBy: userId,
        isDeleted: { $ne: true },
        isOpening: { $ne: true },
        "items.productId": { $in: productIds },
        ...dateMatch,
      },
    },

    {
      $unwind: "$items",
    },

    {
      $match: {
        "items.productId": {
          $in: productIds,
        },
      },
    },

    {
      $lookup: {
        from: "invoices",
        localField: "originalInvoiceId",
        foreignField: "_id",
        as: "originalInvoice",
      },
    },

    {
      $addFields: {
        originalInvoice: {
          $arrayElemAt: ["$originalInvoice", 0],
        },
      },
    },

    {
      $addFields: {
        originalItem: {
          $arrayElemAt: [
            {
              $filter: {
                input: {
                  $ifNull: ["$originalInvoice.items", []],
                },

                as: "originalItem",

                cond: {
                  $eq: ["$$originalItem.productId", "$items.productId"],
                },
              },
            },

            0,
          ],
        },
      },
    },

    {
      $lookup: {
        from: "products",
        localField: "items.productId",
        foreignField: "_id",
        as: "productInfo",
      },
    },

    {
      $addFields: {
        productInfo: {
          $arrayElemAt: ["$productInfo", 0],
        },

        refundAmount: {
          $cond: [
            {
              $gt: [
                {
                  $ifNull: ["$items.total", 0],
                },
                0,
              ],
            },

            {
              $ifNull: ["$items.total", 0],
            },

            {
              $multiply: [
                {
                  $ifNull: ["$items.price", 0],
                },

                {
                  $ifNull: ["$items.quantity", 0],
                },
              ],
            },
          ],
        },
      },
    },

    {
      $addFields: {
        refundCostPrice: {
          $cond: [
            {
              $gt: [
                {
                  $ifNull: ["$items.costPrice", 0],
                },
                0,
              ],
            },

            {
              $ifNull: ["$items.costPrice", 0],
            },

            {
              $cond: [
                {
                  $gt: [
                    {
                      $ifNull: ["$originalItem.costPrice", 0],
                    },
                    0,
                  ],
                },

                {
                  $ifNull: ["$originalItem.costPrice", 0],
                },

                {
                  $ifNull: ["$productInfo.unitCost", 0],
                },
              ],
            },
          ],
        },
      },
    },

    {
      $group: {
        _id: "$items.productId",

        refundQty: {
          $sum: {
            $ifNull: ["$items.quantity", 0],
          },
        },

        refundAmount: {
          $sum: "$refundAmount",
        },

        refundCost: {
          $sum: {
            $multiply: [
              "$refundCostPrice",

              {
                $ifNull: ["$items.quantity", 0],
              },
            ],
          },
        },

        refundInvoiceIds: {
          $addToSet: "$_id",
        },

        lastRefundDate: {
          $max: "$invoiceDate",
        },
      },
    },

    {
      $project: {
        _id: 1,
        refundQty: 1,
        refundAmount: 1,
        refundCost: 1,
        lastRefundDate: 1,

        refundInvoiceCount: {
          $size: "$refundInvoiceIds",
        },
      },
    },
  ]);
};

// 📦 CURRENT STOCK + LAST PURCHASE

const getStockMetrics = async ({ userId, productIds }) => {
  if (!productIds.length) {
    return [];
  }

  return InventoryTransaction.aggregate([
    {
      $match: {
        userId,
        productId: {
          $in: productIds,
        },
      },
    },

    {
      $sort: {
        date: -1,
        _id: -1,
      },
    },

    {
      $group: {
        _id: "$productId",

        currentStock: {
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

        lastStockMovementDate: {
          $max: "$date",
        },

        purchaseTransactions: {
          $push: {
            $cond: [
              {
                $and: [
                  {
                    $eq: ["$invoiceModel", "PurchaseInvoice"],
                  },
                  {
                    $eq: ["$type", "IN"],
                  },
                ],
              },
              {
                date: "$date",
                rate: {
                  $ifNull: ["$rate", 0],
                },
              },
              null,
            ],
          },
        },
      },
    },

    {
      $addFields: {
        purchaseTransactions: {
          $filter: {
            input: "$purchaseTransactions",
            as: "purchase",
            cond: {
              $ne: ["$$purchase", null],
            },
          },
        },
      },
    },

    {
      $addFields: {
        lastPurchase: {
          $arrayElemAt: ["$purchaseTransactions", 0],
        },
      },
    },

    {
      $project: {
        _id: 1,
        currentStock: 1,
        lastStockMovementDate: 1,

        lastPurchaseDate: {
          $ifNull: ["$lastPurchase.date", null],
        },

        lastPurchaseRate: {
          $ifNull: ["$lastPurchase.rate", 0],
        },
      },
    },
  ]);
};

// 🧮 BUILD FINAL PERFORMANCE ROWS

const buildPerformanceRows = async ({
  userId,
  products,
  startDate = null,
  endDate = null,
  deadAfterDays = PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,
}) => {
  const productIds = products.map((product) => product._id);

  if (!productIds.length) {
    return [];
  }

  const [salesData, lifetimeSalesData, refundData, stockData] =
    await Promise.all([
      getSalesMetrics({
        userId,
        productIds,
        startDate,
        endDate,
      }),

      getLifetimeSaleMetrics({
        userId,
        productIds,
      }),

      getRefundMetrics({
        userId,
        productIds,
        startDate,
        endDate,
      }),

      getStockMetrics({
        userId,
        productIds,
      }),
    ]);

  const salesMap = createMap(salesData);
  const lifetimeSalesMap = createMap(lifetimeSalesData);
  const refundMap = createMap(refundData);
  const stockMap = createMap(stockData);

  const referenceDate = new Date();

  let rows = products.map((product) => {
    const productKey = product._id.toString();

    const sales = salesMap[productKey] || {};
    const lifetimeSales = lifetimeSalesMap[productKey] || {};
    const refunds = refundMap[productKey] || {};
    const stock = stockMap[productKey] || {};

    const grossSoldQty = toSafeNumber(sales.grossSoldQty, 0);

    const refundQty = toSafeNumber(refunds.refundQty, 0);

    const netSoldQty = grossSoldQty - refundQty;

    const grossSales = toSafeNumber(sales.grossSales, 0);

    const refundAmount = toSafeNumber(refunds.refundAmount, 0);

    const netSales = grossSales - refundAmount;

    const grossCost = toSafeNumber(sales.grossCost, 0);

    const refundCost = toSafeNumber(refunds.refundCost, 0);

    const netCost = grossCost - refundCost;

    const netProfit = netSales - netCost;

    const profitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

    const currentStock = toSafeNumber(stock.currentStock, 0);

    const lastSaleDate = lifetimeSales.lastSaleDate || null;

    const daysSinceLastSale = calculateDaysDifference(
      lastSaleDate,
      referenceDate,
    );

    const status = classifyProductStatus({
      currentStock,
      lastSaleDate,
      referenceDate,
      deadAfterDays,
    });

    const unitCost = toSafeNumber(product.unitCost, 0);

    const blockedStockValue = calculateBlockedStockValue({
      currentStock,
      unitCost,
      status,
    });

    return {
      productId: product._id,
      productName: product.name || "-",
      rackNo: product.rackNo || "",
      description: product.description || "",
      categoryId: product.categoryId?._id || null,
      category: product.categoryId?.name || "-",
      unit: product.unit || "",

      unitCost: roundAmount(unitCost),
      salePrice: roundAmount(product.salePrice),

      currentStock: roundAmount(currentStock),

      grossSoldQty: roundAmount(grossSoldQty),

      refundQty: roundAmount(refundQty),

      netSoldQty: roundAmount(netSoldQty),

      grossSales: roundAmount(grossSales),

      refundAmount: roundAmount(refundAmount),

      netSales: roundAmount(netSales),

      grossCost: roundAmount(grossCost),

      refundCost: roundAmount(refundCost),

      netCost: roundAmount(netCost),

      netProfit: roundAmount(netProfit),

      profitMargin: roundAmount(profitMargin),

      invoiceCount: toSafeNumber(sales.invoiceCount, 0),

      refundInvoiceCount: toSafeNumber(refunds.refundInvoiceCount, 0),

      lifetimeSoldQty: roundAmount(lifetimeSales.lifetimeSoldQty),

      firstSaleDate: lifetimeSales.firstSaleDate || null,

      lastSaleDate,

      lastRefundDate: refunds.lastRefundDate || null,

      lastPurchaseDate: stock.lastPurchaseDate || null,

      lastPurchaseRate: roundAmount(stock.lastPurchaseRate),

      lastStockMovementDate: stock.lastStockMovementDate || null,

      daysSinceLastSale,

      blockedStockValue: roundAmount(blockedStockValue),

      status,

      performanceScore: 0,
      performanceLabel: "weak",

      createdAt: product.createdAt,
    };
  });

  const maximumNetProfit = Math.max(
    ...rows.map((row) => Math.max(row.netProfit, 0)),
    0,
  );

  const maximumNetSales = Math.max(
    ...rows.map((row) => Math.max(row.netSales, 0)),
    0,
  );

  const maximumNetSoldQty = Math.max(
    ...rows.map((row) => Math.max(row.netSoldQty, 0)),
    0,
  );

  const maximumInvoiceCount = Math.max(
    ...rows.map((row) => Math.max(row.invoiceCount, 0)),
    0,
  );

  rows = rows.map((row) => {
    const performanceScore =
      row.netSales > 0 && row.netSoldQty > 0
        ? calculatePerformanceScore({
            netProfit: row.netProfit,
            netSales: row.netSales,
            netSoldQty: row.netSoldQty,
            invoiceCount: row.invoiceCount,

            maximumNetProfit,
            maximumNetSales,
            maximumNetSoldQty,
            maximumInvoiceCount,
          })
        : 0;

    return {
      ...row,

      performanceScore,

      performanceLabel: getPerformanceScoreLabel(performanceScore),
    };
  });

  return rows;
};

// 🔎 GENERAL STOCK FILTERS

const applyGeneralFilters = (
  rows,
  {
    hideZeroStock = false,
    inStockOnly = false,
    includeNegativeStock = true,
  } = {},
) => {
  return rows.filter((row) => {
    if (hideZeroStock && row.currentStock === 0) {
      return false;
    }

    if (inStockOnly && row.currentStock <= 0) {
      return false;
    }

    if (!includeNegativeStock && row.currentStock < 0) {
      return false;
    }

    return true;
  });
};

// 📑 VIEW FILTERS

const applyViewFilter = (rows, view = PERFORMANCE_VIEWS.ALL) => {
  switch (view) {
    case PERFORMANCE_VIEWS.TOP_PERFORMING:
      return rows.filter((row) => row.netSales > 0 && row.netSoldQty > 0);

    case PERFORMANCE_VIEWS.BEST_SELLING:
      return rows.filter((row) => row.netSoldQty > 0);

    case PERFORMANCE_VIEWS.MOST_PROFITABLE:
      return rows.filter((row) => row.netProfit > 0);

    case PERFORMANCE_VIEWS.SLOW_MOVING:
      return rows.filter((row) =>
        [PRODUCT_STATUSES.SLOW_MOVING, PRODUCT_STATUSES.VERY_SLOW].includes(
          row.status,
        ),
      );

    case PERFORMANCE_VIEWS.DEAD_STOCK:
      return rows.filter((row) => row.status === PRODUCT_STATUSES.DEAD_STOCK);

    case PERFORMANCE_VIEWS.NEVER_SOLD:
      return rows.filter((row) => row.status === PRODUCT_STATUSES.NEVER_SOLD);

    case PERFORMANCE_VIEWS.NEGATIVE_STOCK:
      return rows.filter(
        (row) => row.status === PRODUCT_STATUSES.NEGATIVE_STOCK,
      );

    case PERFORMANCE_VIEWS.ALL:
    default:
      return rows;
  }
};

// ↕ SORTING

const sortRows = (
  rows,
  sortBy = PERFORMANCE_DEFAULTS.SORT_BY,
  sortOrder = PERFORMANCE_DEFAULTS.SORT_ORDER,
) => {
  const direction = sortOrder === "asc" ? 1 : -1;

  return [...rows].sort((first, second) => {
    const firstValue = first?.[sortBy];
    const secondValue = second?.[sortBy];

    if (firstValue === null || firstValue === undefined) {
      return 1;
    }

    if (secondValue === null || secondValue === undefined) {
      return -1;
    }

    if (
      firstValue instanceof Date ||
      secondValue instanceof Date ||
      String(sortBy).toLowerCase().includes("date")
    ) {
      const firstDate = new Date(firstValue).getTime();

      const secondDate = new Date(secondValue).getTime();

      return (firstDate - secondDate) * direction;
    }

    if (typeof firstValue === "string" || typeof secondValue === "string") {
      return (
        String(firstValue).localeCompare(String(secondValue), undefined, {
          numeric: true,
          sensitivity: "base",
        }) * direction
      );
    }

    return (
      (toSafeNumber(firstValue, 0) - toSafeNumber(secondValue, 0)) * direction
    );
  });
};

//📊 SUMMARY

const buildSummary = (rows = []) => {
  const summary = rows.reduce(
    (accumulator, row) => {
      accumulator.totalProducts += 1;

      accumulator.totalNetSales += toSafeNumber(row.netSales, 0);
      accumulator.totalNetProfit += toSafeNumber(row.netProfit, 0);
      accumulator.totalNetSoldQty += toSafeNumber(row.netSoldQty, 0);

      if (row.netSales > 0 && row.netSoldQty > 0) {
        accumulator.topPerformingProducts += 1;
      }

      if (row.netSoldQty > 0) {
        accumulator.bestSellingProducts += 1;
      }

      if (row.netProfit > 0) {
        accumulator.mostProfitableProducts += 1;
      }

      if (row.status === PRODUCT_STATUSES.SLOW_MOVING) {
        accumulator.slowMovingProducts += 1;
      }

      if (row.status === PRODUCT_STATUSES.VERY_SLOW) {
        accumulator.verySlowProducts += 1;
      }

      if (row.status === PRODUCT_STATUSES.DEAD_STOCK) {
        accumulator.deadProducts += 1;
        accumulator.deadStockValue += toSafeNumber(row.blockedStockValue, 0);
      }

      if (row.status === PRODUCT_STATUSES.NEVER_SOLD) {
        accumulator.neverSoldProducts += 1;
        accumulator.neverSoldStockValue += toSafeNumber(
          row.blockedStockValue,
          0,
        );
      }

      if (row.status === PRODUCT_STATUSES.NEGATIVE_STOCK) {
        accumulator.negativeStockProducts += 1;
      }

      return accumulator;
    },
    {
      totalProducts: 0,
      totalNetSales: 0,
      totalNetProfit: 0,
      totalNetSoldQty: 0,

      topPerformingProducts: 0,
      bestSellingProducts: 0,
      mostProfitableProducts: 0,

      slowMovingProducts: 0,
      verySlowProducts: 0,

      deadProducts: 0,
      deadStockValue: 0,

      neverSoldProducts: 0,
      neverSoldStockValue: 0,

      negativeStockProducts: 0,
    },
  );

  const topProduct = [...rows]
    .filter((row) => row.netSales > 0 && row.netSoldQty > 0)
    .sort(
      (first, second) => second.performanceScore - first.performanceScore,
    )[0];

  return {
    totalProducts: summary.totalProducts,

    totalNetSales: roundAmount(summary.totalNetSales),
    totalNetProfit: roundAmount(summary.totalNetProfit),
    totalNetSoldQty: roundAmount(summary.totalNetSoldQty),

    topPerformingProducts: summary.topPerformingProducts,
    bestSellingProducts: summary.bestSellingProducts,
    mostProfitableProducts: summary.mostProfitableProducts,

    slowMovingProducts: summary.slowMovingProducts,
    verySlowProducts: summary.verySlowProducts,

    deadProducts: summary.deadProducts,
    deadStockValue: roundAmount(summary.deadStockValue),

    neverSoldProducts: summary.neverSoldProducts,
    neverSoldStockValue: roundAmount(summary.neverSoldStockValue),

    negativeStockProducts: summary.negativeStockProducts,

    topProduct: topProduct
      ? {
          productId: topProduct.productId,
          productName: topProduct.productName,
          performanceScore: topProduct.performanceScore,
          netSales: topProduct.netSales,
          netProfit: topProduct.netProfit,
          netSoldQty: topProduct.netSoldQty,
        }
      : null,
  };
};

// 📊 MAIN REPORT SERVICE

const getProductPerformanceReport = async ({ userId, filters = {} }) => {
  const userObjectId = toObjectId(userId, "userId");

  const {
    view = PERFORMANCE_DEFAULTS.VIEW,

    page = PERFORMANCE_DEFAULTS.PAGE,

    limit = PERFORMANCE_DEFAULTS.LIMIT,

    sortBy = PERFORMANCE_DEFAULTS.SORT_BY,

    sortOrder = PERFORMANCE_DEFAULTS.SORT_ORDER,

    deadAfterDays = PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,

    hideZeroStock = PERFORMANCE_DEFAULTS.HIDE_ZERO_STOCK,

    inStockOnly = PERFORMANCE_DEFAULTS.IN_STOCK_ONLY,

    includeNegativeStock = PERFORMANCE_DEFAULTS.INCLUDE_NEGATIVE_STOCK,

    search = "",

    categoryId = null,

    startDate = null,

    endDate = null,
  } = filters;

  const products = await getFilteredProducts({
    userId: userObjectId,
    search,
    categoryId,
  });

  const allRows = await buildPerformanceRows({
    userId: userObjectId,
    products,
    startDate,
    endDate,
    deadAfterDays,
  });

  const generallyFilteredRows = applyGeneralFilters(allRows, {
    hideZeroStock,
    inStockOnly,
    includeNegativeStock,
  });

  const summary = buildSummary(generallyFilteredRows);

  const viewRows = applyViewFilter(generallyFilteredRows, view);

  const sortedRows = sortRows(viewRows, sortBy, sortOrder);

  const safePage = Math.max(Number(page) || 1, 1);

  const safeLimit = Math.min(
    Math.max(Number(limit) || 25, 1),
    PERFORMANCE_DEFAULTS.MAX_LIMIT,
  );

  const totalRows = sortedRows.length;

  const totalPages = Math.max(Math.ceil(totalRows / safeLimit), 1);

  const normalizedPage = Math.min(safePage, totalPages);

  const skip = (normalizedPage - 1) * safeLimit;

  const paginatedRows = sortedRows.slice(skip, skip + safeLimit);

  return {
    success: true,

    filters: {
      view,
      search,
      categoryId,
      startDate,
      endDate,
      deadAfterDays,
      hideZeroStock,
      inStockOnly,
      includeNegativeStock,
      sortBy,
      sortOrder,
    },

    summary,

    rows: paginatedRows,

    pagination: {
      page: normalizedPage,
      limit: safeLimit,
      totalRows,
      totalPages,
      hasPreviousPage: normalizedPage > 1,
      hasNextPage: normalizedPage < totalPages,
    },

    generatedAt: new Date(),
  };
};

//🔍 SINGLE PRODUCT DETAILS

const getProductPerformanceDetails = async ({ userId, productId }) => {
  const userObjectId = toObjectId(userId, "userId");

  const productObjectId = toObjectId(productId, "productId");

  const products = await getFilteredProducts({
    userId: userObjectId,
    productId: productObjectId,
  });

  if (!products.length) {
    return null;
  }

  const rows = await buildPerformanceRows({
    userId: userObjectId,
    products,
    startDate: null,
    endDate: null,
    deadAfterDays: PERFORMANCE_DEFAULTS.DEAD_AFTER_DAYS,
  });

  const performance = rows[0];

  const [recentSales, recentRefunds, recentStockMovements] = await Promise.all([
    Invoice.find({
      createdBy: userObjectId,
      isDeleted: { $ne: true },
      isOpening: { $ne: true },
      "items.productId": productObjectId,
    })
      .select(
        [
          "billNo",
          "invoiceDate",
          "customerName",
          "items",
          "discountAmount",
          "totalAmount",
        ].join(" "),
      )
      .sort({
        invoiceDate: -1,
        _id: -1,
      })
      .limit(10)
      .lean(),

    RefundInvoice.find({
      createdBy: userObjectId,
      isDeleted: { $ne: true },
      isOpening: { $ne: true },
      "items.productId": productObjectId,
    })
      .select(
        [
          "billNo",
          "invoiceDate",
          "customerName",
          "items",
          "totalAmount",
          "originalInvoiceId",
        ].join(" "),
      )
      .sort({
        invoiceDate: -1,
        _id: -1,
      })
      .limit(10)
      .lean(),

    InventoryTransaction.find({
      userId: userObjectId,
      productId: productObjectId,
    })
      .select(
        [
          "type",
          "quantity",
          "rate",
          "date",
          "note",
          "invoiceId",
          "invoiceModel",
          "adjustNo",
        ].join(" "),
      )
      .sort({
        date: -1,
        _id: -1,
      })
      .limit(20)
      .lean(),
  ]);

  const formattedSales = recentSales.map((invoice) => {
    const item = invoice.items.find(
      (invoiceItem) =>
        invoiceItem.productId?.toString() === productObjectId.toString(),
    );

    return {
      invoiceId: invoice._id,
      billNo: invoice.billNo,
      invoiceDate: invoice.invoiceDate,
      customerName: invoice.customerName,

      quantity: toSafeNumber(item?.quantity, 0),

      price: roundAmount(item?.price),

      total: roundAmount(item?.total),

      costPrice: roundAmount(item?.costPrice),

      profit: roundAmount(item?.profit),

      margin: roundAmount(item?.margin),
    };
  });

  const formattedRefunds = recentRefunds.map((refund) => {
    const item = refund.items.find(
      (refundItem) =>
        refundItem.productId?.toString() === productObjectId.toString(),
    );

    return {
      refundId: refund._id,
      billNo: refund.billNo,
      invoiceDate: refund.invoiceDate,
      customerName: refund.customerName,
      originalInvoiceId: refund.originalInvoiceId,

      quantity: toSafeNumber(item?.quantity, 0),

      price: roundAmount(item?.price),

      total: roundAmount(item?.total),
    };
  });

  return {
    success: true,

    product: {
      productId: performance.productId,

      productName: performance.productName,

      category: performance.category,

      categoryId: performance.categoryId,

      rackNo: performance.rackNo,

      description: performance.description,

      unit: performance.unit,

      unitCost: performance.unitCost,

      salePrice: performance.salePrice,
    },

    performance,

    recentSales: formattedSales,

    recentRefunds: formattedRefunds,

    recentStockMovements,

    generatedAt: new Date(),
  };
};

module.exports = {
  getProductPerformanceReport,
  getProductPerformanceDetails,
};
