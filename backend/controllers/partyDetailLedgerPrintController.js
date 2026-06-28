// 📁 controllers/partyDetailLedgerPrintController.js

const mongoose = require("mongoose");

const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");

const Invoice = require("../models/Invoice");
const PurchaseInvoice = require("../models/purchaseInvoice");
const RefundInvoice = require("../models/RefundInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");

const buildPartyDetailLedgerPrint = require("../services/partyDetailLedgerPrintBuilder");
const generatePartyDetailLedgerHTML = require("../templates/partyDetailLedgerTemplate");

const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   HELPERS
========================================================= */

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const getDateRange = (startDate, endDate) => {
  const range = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return Object.keys(range).length ? range : null;
};

const getSourceLabel = (type = "") => {
  const map = {
    opening_balance: "Opening Balance",

    sale_invoice: "Sale Invoice",
    opening_sale_invoice: "Opening Balance",

    refund_invoice: "Sale Return",
    opening_refund_invoice: "Opening Balance",

    purchase_invoice: "Purchase Invoice",
    opening_purchase_invoice: "Opening Balance",

    purchase_return: "Purchase Return",
    opening_purchase_return: "Opening Balance",

    receive_payment: "Receive Payment",
    receive_payment_discount: "Receive Payment Discount",

    pay_bill: "Pay Bill",
    purchase_payment: "Purchase Payment",
    refund_payment: "Refund Payment",
    purchase_return_payment: "Purchase Return Payment",

    sale_discount: "Sale Discount",
    purchase_discount: "Purchase Discount",

    manual: "Manual Entry",
    adjustment: "Adjustment",
    expense: "Expense",
  };

  return map[type] || type || "-";
};

const normalizeItems = (items = []) => {
  if (!Array.isArray(items)) return [];

  return items.map((it, index) => ({
    sr: index + 1,
    productName: it.productId?.name || it.productName || "Product",
    unit: it.productId?.unit || it.unit || "PCS",
    ctn: it.ctn || it.carton || 1,
    quantity: Number(it.quantity || 0),
    rate: Number(it.price || it.rate || 0),
    amount: Number(it.total || it.amount || 0),
  }));
};

/* =========================================================
   INTERNAL: FETCH PARTY DETAILED LEDGER DATA
========================================================= */

