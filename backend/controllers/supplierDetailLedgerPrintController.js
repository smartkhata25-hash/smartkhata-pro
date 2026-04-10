const mongoose = require("mongoose");

const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");
const PurchaseInvoice = require("../models/purchaseInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");

const buildSupplierDetailLedgerPrint = require("../services/supplierDetailLedgerPrintBuilder");
const generateSupplierDetailLedgerHTML = require("../templates/supplierDetailLedgerTemplate");

const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   INTERNAL: Fetch Supplier Detailed Ledger Data
========================================================= */

const fetchSupplierDetailedLedgerData = async ({
  supplierId,
  userId,
  startDate,
  endDate,
}) => {
  const supplier = await Supplier.findOne({
    _id: supplierId,
    userId,
    isDeleted: false,
  }).populate("account");

  if (!supplier || !supplier.account) {
    throw new Error("Supplier not found");
  }

  const accountId = supplier.account._id.toString();

  /* ================================
     Opening Balance
  ================================ */

  let openingBalance = 0;

  if (startDate) {
    const result = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          supplierId: supplier._id,
          isDeleted: false,
          date: { $lt: new Date(startDate) },
        },
      },
      { $unwind: "$lines" },
      {
        $match: {
          "lines.account": new mongoose.Types.ObjectId(accountId),
        },
      },
      {
        $group: {
          _id: null,
          balance: {
            $sum: {
              $cond: [
                { $eq: ["$lines.type", "credit"] },
                "$lines.amount",
                { $multiply: ["$lines.amount", -1] },
              ],
            },
          },
        },
      },
    ]);

    openingBalance = result[0]?.balance || 0;
  }

  /* ================================
     Ledger Entries
  ================================ */

  const matchFilter = {
    createdBy: userId,
    supplierId: supplier._id,
    isDeleted: false,
  };

  if (startDate && endDate) {
    const s = new Date(startDate);
    s.setHours(0, 0, 0, 0);

    const e = new Date(endDate);
    e.setHours(23, 59, 59, 999);

    matchFilter.date = { $gte: s, $lte: e };
  }

  const journals = await JournalEntry.find(matchFilter)
    .sort({ date: 1, time: 1 })
    .lean();

  let balance = openingBalance;

  const ledger = [];

  /* ================================
     Collect Invoice IDs
  ================================ */

  const purchaseInvoiceIds = [];
  const purchaseReturnIds = [];

  for (const entry of journals) {
    const supplierLines = entry.lines.filter(
      (l) => l.account?.toString() === accountId,
    );

    if (supplierLines.length === 0) continue;

    let debit = 0;
    let credit = 0;

    for (const line of supplierLines) {
      if (line.type === "debit") debit += line.amount;
      if (line.type === "credit") credit += line.amount;
    }

    balance += credit - debit;

    const row = {
      _id: entry._id,
      referenceId: entry.referenceId || entry._id,
      invoiceId: entry.invoiceId,
      date: entry.date,
      billNo: entry.billNo || "",
      sourceType: entry.sourceType,
      debit,
      credit,
      balance,
      items: [],
    };

    if (entry.sourceType === "purchase_invoice" && entry.invoiceId) {
      purchaseInvoiceIds.push(entry.invoiceId.toString());
    }

    if (entry.sourceType === "purchase_return" && entry.invoiceId) {
      purchaseReturnIds.push(entry.invoiceId.toString());
    }

    ledger.push(row);
  }

  /* ================================
     Batch Fetch Invoices
  ================================ */

  const invoices = await PurchaseInvoice.find({
    _id: { $in: purchaseInvoiceIds },
  })
    .populate("items.productId", "name")
    .lean();

  const returns = await PurchaseReturn.find({
    _id: { $in: purchaseReturnIds },
  })
    .populate("items.productId", "name")
    .lean();

  const invoiceMap = new Map();
  const returnMap = new Map();

  for (const inv of invoices) {
    invoiceMap.set(inv._id.toString(), inv);
  }

  for (const ret of returns) {
    returnMap.set(ret._id.toString(), ret);
  }

  /* ================================
     Attach Items to Ledger Rows
  ================================ */

  for (const row of ledger) {
    if (row.sourceType === "purchase_invoice" && row.invoiceId) {
      const inv = invoiceMap.get(row.invoiceId.toString());

      if (inv && Array.isArray(inv.items)) {
        row.items = inv.items.map((it) => ({
          productName: it.productId?.name || "Product",
          quantity: it.quantity,
          rate: it.price,
          total: it.total,
        }));
      }
    }

    if (row.sourceType === "purchase_return" && row.invoiceId) {
      const ret = returnMap.get(row.invoiceId.toString());

      if (ret && Array.isArray(ret.items)) {
        row.items = ret.items.map((it) => ({
          productName: it.productId?.name || "Product",
          quantity: it.quantity,
          rate: it.price,
          total: it.total,
        }));
      }
    }
  }

  return {
    supplierName: supplier.name,
    openingBalance,
    ledger,
  };
};

/* =========================================================
   GET HTML PREVIEW
========================================================= */

const getSupplierDetailLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { supplierId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchSupplierDetailedLedgerData({
      supplierId,
      userId,
      startDate,
      endDate,
    });

    const built = buildSupplierDetailLedgerPrint({
      supplierName: rawData.supplierName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateSupplierDetailLedgerHTML(built, size || "A4");

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (error) {
    console.error("❌ Supplier Detail Ledger HTML Error:", error.message);

    return res
      .status(500)
      .send("Failed to generate supplier detailed ledger HTML");
  }
};

/* =========================================================
   GENERATE PDF
========================================================= */

const generateSupplierDetailLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { supplierId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchSupplierDetailedLedgerData({
      supplierId,
      userId,
      startDate,
      endDate,
    });

    const built = buildSupplierDetailLedgerPrint({
      supplierName: rawData.supplierName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateSupplierDetailLedgerHTML(built, size || "A4");

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        "attachment; filename=Supplier-Detailed-Ledger.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Supplier Detail Ledger PDF Error:", error.message);

    return res
      .status(500)
      .json({ message: "Supplier detailed ledger PDF generation failed" });
  }
};

module.exports = {
  getSupplierDetailLedgerHtml,
  generateSupplierDetailLedgerPdf,
};
