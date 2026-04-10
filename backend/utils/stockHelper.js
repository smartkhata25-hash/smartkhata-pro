const InventoryTransaction = require("../models/InventoryTransaction");
const mongoose = require("mongoose");

/* =========================================================
   1️⃣ GET SINGLE PRODUCT LIVE STOCK
========================================================= */
exports.getProductStock = async (productId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error("Invalid productId");
  }

  const summary = await InventoryTransaction.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
      },
    },
    {
      $group: {
        _id: null,
        totalIn: {
          $sum: {
            $cond: [{ $in: ["$type", ["IN", "ADJUST_IN"]] }, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [{ $in: ["$type", ["OUT", "ADJUST_OUT"]] }, "$quantity", 0],
          },
        },
      },
    },
  ]);

  const { totalIn = 0, totalOut = 0 } = summary[0] || {};

  return totalIn - totalOut;
};

/* =========================================================
   2️⃣ GET MULTIPLE PRODUCTS STOCK (Optimized for list page)
========================================================= */
exports.getMultipleProductsStock = async (productIds = []) => {
  const objectIds = productIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  const summary = await InventoryTransaction.aggregate([
    {
      $match: {
        productId: { $in: objectIds },
      },
    },
    {
      $group: {
        _id: "$productId",
        totalIn: {
          $sum: {
            $cond: [{ $in: ["$type", ["IN", "ADJUST_IN"]] }, "$quantity", 0],
          },
        },
        totalOut: {
          $sum: {
            $cond: [{ $in: ["$type", ["OUT", "ADJUST_OUT"]] }, "$quantity", 0],
          },
        },
      },
    },
  ]);

  const stockMap = {};

  summary.forEach((item) => {
    stockMap[item._id.toString()] = (item.totalIn || 0) - (item.totalOut || 0);
  });

  return stockMap;
};

/* =========================================================
   3️⃣ CREATE INVENTORY ENTRY (SAFE WRAPPER)
========================================================= */
exports.createInventoryEntry = async ({
  productId,
  type,
  quantity,
  note = "",
  invoiceId = null,
  invoiceModel = null,
  userId,
  rate = 0,
}) => {
  if (!productId || !type || !quantity || !userId) {
    throw new Error("Missing required inventory fields");
  }

  return await InventoryTransaction.create({
    productId,
    type,
    quantity,
    note,
    invoiceId,
    invoiceModel,
    userId,
    rate,
  });
};

/* =========================================================
   4️⃣ DELETE TRANSACTIONS BY REFERENCE (SAFE ROLLBACK)
========================================================= */
exports.deleteTransactionsByReference = async ({
  referenceId,
  invoiceModel,
  userId,
}) => {
  if (!referenceId || !invoiceModel) return;

  await InventoryTransaction.deleteMany({
    invoiceId: referenceId,
    invoiceModel,
    userId,
  });
};