const fetchPartyDetailedLedgerData = async ({
  partyId,
  userId,
  startDate,
  endDate,
}) => {
  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    throw new Error("Invalid party ID");
  }

  const userObjectId = toObjectId(userId);

  const party = await Party.findOne({
    _id: partyId,
    userId: userObjectId,
    isDeleted: false,
  }).populate("account");

  if (!party || !party.account) {
    throw new Error("Party not found");
  }

  const accountId = party.account._id || party.account;
  const accountObjectId = toObjectId(accountId);

  const dateRange = getDateRange(startDate, endDate);

  /* =========================================================
     OPENING BALANCE BEFORE START DATE
  ========================================================= */

  let openingBalance = 0;

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const openingResult = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userObjectId,
          isDeleted: false,
          sourceType: { $ne: "reversal" },
          "lines.account": accountObjectId,
          date: { $lt: start },
        },
      },
      { $unwind: "$lines" },
      {
        $match: {
          "lines.account": accountObjectId,
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

    openingBalance = Number(openingResult[0]?.balance || 0);
  }

  /* =========================================================
     JOURNAL ENTRIES
  ========================================================= */

  const matchFilter = {
    createdBy: userObjectId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
    "lines.account": accountObjectId,
  };

  if (dateRange) {
    matchFilter.date = dateRange;
  }

  const journals = await JournalEntry.find(matchFilter)
    .select(
      "date time billNo description sourceType originModule lines paymentType invoiceId invoiceModel referenceId partyId attachmentUrl attachmentType createdAt",
    )
    .sort({ date: 1, time: 1, createdAt: 1 })
    .lean();

  let runningBalance = openingBalance;
  let partyOpeningBalance = 0;
  let businessDebit = 0;
  let businessCredit = 0;

  const ledger = [];

  const saleInvoiceIds = [];
  const purchaseInvoiceIds = [];
  const refundInvoiceIds = [];
  const purchaseReturnIds = [];

  for (const entry of journals) {
    const partyLines = (entry.lines || []).filter(
      (line) => line.account?.toString() === accountId.toString(),
    );

    if (partyLines.length === 0) continue;

    let debit = 0;
    let credit = 0;

    for (const line of partyLines) {
      if (line.type === "debit") debit += Number(line.amount || 0);
      if (line.type === "credit") credit += Number(line.amount || 0);
    }

    runningBalance += debit - credit;

    const sourceType = entry.sourceType || "";
    if (
      ["opening_sale_invoice", "opening_refund_invoice"].includes(sourceType)
    ) {
      partyOpeningBalance += debit - credit;
    } else {
      businessDebit += debit;
      businessCredit += credit;
    }
    const invoiceId = entry.invoiceId || entry.referenceId || null;

    if (
      ["sale_invoice", "opening_sale_invoice"].includes(sourceType) &&
      invoiceId
    ) {
      saleInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["purchase_invoice", "opening_purchase_invoice"].includes(sourceType) &&
      invoiceId
    ) {
      purchaseInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["refund_invoice", "opening_refund_invoice"].includes(sourceType) &&
      invoiceId
    ) {
      refundInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["purchase_return", "opening_purchase_return"].includes(sourceType) &&
      invoiceId
    ) {
      purchaseReturnIds.push(invoiceId.toString());
    }

    ledger.push({
      _id: entry._id,
      key: `${entry._id}-${ledger.length}`,

      date: entry.date,
      time: entry.time || "",
      billNo: entry.billNo || "",
      description: entry.description || "",

      sourceType,
      sourceLabel: getSourceLabel(sourceType),
      originModule: entry.originModule || "",

      invoiceId,
      invoiceModel: entry.invoiceModel || "",
      referenceId: entry.referenceId || entry._id,

      debit: Number(debit.toFixed(2)),
      credit: Number(credit.toFixed(2)),
      balance: Number(runningBalance.toFixed(2)),

      paymentType:
        partyLines.find((l) => l.paymentType)?.paymentType ||
        entry.paymentType ||
        "",

      attachmentUrl: entry.attachmentUrl || "",
      attachmentType: entry.attachmentType || "",

      items: [],
    });
  }

  /* =========================================================
     FETCH ALL DOCUMENTS IN BATCH
  ========================================================= */

  const [saleInvoices, purchaseInvoices, refundInvoices, purchaseReturns] =
    await Promise.all([
      Invoice.find({
        _id: { $in: saleInvoiceIds },
        createdBy: userObjectId,
        isDeleted: { $ne: true },
      })
        .populate("items.productId", "name unit")
        .lean(),

      PurchaseInvoice.find({
        _id: { $in: purchaseInvoiceIds },
        userId: userObjectId,
        isDeleted: false,
      })
        .populate("items.productId", "name unit")
        .lean(),

      RefundInvoice.find({
        _id: { $in: refundInvoiceIds },
        createdBy: userObjectId,
        isDeleted: { $ne: true },
      })
        .populate("items.productId", "name unit")
        .lean(),

      PurchaseReturn.find({
        _id: { $in: purchaseReturnIds },
        createdBy: userObjectId,
        isDeleted: false,
      })
        .populate("items.productId", "name unit")
        .lean(),
    ]);

  const saleMap = new Map();
  const purchaseMap = new Map();
  const refundMap = new Map();
  const purchaseReturnMap = new Map();

  saleInvoices.forEach((doc) => saleMap.set(doc._id.toString(), doc));
  purchaseInvoices.forEach((doc) => purchaseMap.set(doc._id.toString(), doc));
  refundInvoices.forEach((doc) => refundMap.set(doc._id.toString(), doc));
  purchaseReturns.forEach((doc) =>
    purchaseReturnMap.set(doc._id.toString(), doc),
  );

  /* =========================================================
     ATTACH ITEMS TO LEDGER ROWS
  ========================================================= */

  for (const row of ledger) {
    const id = row.invoiceId?.toString?.();
    if (!id) continue;

    if (["sale_invoice", "opening_sale_invoice"].includes(row.sourceType)) {
      const inv = saleMap.get(id);

      if (inv) {
        row.items = normalizeItems(inv.items);
        row.documentTotal = Number(inv.totalAmount || inv.subTotal || 0);
        row.partyText = inv.customerName || party.name;
      }
    }

    if (
      ["purchase_invoice", "opening_purchase_invoice"].includes(row.sourceType)
    ) {
      const inv = purchaseMap.get(id);

      if (inv) {
        row.items = normalizeItems(inv.items);
        row.documentTotal = Number(inv.grandTotal || inv.totalAmount || 0);
        row.partyText = inv.supplierName || party.name;
      }
    }

    if (["refund_invoice", "opening_refund_invoice"].includes(row.sourceType)) {
      const ref = refundMap.get(id);

      if (ref) {
        row.items = normalizeItems(ref.items);
        row.documentTotal = Number(ref.totalAmount || 0);
        row.partyText = ref.customerName || party.name;
      }
    }

    if (
      ["purchase_return", "opening_purchase_return"].includes(row.sourceType)
    ) {
      const pr = purchaseReturnMap.get(id);

      if (pr) {
        row.items = normalizeItems(pr.items);
        row.documentTotal = Number(pr.totalAmount || 0);
        row.partyText = pr.supplierName || party.name;
      }
    }
  }

  const totalDebit = ledger.reduce(
    (sum, row) => sum + Number(row.debit || 0),
    0,
  );
  const totalCredit = ledger.reduce(
    (sum, row) => sum + Number(row.credit || 0),
    0,
  );

  const closingBalance =
    ledger.length > 0 ? ledger[ledger.length - 1].balance : openingBalance;

  return {
    partyId: party._id,
    partyName: party.name,
    partyPhone: party.phone || "",
    role: party.role || "both",

    startDate,
    endDate,

    openingBalance: Number(openingBalance.toFixed(2)),
    partyOpeningBalance: Number(partyOpeningBalance.toFixed(2)),
    totalDebit: Number(totalDebit.toFixed(2)),
    totalCredit: Number(totalCredit.toFixed(2)),
    businessDebit: Number(businessDebit.toFixed(2)),
    businessCredit: Number(businessCredit.toFixed(2)),
    closingBalance: Number(closingBalance.toFixed(2)),

    ledger,
  };
};

