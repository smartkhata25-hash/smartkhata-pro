// 📁 controllers/ledgerPrintController.js

const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");

const buildCustomerLedgerPrint = require("../services/ledgerPrintBuilder");
const generateCustomerLedgerHTML = require("../templates/customerLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   INTERNAL: Fetch Ledger Data (Same Logic, Clean Version)
========================================================= */

const fetchCustomerLedgerData = async ({
  customerId,
  userId,
  startDate,
  endDate,
}) => {
  const customer = await Customer.findById(customerId).populate("account");
  if (!customer) {
    throw new Error("Customer not found");
  }

  const account =
    typeof customer.account === "object" && customer.account?._id
      ? customer.account._id
      : customer.account;

  if (!account) {
    throw new Error("No account linked with customer");
  }

  const objectId = new mongoose.Types.ObjectId(account);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const matchFilter = {
    createdBy: userObjectId,
    "lines.account": objectId,
    isDeleted: false,
  };

  if (startDate && endDate) {
    matchFilter.date = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }

  const entries = await JournalEntry.find(matchFilter)
    .sort({ date: 1, time: 1 })
    .lean();

  /* ===== Opening Balance ===== */
  let opening = 0;

  if (startDate) {
    const prevEntries = await JournalEntry.find({
      createdBy: userObjectId,
      isDeleted: false,
      "lines.account": objectId,
      date: { $lt: new Date(startDate) },
    }).lean();

    for (let entry of prevEntries) {
      for (let line of entry.lines) {
        if (line.account?.toString() === account.toString()) {
          opening += line.type === "debit" ? line.amount : -line.amount;
        }
      }
    }
  }

  /* ===== Ledger Rows ===== */
  const ledger = [];

  for (let entry of entries) {
    for (let line of entry.lines) {
      if (line.account?.toString() === account.toString()) {
        ledger.push({
          date: entry.date,
          billNo: entry.billNo || "",
          sourceType: entry.sourceType || "",
          sourceLabel:
            entry.sourceType === "sale_invoice"
              ? "Sale Invoice"
              : entry.sourceType === "receive_payment"
                ? "Receive Payment"
                : entry.sourceType === "refund_invoice"
                  ? "Refund Invoice"
                  : "-",
          debit: line.type === "debit" ? line.amount : 0,
          credit: line.type === "credit" ? line.amount : 0,
        });
      }
    }
  }

  return {
    customerName: customer.name,
    openingBalance: opening,
    ledger,
  };
};

/* =========================================================
   GET LEDGER HTML (Direct Open in Browser)
========================================================= */

const getCustomerLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchCustomerLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
    });

    const built = buildCustomerLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateCustomerLedgerHTML(built, size || "A5");

    res.set({ "Content-Type": "text/html" });
    return res.send(html);
  } catch (error) {
    console.error("❌ Ledger HTML Error:", error.message);
    return res.status(500).send("Failed to generate ledger HTML");
  }
};

/* =========================================================
   GENERATE LEDGER PDF
========================================================= */

const generateCustomerLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { customerId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchCustomerLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
    });

    const built = buildCustomerLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateCustomerLedgerHTML(built, size || "A5");

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=Customer-Ledger.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Ledger PDF Error:", error.message);
    return res.status(500).json({ message: "Ledger PDF generation failed" });
  }
};

module.exports = {
  getCustomerLedgerHtml,
  generateCustomerLedgerPdf,
};
