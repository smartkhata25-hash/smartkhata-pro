const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");

exports.getSalesHistoryByCustomerProduct = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId, productId } = req.query;

    if (!customerId || !productId) {
      return res.status(400).json({
        message: "customerId and productId are required",
      });
    }

    const history = await Invoice.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          customerId: new mongoose.Types.ObjectId(customerId),
          isDeleted: false,
        },
      },
      { $unwind: "$items" },
      {
        $match: {
          "items.productId": new mongoose.Types.ObjectId(productId),
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $limit: 4, // ✅ last 1 + last 3
      },
      {
        $project: {
          _id: 1,
          billNo: 1,
          rate: "$items.price",
          quantity: "$items.quantity",
          invoiceDate: 1,
          invoiceTime: 1,
          createdAt: 1,
        },
      },
    ]);

    res.json(history);
  } catch (error) {
    console.error("Sales history error:", error);
    res.status(500).json({
      message: "Failed to fetch sales history",
      error,
    });
  }
};
