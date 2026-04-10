const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");

const buildCustomerDetailLedgerPrint = require("../services/customerDetailLedgerPrintBuilder");
const generateCustomerDetailLedgerHTML = require("../templates/customerDetailLedgerTemplate");

const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   INTERNAL: Fetch Customer Detailed Ledger Data
========================================================= */

const fetchCustomerDetailedLedgerData = async ({
  customerId,
  userId,
  startDate,
  endDate,
}) => {
  const customer = await Customer.findOne({
    _id: customerId,
    createdBy: userId,
  }).populate("account");

  if (!customer || !customer.account) {
    throw new Error("Customer not found");
  }

  const accountId = customer.account._id.toString();

  /* ================================
     Opening Balance
  ================================ */

  let openingBalance = 0;

  if (startDate) {
    const result = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          customerId: customer._id,
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
                { $eq: ["$lines.type", "debit"] },
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
    customerId: customer._id,
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

  const saleInvoiceIds = [];
  const refundInvoiceIds = [];

  for (const entry of journals) {
    const customerLines = entry.lines.filter(
      (l) => l.account?.toString() === accountId,
    );

    if (customerLines.length === 0) continue;

    let debit = 0;
    let credit = 0;

    for (const line of customerLines) {
      if (line.type === "debit") debit += line.amount;
      if (line.type === "credit") credit += line.amount;
    }

    balance += debit - credit;

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

    if (entry.sourceType === "sale_invoice" && entry.invoiceId) {
      saleInvoiceIds.push(entry.invoiceId.toString());
    }

    if (entry.sourceType === "refund_invoice" && entry.invoiceId) {
      refundInvoiceIds.push(entry.invoiceId.toString());
    }

    ledger.push(row);
  }

  /* ================================
     Batch Fetch Invoices
  ================================ */

  const invoices = await Invoice.find({
    _id: { $in: saleInvoiceIds },
  })
    .populate("items.productId", "name")
    .lean();

  const refunds = await RefundInvoice.find({
    _id: { $in: refundInvoiceIds },
  })
    .populate("items.productId", "name")
    .lean();

  const invoiceMap = new Map();
  const refundMap = new Map();

  for (const inv of invoices) {
    invoiceMap.set(inv._id.toString(), inv);
  }

  for (const ref of refunds) {
    refundMap.set(ref._id.toString(), ref);
  }

  /* ================================
     Attach Items to Ledger Rows
  ================================ */

  for (const row of ledger) {
    if (row.sourceType === "sale_invoice" && row.invoiceId) {
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

    if (row.sourceType === "refund_invoice" && row.invoiceId) {
      const ref = refundMap.get(row.invoiceId.toString());

      if (ref && Array.isArray(ref.items)) {
        row.items = ref.items.map((it) => ({
          productName: it.productId?.name || "Product",
          quantity: it.quantity,
          rate: it.price,
          total: it.total,
        }));
      }
    }
  }

  return {
    customerName: customer.name,
    openingBalance,
    ledger,
  };
};

/* =========================================================
   GET HTML PREVIEW
========================================================= */

const getCustomerDetailLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchCustomerDetailedLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
    });

    const built = buildCustomerDetailLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateCustomerDetailLedgerHTML(built, size || "A4");

    res.set({ "Content-Type": "text/html" });

    return res.send(html);
  } catch (error) {
    console.error("❌ Detail Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate detailed ledger HTML");
  }
};

/* =========================================================
   GENERATE PDF
========================================================= */

const generateCustomerDetailLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchCustomerDetailedLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
    });

    const built = buildCustomerDetailLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateCustomerDetailLedgerHTML(built, size || "A4");

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition":
        "attachment; filename=Customer-Detailed-Ledger.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    

    return res
      .status(500)
      .json({ message: "Detailed ledger PDF generation failed" });
  }
};

module.exports = {
  getCustomerDetailLedgerHtml,
  generateCustomerDetailLedgerPdf,
};