/* =========================================================
   HTML PREVIEW
========================================================= */

const getPartyDetailLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchPartyDetailedLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyDetailLedgerPrint(rawData);
    built.lang = req.query.lang || "en";

    const html = generatePartyDetailLedgerHTML(built, size || "A4");

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Party Detail Ledger HTML Error:", error);

    return res.status(500).send("Failed to generate party detail ledger HTML");
  }
};

/* =========================================================
   PDF DOWNLOAD
========================================================= */

const generatePartyDetailLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchPartyDetailedLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyDetailLedgerPrint(rawData);
    built.lang = req.query.lang || "en";

    const html = generatePartyDetailLedgerHTML(built, size || "A4");

    const pdfBuffer = await generatePdfFromHtml(html);

    const safePartyName = String(rawData.partyName || "Party")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${safePartyName}-Detail-Ledger.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Party Detail Ledger PDF Error:", error);

    return res.status(500).json({
      message: "Party detail ledger PDF generation failed",
      error: error.message,
    });
  }
};

/* =========================================================
   JSON API FOR FRONTEND PAGE
========================================================= */

const getPartyDetailedLedgerJson = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;
    const { startDate, endDate } = req.query;

    const data = await fetchPartyDetailedLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    return res.json(data);
  } catch (error) {
    console.error("❌ Party Detail Ledger JSON Error:", error);

    return res.status(500).json({
      message: "Party detail ledger fetch failed",
      error: error.message,
    });
  }
};

module.exports = {
  fetchPartyDetailedLedgerData,
  getPartyDetailLedgerHtml,
  generatePartyDetailLedgerPdf,
  getPartyDetailedLedgerJson,
};
