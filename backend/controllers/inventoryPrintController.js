const mongoose = require("mongoose");
const Product = require("../models/Product");
const Category = require("../models/Category");
const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const RefundInvoice = require("../models/RefundInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const InventoryTransaction = require("../models/InventoryTransaction");
const {
  buildBusinessDateRange,
  startOfBusinessDay,
} = require("../utils/businessDate");
const { generatePdfFromHtml } = require("../services/pdfService");
const {
  buildInventoryReportPrintData,
  buildProductLedgerPrintData,
} = require("../services/inventoryPrintBuilder");
const generateInventoryReportHTML = require("../templates/inventoryReportTemplate");
const generateProductLedgerHTML = require("../templates/productLedgerTemplate");

const escapeRegex = (value) =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeFileName = (value, fallback) =>
  String(value || fallback || "Document")
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const canViewProductCost = (req) => {
  if (req.user?.accountRole === "owner") return true;

  return Array.isArray(req.user?.permissions)
    ? req.user.permissions.includes("products.view_cost")
    : false;
};

const getUserObjectId = (req) => {
  const rawUserId = req.user?.id || req.userId;

  if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
    return null;
  }

  return new mongoose.Types.ObjectId(rawUserId);
};

const getFilteredProductsForPrint = async (req) => {
  const userId = getUserObjectId(req);

  if (!userId) {
    const error = new Error("Invalid user");
    error.status = 401;
    throw error;
  }

  const {
    search = "",
    categoryId = "",
    stockFilter = "",
  } = req.query;

  const query = {
    userId,
  };
  const normalizedStockFilter = String(stockFilter || "").trim().toLowerCase();

  if (String(search).trim()) {
    query.name = {
      $regex: escapeRegex(search),
      $options: "i",
    };
  }

  if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
    query.categoryId = new mongoose.Types.ObjectId(categoryId);
  }

  const pipeline = [
    { $match: query },
    {
      $lookup: {
        from: InventoryTransaction.collection.name,
        let: {
          productId: "$_id",
          ownerId: "$userId",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$productId", "$$productId"] },
                  { $eq: ["$userId", "$$ownerId"] },
                ],
              },
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
                        case: { $eq: ["$type", "IN"] },
                        then: "$quantity",
                      },
                      {
                        case: { $eq: ["$type", "OUT"] },
                        then: { $multiply: ["$quantity", -1] },
                      },
                      {
                        case: { $eq: ["$type", "ADJUST_IN"] },
                        then: "$quantity",
                      },
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
        ],
        as: "stockRows",
      },
    },
    {
      $addFields: {
        stock: {
          $ifNull: [{ $arrayElemAt: ["$stockRows.stock", 0] }, 0],
        },
      },
    },
    {
      $addFields: {
        isLowStock: {
          $lte: ["$stock", { $ifNull: ["$lowStockThreshold", 0] }],
        },
        isZeroStock: { $eq: ["$stock", 0] },
      },
    },
  ];

  if (normalizedStockFilter === "low") {
    pipeline.push({ $match: { isLowStock: true } });
  }

  if (normalizedStockFilter === "zero") {
    pipeline.push({ $match: { isZeroStock: true } });
  }

  pipeline.push(
    {
      $lookup: {
        from: Category.collection.name,
        localField: "categoryId",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $project: {
        name: 1,
        rackNo: 1,
        description: 1,
        unit: 1,
        unitCost: 1,
        salePrice: 1,
        lowStockThreshold: 1,
        stock: 1,
        isLowStock: 1,
        isZeroStock: 1,
        createdAt: 1,
        categoryId: {
          _id: "$category._id",
          name: "$category.name",
        },
      },
    },
    { $sort: { createdAt: -1, _id: -1 } },
  );

  const products = await Product.aggregate(pipeline).allowDiskUse(true);

  const selectedCategory =
    categoryId && mongoose.Types.ObjectId.isValid(categoryId)
      ? await Category.findOne({
          _id: new mongoose.Types.ObjectId(categoryId),
          userId,
        })
          .select("name")
          .lean()
      : null;

  return buildInventoryReportPrintData({
    products,
    filters: {
      search,
      categoryName: selectedCategory?.name || "",
      stockFilter: normalizedStockFilter,
    },
    showCost: canViewProductCost(req),
    lang: req.query.lang || "en",
  });
};

