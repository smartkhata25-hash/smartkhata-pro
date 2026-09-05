const InventoryTransaction = require("../models/InventoryTransaction");
const mongoose = require("mongoose");

// 1️⃣ GET SINGLE PRODUCT LIVE STOCK
exports.getProductStock = async (productId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    throw new Error("Invalid productId");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  const summary = await InventoryTransaction.aggregate([
    {
      $match: {
        productId: new mongoose.Types.ObjectId(productId),
        userId: new mongoose.Types.ObjectId(userId),
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

  return Number(totalIn || 0) - Number(totalOut || 0);
};

// 2️⃣ GET MULTIPLE PRODUCTS STOCK
exports.getMultipleProductsStock = async (productIds = [], userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid userId");
  }

  const objectIds = productIds
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (objectIds.length === 0) {
    return {};
  }

  const summary = await InventoryTransaction.aggregate([
    {
      $match: {
        productId: { $in: objectIds },
        userId: new mongoose.Types.ObjectId(userId),
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
    stockMap[item._id.toString()] =
      Number(item.totalIn || 0) - Number(item.totalOut || 0);
  });

  return stockMap;
};

// 3️⃣ CREATE INVENTORY ENTRY
exports.createInventoryEntry = async ({
  productId,
  type,
  quantity,
  note = "",
  invoiceId = null,
  invoiceModel = null,
  userId,
  rate = 0,
  date = null,

  // ✅ Optional MongoDB transaction session
  session = null,
}) => {
  const numericQuantity = Number(quantity);
  const numericRate = Number(rate || 0);

  if (!productId || !type || !userId) {
    throw new Error("Missing required inventory fields");
  }

  if (
    !mongoose.Types.ObjectId.isValid(productId) ||
    !mongoose.Types.ObjectId.isValid(userId)
  ) {
    throw new Error("Invalid inventory product or user");
  }

  if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
    throw new Error("Invalid inventory quantity");
  }

  if (!Number.isFinite(numericRate) || numericRate < 0) {
    throw new Error("Invalid inventory rate");
  }

  const transactionData = {
    productId,
    type,
    quantity: numericQuantity,
    note,
    invoiceId,
    invoiceModel,
    userId,
    rate: numericRate,
  };

  if (date) {
    transactionData.date = date;
  }

  if (session) {
    const created = await InventoryTransaction.create([transactionData], {
      session,
    });

    return created[0];
  }

  return await InventoryTransaction.create(transactionData);
};

// 4️⃣ DELETE TRANSACTIONS BY REFERENCE
exports.deleteTransactionsByReference = async ({
  referenceId,
  invoiceModel,
  userId,

  // ✅ Optional MongoDB transaction session
  session = null,
}) => {
  if (!referenceId || !invoiceModel || !userId) {
    return;
  }

  const filter = {
    invoiceId: referenceId,
    invoiceModel,
    userId,
  };

  if (session) {
    await InventoryTransaction.deleteMany(filter, { session });

    return;
  }

  await InventoryTransaction.deleteMany(filter);
};
