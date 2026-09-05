const mongoose = require("mongoose");
const Product = require("../models/Product");
const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/purchaseInvoice");
const InventoryTransaction = require("../models/InventoryTransaction");
const RefundInvoice = require("../models/RefundInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const {
  buildBusinessDateRange,
  startOfBusinessDay,
} = require("../utils/businessDate");

exports.getProductLedger = async (req, res) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate } = req.query;
    const userId = req.user.id;

    if (!productId) {
      return res.status(400).json({ message: "Product ID is required." });
    }

    const dateFilter =
      buildBusinessDateRange({
        startDate,
        endDate,
      }).date || {};
    const hasDateFilter = Object.keys(dateFilter).length > 0;

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
        date: { $lt: startOfBusinessDay(startDate) },
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
      ...(hasDateFilter ? { date: dateFilter } : {}),
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
      ...(hasDateFilter ? { date: dateFilter } : {}),
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

    // 🔹 Purchase Returns (OUT)
    const purchaseReturns = await InventoryTransaction.find({
      productId,
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
      .sort({ date: 1 });

    const purchaseReturnEntries = purchaseReturns.map((pr) => {
      return {
        date: pr.date,
        billNo: pr.invoiceId?.billNo || "",
        supplierName: pr.invoiceId?.supplierName || "Unknown",
        quantity: pr.quantity,
        rate: pr.rate || product.unitCost || 0,
        type: "purchase_return",

        invoiceId: pr.invoiceId?._id?.toString() || "",
      };
    });

    const salesInvoices = await Invoice.find({
      "items.productId": new mongoose.Types.ObjectId(productId),
      createdBy: userId,
      ...(hasDateFilter ? { invoiceDate: dateFilter } : {}),
    }).sort({ invoiceDate: 1 });

    const saleEntries = [];

    const adjustments = await InventoryTransaction.find({
      productId,
      userId,
      type: { $in: ["ADJUST_IN", "ADJUST_OUT"] },
      ...(hasDateFilter ? { date: dateFilter } : {}),
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
      ...purchaseReturnEntries,
      ...saleEntries,
      ...adjustmentEntries,
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = opening;

    fullLedger.forEach((entry) => {
      if (entry.type === "purchase" || entry.type === "refund") {
        runningBalance += entry.quantity;
      } else if (entry.type === "sale" || entry.type === "purchase_return") {
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
      purchaseReturns: purchaseReturnEntries,
      sales: saleEntries,
      ledger: fullLedger,
    });
  } catch (error) {
    console.error("📛 Product Ledger Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