const getProductLedgerForPrint = async (req) => {
  const userId = getUserObjectId(req);
  const { productId } = req.params;
  const { startDate, endDate } = req.query;

  if (!userId) {
    const error = new Error("Invalid user");
    error.status = 401;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    const error = new Error("Invalid product");
    error.status = 400;
    throw error;
  }

  const productObjectId = new mongoose.Types.ObjectId(productId);
  const product = await Product.findOne({
    _id: productObjectId,
    userId,
  }).lean();

  if (!product) {
    const error = new Error("Product not found");
    error.status = 404;
    throw error;
  }

  const dateFilter =
    buildBusinessDateRange({
      startDate,
      endDate,
    }).date || {};
  const hasDateFilter = Object.keys(dateFilter).length > 0;

  const previousTransactions = startDate
    ? await InventoryTransaction.find({
        productId: productObjectId,
        userId,
        date: { $lt: startOfBusinessDay(startDate) },
      }).lean()
    : await InventoryTransaction.find({
        productId: productObjectId,
        userId,
        note: "Opening Stock",
      }).lean();

  let openingStock = 0;

  previousTransactions.forEach((transaction) => {
    if (transaction.type === "IN" || transaction.type === "ADJUST_IN") {
      openingStock += Number(transaction.quantity || 0);
    } else if (
      transaction.type === "OUT" ||
      transaction.type === "ADJUST_OUT"
    ) {
      openingStock -= Number(transaction.quantity || 0);
    }
  });

  const purchases = await InventoryTransaction.find({
    productId: productObjectId,
    type: "IN",
    invoiceModel: "PurchaseInvoice",
    userId,
    ...(hasDateFilter ? { date: dateFilter } : {}),
  })
    .populate({
      path: "invoiceId",
      model: "PurchaseInvoice",
      select: "supplierName billNo invoiceDate",
    })
    .sort({ date: 1 })
    .lean();

  const refunds = await InventoryTransaction.find({
    productId: productObjectId,
    type: "IN",
    invoiceModel: "RefundInvoice",
    userId,
    ...(hasDateFilter ? { date: dateFilter } : {}),
  })
    .populate({
      path: "invoiceId",
      model: "RefundInvoice",
      select: "customerName billNo invoiceDate",
    })
    .sort({ date: 1 })
    .lean();

  const purchaseReturns = await InventoryTransaction.find({
    productId: productObjectId,
    type: "OUT",
    invoiceModel: "PurchaseReturn",
    userId,
    ...(hasDateFilter ? { date: dateFilter } : {}),
  })
    .populate({
      path: "invoiceId",
      model: "PurchaseReturn",
      select: "supplierName billNo returnDate",
    })
    .sort({ date: 1 })
    .lean();

  const salesInvoices = await Invoice.find({
    "items.productId": productObjectId,
    createdBy: userId,
    ...(hasDateFilter ? { invoiceDate: dateFilter } : {}),
  })
    .sort({ invoiceDate: 1 })
    .lean();

  const adjustments = await InventoryTransaction.find({
    productId: productObjectId,
    userId,
    type: { $in: ["ADJUST_IN", "ADJUST_OUT"] },
    ...(hasDateFilter ? { date: dateFilter } : {}),
  })
    .sort({ date: 1 })
    .lean();

  const rows = [
    ...purchases.map((entry) => ({
      date: entry.date,
      billNo: entry.invoiceId?.billNo || "",
      party: entry.invoiceId?.supplierName || "Unknown",
      quantity: Number(entry.quantity || 0),
      signedQuantity: Number(entry.quantity || 0),
      typeKey: "purchase",
    })),
    ...refunds.map((entry) => ({
      date: entry.date,
      billNo: entry.invoiceId?.billNo || "",
      party: entry.invoiceId?.customerName || "Unknown",
      quantity: Number(entry.quantity || 0),
      signedQuantity: Number(entry.quantity || 0),
      typeKey: "refund",
    })),
    ...purchaseReturns.map((entry) => ({
      date: entry.date,
      billNo: entry.invoiceId?.billNo || "",
      party: entry.invoiceId?.supplierName || "Unknown",
      quantity: Number(entry.quantity || 0),
      signedQuantity: -Number(entry.quantity || 0),
      typeKey: "purchase_return",
    })),
    ...salesInvoices.flatMap((invoice) =>
      (invoice.items || [])
        .filter((item) => String(item.productId) === String(productObjectId))
        .map((item) => ({
          date: invoice.invoiceDate,
          billNo: invoice.billNo || "",
          party: invoice.customerName || "Unknown",
          quantity: Number(item.quantity || 0),
          signedQuantity: -Number(item.quantity || 0),
          typeKey: "sale",
        })),
    ),
    ...adjustments.map((entry) => {
      const isIn = entry.type === "ADJUST_IN";

      return {
        date: entry.date,
        billNo: entry.adjustNo || "",
        party: "Stock Adjust",
        quantity: Number(entry.quantity || 0),
        signedQuantity: isIn
          ? Number(entry.quantity || 0)
          : -Number(entry.quantity || 0),
        typeKey: "adjust",
      };
    }),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  let runningBalance = openingStock;

  const rowsWithBalance = rows.map((row) => {
    runningBalance += Number(row.signedQuantity || 0);

    return {
      ...row,
      balance: runningBalance,
    };
  });

  return buildProductLedgerPrintData({
    product,
    openingStock,
    rows: rowsWithBalance,
    filters: {
      startDate,
      endDate,
      type: req.query.type || "all",
      partySearch: req.query.partySearch || "",
    },
    lang: req.query.lang || "en",
  });
};

const sendHtml = (res, html) => {
  res.set({
    "Content-Type": "text/html; charset=utf-8",
  });

  return res.send(html);
};

const sendPdf = async (res, html, fileName) => {
  const pdfBuffer = await generatePdfFromHtml(html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=${fileName}`,
    "Content-Length": pdfBuffer.length,
  });

  return res.send(pdfBuffer);
};

const getInventoryReportHtml = async (req, res) => {
  try {
    const data = await getFilteredProductsForPrint(req);
    const html = generateInventoryReportHTML(data);

    return sendHtml(res, html);
  } catch (error) {
    console.error("Inventory report print error:", error);
    return res
      .status(error.status || 500)
      .send(error.message || "Failed to generate inventory report");
  }
};

const generateInventoryReportPdf = async (req, res) => {
  try {
    const data = await getFilteredProductsForPrint(req);
    const html = generateInventoryReportHTML(data);

    return sendPdf(res, html, "Inventory-Report.pdf");
  } catch (error) {
    console.error("Inventory report PDF error:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to generate inventory report PDF",
    });
  }
};

const getProductLedgerHtml = async (req, res) => {
  try {
    const data = await getProductLedgerForPrint(req);
    const html = generateProductLedgerHTML(data);

    return sendHtml(res, html);
  } catch (error) {
    console.error("Product ledger print error:", error);
    return res
      .status(error.status || 500)
      .send(error.message || "Failed to generate product ledger");
  }
};

const generateProductLedgerPdf = async (req, res) => {
  try {
    const data = await getProductLedgerForPrint(req);
    const html = generateProductLedgerHTML(data);
    const fileName = `${safeFileName(data.product?.name, "Product")}-Ledger.pdf`;

    return sendPdf(res, html, fileName);
  } catch (error) {
    console.error("Product ledger PDF error:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Failed to generate product ledger PDF",
    });
  }
};

module.exports = {
  getInventoryReportHtml,
  generateInventoryReportPdf,
  getProductLedgerHtml,
  generateProductLedgerPdf,
};
