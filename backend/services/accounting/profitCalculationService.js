const mongoose = require("mongoose");

const Invoice = require("../../models/Invoice");
const RefundInvoice = require("../../models/RefundInvoice");

/**
 * Number کو محفوظ طریقے سے دو Decimal تک Round کرتا ہے۔
 */
const roundAmount = (value) => {
  const number = Number(value || 0);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Number(number.toFixed(2));
};

const buildProductPipeline = ({
  userId,
  invoiceDateFilter = {},
  productId,
  categoryId,
}) => {
  const validProductId =
    productId && mongoose.Types.ObjectId.isValid(productId)
      ? new mongoose.Types.ObjectId(productId)
      : null;

  const validCategoryId =
    categoryId && mongoose.Types.ObjectId.isValid(categoryId)
      ? new mongoose.Types.ObjectId(categoryId)
      : null;

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

const calculateProfitMetrics = async ({
  userId,
  invoiceDateFilter = {},
  productId,
  categoryId,
}) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Valid userId is required");
  }

  const objectUserId = new mongoose.Types.ObjectId(userId);

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

  const productMap = new Map();

  /**
   * Sales کو Product Map میں شامل کریں۔
   */
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

      // پرانے Frontend کے ساتھ Compatibility
      sales: roundAmount(item.grossSales),
      cost: roundAmount(netCogs),
      profit: roundAmount(grossProfit),

      margin,
    };
  });

  products.sort((first, second) => second.grossProfit - first.grossProfit);

  /**
   * تمام Products کے Totals۔
   */
  const totals = products.reduce(
    (result, product) => {
      result.soldQty += product.soldQty;
      result.refundQty += product.refundQty;
      result.netQty += product.netQty;

      result.grossSales += product.grossSales;
      result.refundAmount += product.refundAmount;
      result.netSales += product.netSales;

      result.saleCost += product.saleCost;
      result.refundCost += product.refundCost;
      result.netCogs += product.netCogs;

      result.grossProfit += product.grossProfit;

      return result;
    },
    {
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
    },
  );

  Object.keys(totals).forEach((key) => {
    totals[key] = roundAmount(totals[key]);
  });

  totals.margin =
    totals.netSales !== 0
      ? roundAmount((totals.grossProfit / totals.netSales) * 100)
      : 0;

  return {
    products,
    totals,
  };
};

module.exports = {
  calculateProfitMetrics,
};
