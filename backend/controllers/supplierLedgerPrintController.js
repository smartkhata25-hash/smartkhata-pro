/**
 * Supplier Ledger Print Controller
 * --------------------------------
 * Purpose:
 *  - Fetch supplier ledger data
 *  - Prepare ledger for print
 *  - Generate HTML preview
 *  - Generate PDF using Puppeteer
 */

const mongoose = require("mongoose");

const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");

const buildSupplierLedgerPrint = require("../services/supplierLedgerPrintBuilder");
const generateSupplierLedgerHTML = require("../templates/supplierLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   INTERNAL: FETCH SUPPLIER LEDGER DATA
========================================================= */

const fetchSupplierLedgerData = async ({
  supplierId,
  userId,
  startDate,
  endDate,
}) => {
  const supplier = await Supplier.findById(supplierId).populate("account");

  if (!supplier) {
    throw new Error("Supplier not found");
  }

  const account =
    typeof supplier.account === "object" && supplier.account?._id
      ? supplier.account._id
      : supplier.account;

  if (!account) {
    throw new Error("No account linked with supplier");
  }

  const accountObjectId = new mongoose.Types.ObjectId(account);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  /* ================================
     Ledger Entries Query
  ================================ */

  const matchFilter = {
    createdBy: userObjectId,
    "lines.account": accountObjectId,
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

  /* ================================
     Opening Balance
  ================================ */

  let opening = 0;

  if (startDate) {
    const prevEntries = await JournalEntry.find({
      createdBy: userObjectId,
      isDeleted: false,
      "lines.account": accountObjectId,
      date: { $lt: new Date(startDate) },
    }).lean();

    for (const entry of prevEntries) {
      for (const line of entry.lines) {
        if (line.account?.toString() === account.toString()) {
          opening +=
            line.type === "debit"
              ? Number(line.amount || 0)
              : -Number(line.amount || 0);
        }
      }
    }
  }

  /* ================================
     Ledger Rows Build
  ================================ */

  const ledger = [];

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.account?.toString() === account.toString()) {
        ledger.push({
          date: entry.date,
          billNo: entry.billNo || "",

          sourceType: entry.sourceType || "",

          sourceLabel:
            entry.sourceType === "purchase_invoice"
              ? "Purchase Invoice"
              : entry.sourceType === "pay_bill"
                ? "Payment"
                : entry.sourceType === "purchase_return"
                  ? "Purchase Return"
                  : "-",

          debit: line.type === "debit" ? Number(line.amount || 0) : 0,
          credit: line.type === "credit" ? Number(line.amount || 0) : 0,
        });
      }
    }
  }

  return {
    supplierName: supplier.name,
    openingBalance: opening,
    ledger,
  };
};

/* =========================================================
   GET SUPPLIER LEDGER HTML
========================================================= */

const getSupplierLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { supplierId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchSupplierLedgerData({
      supplierId,
      userId,
      startDate,
      endDate,
    });

    const built = buildSupplierLedgerPrint({
      supplierName: rawData.supplierName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateSupplierLedgerHTML(built, size || "A5");

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Supplier Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate supplier ledger HTML");
  }
};

/* =========================================================
   GENERATE SUPPLIER LEDGER PDF
========================================================= */

const generateSupplierLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { supplierId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchSupplierLedgerData({
      supplierId,
      userId,
      startDate,
      endDate,
    });

    const built = buildSupplierLedgerPrint({
      supplierName: rawData.supplierName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    const html = generateSupplierLedgerHTML(built, size || "A5");

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename=Supplier-Ledger.pdf",
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Supplier Ledger PDF Error:", error.message);

    return res
      .status(500)
      .json({ message: "Supplier ledger PDF generation failed" });
  }
};

module.exports = {
  getSupplierLedgerHtml,
  generateSupplierLedgerPdf,
};
