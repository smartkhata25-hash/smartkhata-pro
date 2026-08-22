const mongoose = require("mongoose");

const Invoice = require("../../models/Invoice");
const RefundInvoice = require("../../models/RefundInvoice");

const roundAmount = (value) => {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(2));
};

const createEmptyTotals = () => ({
  soldQty: 0,
  refundQty: 0,
  netQty: 0,

  grossSales: 0,
  refundAmount: 0,
  netSales: 0,

  saleCost: 0,
  refundCost: 0,
  netCogs: 0,

  grossProfit: 0,

  margin: 0,
});

const getValidFilterIds = ({ productId, categoryId }) => {
  const validProductId =
    productId && mongoose.Types.ObjectId.isValid(productId)
      ? new mongoose.Types.ObjectId(productId)
      : null;

  const validCategoryId =
    categoryId && mongoose.Types.ObjectId.isValid(categoryId)
      ? new mongoose.Types.ObjectId(categoryId)
      : null;

  return {
    validProductId,
    validCategoryId,
  };
};

const buildProductPipeline = ({
  userId,
  invoiceDateFilter = {},
  productId,
  categoryId,
}) => {
  const { validProductId, validCategoryId } = getValidFilterIds({
    productId,
    categoryId,
  });

  return [
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
      $group: {
        _id: "$items.productId",

        productName: {
          $first: {
            $ifNull: ["$productInfo.name", "Unknown Product"],
          },
        },

        quantity: {
          $sum: {
            $ifNull: ["$items.quantity", 0],
          },
        },

        amount: {
          $sum: {
            $ifNull: ["$items.total", 0],
          },
        },

        cost: {
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
      },
    },
  ];
};

const buildTotalsPipeline = ({
  userId,
  invoiceDateFilter = {},
  productId,
  categoryId,
}) => {
  const { validProductId, validCategoryId } = getValidFilterIds({
    productId,
    categoryId,
  });

  const pipeline = [
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
  ];

  if (validCategoryId) {
    pipeline.push(
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
          preserveNullAndEmptyArrays: false,
        },
      },

      {
        $match: {
          "productInfo.categoryId": validCategoryId,
        },
      },
    );
  }

  pipeline.push({
    $group: {
      _id: null,

      quantity: {
        $sum: {
          $ifNull: ["$items.quantity", 0],
        },
      },

      amount: {
        $sum: {
          $ifNull: ["$items.total", 0],
        },
      },

      cost: {
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
    },
  });

  return pipeline;
};

const buildProductMetrics = (salesData = [], refundData = []) => {
  const productMap = new Map();

  salesData.forEach((sale) => {
    const productKey = sale._id?.toString() || "unknown";

    productMap.set(productKey, {
      productId: sale._id || null,

      productName: sale.productName || "Unknown Product",

      soldQty: Number(sale.quantity || 0),

      refundQty: 0,

      grossSales: Number(sale.amount || 0),

      refundAmount: 0,

      saleCost: Number(sale.cost || 0),

      refundCost: 0,
    });
  });

  refundData.forEach((refund) => {
    const productKey = refund._id?.toString() || "unknown";

    const existingProduct = productMap.get(productKey);

    if (existingProduct) {
      existingProduct.refundQty += Number(refund.quantity || 0);

      existingProduct.refundAmount += Number(refund.amount || 0);

      existingProduct.refundCost += Number(refund.cost || 0);

      return;
    }

    productMap.set(productKey, {
      productId: refund._id || null,

      productName: refund.productName || "Unknown Product",

      soldQty: 0,

      refundQty: Number(refund.quantity || 0),

      grossSales: 0,

      refundAmount: Number(refund.amount || 0),

      saleCost: 0,

      refundCost: Number(refund.cost || 0),
    });
  });

  const products = Array.from(productMap.values()).map((item) => {
    const netQty = item.soldQty - item.refundQty;

    const netSales = item.grossSales - item.refundAmount;

    const netCogs = item.saleCost - item.refundCost;

    const grossProfit = netSales - netCogs;

    const margin =
      netSales !== 0 ? roundAmount((grossProfit / netSales) * 100) : 0;

    return {
      productId: item.productId,

      productName: item.productName,

      soldQty: roundAmount(item.soldQty),

      refundQty: roundAmount(item.refundQty),

      netQty: roundAmount(netQty),

      grossSales: roundAmount(item.grossSales),

      refundAmount: roundAmount(item.refundAmount),

      netSales: roundAmount(netSales),

      saleCost: roundAmount(item.saleCost),

      refundCost: roundAmount(item.refundCost),

      netCogs: roundAmount(netCogs),

      grossProfit: roundAmount(grossProfit),

      sales: roundAmount(item.grossSales),

      cost: roundAmount(netCogs),

      profit: roundAmount(grossProfit),

      margin,
    };
  });

  products.sort((first, second) => second.grossProfit - first.grossProfit);

  return products;
};

