const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");

exports.getSalesHistoryByCustomerProduct = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId, productId } = req.query;

    if (
      !userId ||
      !mongoose.Types.ObjectId.isValid(customerId) ||
      !mongoose.Types.ObjectId.isValid(productId)
    ) {
      return res.status(400).json({
        message: "Valid customerId and productId are required",
      });
    }

    const ownerId = new mongoose.Types.ObjectId(userId);
    const selectedCustomerOrPartyId = new mongoose.Types.ObjectId(customerId);
    const selectedProductId = new mongoose.Types.ObjectId(productId);

    const history = await Invoice.aggregate([
      {
        $match: {
          createdBy: ownerId,
          isDeleted: false,
          "items.productId": selectedProductId,
          $or: [
            { customerId: selectedCustomerOrPartyId },
            { partyId: selectedCustomerOrPartyId },
          ],
        },
      },
      {
        $unwind: "$items",
      },
      {
        $match: {
          "items.productId": selectedProductId,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $limit: 4,
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

    return res.json(history);
  } catch (error) {
    console.error("Sales history error:", error);

    return res.status(500).json({
      message: "Failed to fetch sales history",
      error: error.message,
    });
  }
};
