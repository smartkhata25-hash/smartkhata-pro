const mongoose = require("mongoose");
const Product = require("../models/Product");
const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/purchaseInvoice");
const InventoryTransaction = require("../models/InventoryTransaction");
const RefundInvoice = require("../models/RefundInvoice");

exports.getProductLedger = async (req, res) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    // 🔹 Get Product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // 🔹 Opening Stock (Before startDate)
    let previousTransactions = [];

    if (startDate) {
      previousTransactions = await InventoryTransaction.find({
        productId,
        userId,
        date: { $lt: new Date(startDate) },
      });
    } else {
      previousTransactions = await InventoryTransaction.find({
        productId,
        userId,
        note: "Opening Stock",
      });
    }

    let opening = 0;
    previousTransactions.forEach((t) => {
      if (t.type === "IN" || t.type === "ADJUST_IN") {
        opening += t.quantity;
      } else if (t.type === "OUT" || t.type === "ADJUST_OUT") {
        opening -= t.quantity;
      }
    });

    const purchases = await InventoryTransaction.find({
      productId,
      type: "IN",
      invoiceModel: "PurchaseInvoice",
      userId,
      ...(startDate || endDate ? { date: dateFilter } : {}),
    })
      .populate({
        path: "invoiceId",
        model: "PurchaseInvoice",
        select: "supplierName billNo invoiceDate",
      })
      .sort({ date: 1 });

    const purchaseEntries = purchases.map((p) => {
      return {
        date: p.date,
        billNo: p.invoiceId?.billNo || "",
        supplierName: p.invoiceId?.supplierName || "Unknown",
        quantity: p.quantity,
        rate: p.rate || product.unitCost || 0,
        type: "purchase",

        invoiceId: p.invoiceId?._id?.toString() || "",
      };
    });

    // 🔹 Refunds (IN)
    const refunds = await InventoryTransaction.find({
      productId,
      type: "IN",
      invoiceModel: "RefundInvoice",
      userId,
      ...(startDate || endDate ? { date: dateFilter } : {}),
    })
      .populate({
        path: "invoiceId",
        model: "RefundInvoice",
        select: "customerName billNo invoiceDate",
      })
      .sort({ date: 1 });

    const refundEntries = refunds.map((r) => {
      return {
        date: r.date,
        billNo: r.invoiceId?.billNo || "",
        customerName: r.invoiceId?.customerName || "Unknown",
        quantity: r.quantity,
        rate: r.rate || product.unitCost || 0,
        type: "refund",

        invoiceId: r.invoiceId?._id?.toString() || "",
      };
    });

    const salesInvoices = await Invoice.find({
      "items.productId": new mongoose.Types.ObjectId(productId),
      createdBy: userId,
      ...(startDate || endDate ? { invoiceDate: dateFilter } : {}),
    }).sort({ invoiceDate: 1 });

    const saleEntries = [];

    const adjustments = await InventoryTransaction.find({
      productId,
      userId,
      type: { $in: ["ADJUST_IN", "ADJUST_OUT"] },
      ...(startDate || endDate ? { date: dateFilter } : {}),
    }).sort({ date: 1 });

    const adjustmentEntries = adjustments.map((a) => {
      return {
        date: a.date,
        billNo: a.adjustNo || "",
        quantity: a.quantity,
        adjustType: a.type,
        type: "adjust",
      };
    });

    salesInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (item.productId.toString() === productId) {
          saleEntries.push({
            date: inv.invoiceDate,
            billNo: inv.billNo || "",
            customerName: inv.customerName || "Unknown",
            quantity: item.quantity,
            rate: item.price || 0,
            total: item.total || 0,
            type: "sale",

            invoiceId: inv._id?.toString() || "",
          });
        }
      });
    });

    const fullLedger = [
      ...purchaseEntries,
      ...refundEntries,
      ...saleEntries,
      ...adjustmentEntries,
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = opening;

    fullLedger.forEach((entry) => {
      if (entry.type === "purchase" || entry.type === "refund") {
        runningBalance += entry.quantity;
      } else if (entry.type === "sale") {
        runningBalance -= entry.quantity;
      } else if (entry.type === "adjust") {
        if (entry.adjustType === "ADJUST_IN") {
          runningBalance += entry.quantity;
        } else if (entry.adjustType === "ADJUST_OUT") {
          runningBalance -= entry.quantity;
        }
      }

      entry.balance = runningBalance;
    });

    // ✅ Response
    res.json({
      product: {
        _id: product._id,
        name: product.name,
        unit: product.unit,
        unitCost: product.unitCost,
      },
      openingStock: opening,
      purchases: purchaseEntries,
      refunds: refundEntries,
      sales: saleEntries,
      ledger: fullLedger,
    });
  } catch (error) {
    console.error("📛 Product Ledger Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