const calculateTotalsFromProducts = (products = []) => {
  const totals = products.reduce(
    (result, product) => {
      result.soldQty += Number(product.soldQty || 0);

      result.refundQty += Number(product.refundQty || 0);

      result.netQty += Number(product.netQty || 0);

      result.grossSales += Number(product.grossSales || 0);

      result.refundAmount += Number(product.refundAmount || 0);

      result.netSales += Number(product.netSales || 0);

      result.saleCost += Number(product.saleCost || 0);

      result.refundCost += Number(product.refundCost || 0);

      result.netCogs += Number(product.netCogs || 0);

      result.grossProfit += Number(product.grossProfit || 0);

      return result;
    },

    createEmptyTotals(),
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundAmount(totals[key]);
  });

  totals.margin =
    totals.netSales !== 0
      ? roundAmount((totals.grossProfit / totals.netSales) * 100)
      : 0;

  return totals;
};

const calculateTotalsFromSummary = (salesSummary = {}, refundSummary = {}) => {
  const soldQty = Number(salesSummary.quantity || 0);

  const refundQty = Number(refundSummary.quantity || 0);

  const grossSales = Number(salesSummary.amount || 0);

  const refundAmount = Number(refundSummary.amount || 0);

  const saleCost = Number(salesSummary.cost || 0);

  const refundCost = Number(refundSummary.cost || 0);

  const netQty = soldQty - refundQty;

  const netSales = grossSales - refundAmount;

  const netCogs = saleCost - refundCost;

  const grossProfit = netSales - netCogs;

  const totals = {
    soldQty: roundAmount(soldQty),

    refundQty: roundAmount(refundQty),

    netQty: roundAmount(netQty),

    grossSales: roundAmount(grossSales),

    refundAmount: roundAmount(refundAmount),

    netSales: roundAmount(netSales),

    saleCost: roundAmount(saleCost),

    refundCost: roundAmount(refundCost),

    netCogs: roundAmount(netCogs),

    grossProfit: roundAmount(grossProfit),

    margin: 0,
  };

  totals.margin =
    totals.netSales !== 0
      ? roundAmount((totals.grossProfit / totals.netSales) * 100)
      : 0;

  return totals;
};

const calculateProfitMetrics = async ({
  userId,
  invoiceDateFilter = {},
  productId,
  categoryId,
  includeProducts = true,
}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Valid userId is required");
  }

  const objectUserId = new mongoose.Types.ObjectId(userId);

  if (includeProducts) {
    const salesPipeline = buildProductPipeline({
      userId: objectUserId,
      invoiceDateFilter,
      productId,
      categoryId,
    });

    const refundPipeline = buildProductPipeline({
      userId: objectUserId,
      invoiceDateFilter,
      productId,
      categoryId,
    });

    const [salesData, refundData] = await Promise.all([
      Invoice.aggregate(salesPipeline),

      RefundInvoice.aggregate(refundPipeline),
    ]);

    const products = buildProductMetrics(salesData, refundData);

    const totals = calculateTotalsFromProducts(products);

    return {
      products,
      totals,
    };
  }

  const salesTotalsPipeline = buildTotalsPipeline({
    userId: objectUserId,
    invoiceDateFilter,
    productId,
    categoryId,
  });

  const refundTotalsPipeline = buildTotalsPipeline({
    userId: objectUserId,
    invoiceDateFilter,
    productId,
    categoryId,
  });

  const [salesSummaryData, refundSummaryData] = await Promise.all([
    Invoice.aggregate(salesTotalsPipeline),

    RefundInvoice.aggregate(refundTotalsPipeline),
  ]);

  const salesSummary = salesSummaryData?.[0] || {};

  const refundSummary = refundSummaryData?.[0] || {};

  const totals = calculateTotalsFromSummary(salesSummary, refundSummary);

  return {
    products: [],
    totals,
  };
};

module.exports = {
  calculateProfitMetrics,
};
