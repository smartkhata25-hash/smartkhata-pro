const Product = require("../models/Product");
const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const InventoryTransaction = require("../models/InventoryTransaction");

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

    console.log("🔎 Product Ledger:", { productId, startDate, endDate });

    // 🔹 Get Product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    // 🔹 Opening Stock (Before startDate)
    const previousTransactions = await InventoryTransaction.find({
      productId,
      userId,
      date: { $lt: startDate ? new Date(startDate) : new Date() },
    });

    let opening = 0;
    previousTransactions.forEach((t) => {
      if (t.type === "IN") opening += t.quantity;
      else if (t.type === "OUT") opening -= t.quantity;
    });

    let stockBalance = opening;

    // 🔹 Purchases (IN)
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
      stockBalance += p.quantity;
      return {
        date: p.date,
        billNo: p.invoiceId?.billNo || "",
        supplierName: p.invoiceId?.supplierName || "Unknown",
        quantity: p.quantity,
        rate: p.rate || product.unitCost || 0,
        type: "purchase",
        balance: stockBalance,
      };
    });

    // 🔹 Sales (OUT)
    const salesInvoices = await Invoice.find({
      "items.productId": productId,
      createdBy: userId,
      ...(startDate || endDate ? { invoiceDate: dateFilter } : {}),
    }).sort({ invoiceDate: 1 });

    const saleEntries = [];

    salesInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        if (item.productId.toString() === productId) {
          stockBalance -= item.quantity;
          saleEntries.push({
            date: inv.invoiceDate,
            billNo: inv.billNo || "",
            customerName: inv.customerName || "Unknown",
            quantity: item.quantity,
            rate: item.price || 0,
            total: item.total || 0,
            type: "sale",
            balance: stockBalance,
          });
        }
      });
    });

    // 🔹 Merge all entries and sort by date
    const fullLedger = [...purchaseEntries, ...saleEntries].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    // ✅ Response
    res.json({
      product: {
        _id: product._id,
        name: product.name,
        unit: product.unit,
        unitCost: product.unitCost,
      },
      openingStock: opening,
      ledger: fullLedger,
    });
  } catch (error) {
    console.error("📛 Product Ledger Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
