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

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const getStartOfDay = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (isNaN(date.getTime())) return null;

  date.setHours(0, 0, 0, 0);

  return date;
};

const getEndOfDay = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (isNaN(date.getTime())) return null;

  date.setHours(23, 59, 59, 999);

  return date;
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
    purchase_return_payment: "Purchase Return Payment",

    refund_payment: "Refund Payment",

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

  return items.map((item, index) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.price ?? item.rate ?? 0);

    const amount =
      item.total !== undefined && item.total !== null
        ? Number(item.total || 0)
        : item.amount !== undefined && item.amount !== null
          ? Number(item.amount || 0)
          : quantity * rate;

    return {
      sr: index + 1,
      productName:
        item.productId?.name || item.productName || item.name || "Product",
      unit: item.productId?.unit || item.unit || item.uom || "PCS",
      ctn: Number(item.ctn ?? item.carton ?? 1),
      quantity,
      rate,
      amount,
    };
  });
};

const uniqueIds = (ids = []) => [...new Set(ids.filter(Boolean))];

const fetchPartyDetailedLedgerData = async ({
  partyId,
  userId,
  startDate,
  endDate,
}) => {
  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    throw new Error("Invalid party ID");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const partyObjectId = toObjectId(partyId);
  const userObjectId = toObjectId(userId);

  const party = await Party.findOne({
    _id: partyObjectId,
    userId: userObjectId,
    isDeleted: false,
  })
    .populate("account")
    .lean();

  if (!party || !party.account) {
    throw new Error("Party not found");
  }

  const account =
    typeof party.account === "object" && party.account?._id
      ? party.account._id
      : party.account;

  if (!account || !mongoose.Types.ObjectId.isValid(account)) {
    throw new Error("Invalid party account");
  }

  const accountObjectId = toObjectId(account);
  const accountId = accountObjectId.toString();

  const start = getStartOfDay(startDate);
  const end = getEndOfDay(endDate);

  let openingBalance = 0;

  if (start) {
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
      {
        $unwind: "$lines",
      },
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

  const openingSourceTypes = [
    "opening_balance",
    "opening_sale_invoice",
    "opening_refund_invoice",
    "opening_purchase_invoice",
    "opening_purchase_return",
  ];

  const partyOpeningResult = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: userObjectId,
        isDeleted: false,
        sourceType: { $in: openingSourceTypes },
        "lines.account": accountObjectId,
      },
    },
    {
      $unwind: "$lines",
    },
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

  const partyOpeningBalance = Number(
    Number(partyOpeningResult[0]?.balance || 0).toFixed(2),
  );

  const matchFilter = {
    createdBy: userObjectId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
    "lines.account": accountObjectId,
  };

  if (start || end) {
    matchFilter.date = {};

    if (start) {
      matchFilter.date.$gte = start;
    }

    if (end) {
      matchFilter.date.$lte = end;
    }
  }

  const journals = await JournalEntry.find(matchFilter)
    .select(
      [
        "date",
        "time",
        "billNo",
        "description",
        "sourceType",
        "originModule",
        "paymentType",
        "invoiceId",
        "invoiceModel",
        "referenceId",
        "partyId",
        "attachmentUrl",
        "attachmentType",
        "createdAt",
        "lines.account",
        "lines.type",
        "lines.amount",
        "lines.paymentType",
      ].join(" "),
    )
    .sort({
      date: 1,
      time: 1,
      createdAt: 1,
      _id: 1,
    })
    .lean();

  let runningBalance = openingBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const ledger = [];

  const saleInvoiceIds = [];
  const purchaseInvoiceIds = [];
  const refundInvoiceIds = [];
  const purchaseReturnIds = [];

  for (const entry of journals) {
    if (!Array.isArray(entry.lines)) {
      continue;
    }

    const partyLines = entry.lines.filter(
      (line) => line.account?.toString() === accountId,
    );

    if (partyLines.length === 0) {
      continue;
    }

    let debit = 0;
    let credit = 0;

    for (const line of partyLines) {
      const amount = Number(line.amount || 0);

      if (line.type === "debit") {
        debit += amount;
      }

      if (line.type === "credit") {
        credit += amount;
      }
    }

    debit = Number(debit.toFixed(2));
    credit = Number(credit.toFixed(2));

    runningBalance = Number((runningBalance + debit - credit).toFixed(2));

    totalDebit += debit;
    totalCredit += credit;

    const sourceType = entry.sourceType || "";

    const invoiceId = entry.invoiceId || entry.referenceId || null;

    if (
      ["sale_invoice", "opening_sale_invoice"].includes(sourceType) &&
      invoiceId &&
      mongoose.Types.ObjectId.isValid(invoiceId)
    ) {
      saleInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["purchase_invoice", "opening_purchase_invoice"].includes(sourceType) &&
      invoiceId &&
      mongoose.Types.ObjectId.isValid(invoiceId)
    ) {
      purchaseInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["refund_invoice", "opening_refund_invoice"].includes(sourceType) &&
      invoiceId &&
      mongoose.Types.ObjectId.isValid(invoiceId)
    ) {
      refundInvoiceIds.push(invoiceId.toString());
    }

    if (
      ["purchase_return", "opening_purchase_return"].includes(sourceType) &&
      invoiceId &&
      mongoose.Types.ObjectId.isValid(invoiceId)
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

      debit,
      credit,

      balance: runningBalance,

      paymentType:
        partyLines.find((line) => line.paymentType)?.paymentType ||
        entry.paymentType ||
        "",

      attachmentUrl: entry.attachmentUrl || "",
      attachmentType: entry.attachmentType || "",

      items: [],
    });
  }

  const [saleInvoices, purchaseInvoices, refundInvoices, purchaseReturns] =
    await Promise.all([
      Invoice.find({
        _id: { $in: uniqueIds(saleInvoiceIds) },
        createdBy: userObjectId,
        isDeleted: { $ne: true },
      })
        .populate("items.productId", "name unit")
        .lean(),

      PurchaseInvoice.find({
        _id: { $in: uniqueIds(purchaseInvoiceIds) },
        userId: userObjectId,
        isDeleted: false,
      })
        .populate("items.productId", "name unit")
        .lean(),

      RefundInvoice.find({
        _id: { $in: uniqueIds(refundInvoiceIds) },
        createdBy: userObjectId,
        isDeleted: { $ne: true },
      })
        .populate("items.productId", "name unit")
        .lean(),

      PurchaseReturn.find({
        _id: { $in: uniqueIds(purchaseReturnIds) },
        createdBy: userObjectId,
        isDeleted: false,
      })
        .populate("items.productId", "name unit")
        .lean(),
    ]);

  const saleMap = new Map(saleInvoices.map((doc) => [doc._id.toString(), doc]));

  const purchaseMap = new Map(
    purchaseInvoices.map((doc) => [doc._id.toString(), doc]),
  );

  const refundMap = new Map(
    refundInvoices.map((doc) => [doc._id.toString(), doc]),
  );

  const purchaseReturnMap = new Map(
    purchaseReturns.map((doc) => [doc._id.toString(), doc]),
  );

  for (const row of ledger) {
    const id = row.invoiceId?.toString?.();

    if (!id) {
      continue;
    }

    if (["sale_invoice", "opening_sale_invoice"].includes(row.sourceType)) {
      const invoice = saleMap.get(id);

      if (invoice) {
        row.items = normalizeItems(invoice.items);

        row.documentTotal = Number(
          invoice.grandTotal ?? invoice.totalAmount ?? invoice.subTotal ?? 0,
        );

        row.partyText = invoice.customerName || party.name;
      }
    }

    if (
      ["purchase_invoice", "opening_purchase_invoice"].includes(row.sourceType)
    ) {
      const invoice = purchaseMap.get(id);

      if (invoice) {
        row.items = normalizeItems(invoice.items);

        row.documentTotal = Number(
          invoice.grandTotal ?? invoice.totalAmount ?? invoice.subTotal ?? 0,
        );

        row.partyText = invoice.supplierName || party.name;
      }
    }

    if (["refund_invoice", "opening_refund_invoice"].includes(row.sourceType)) {
      const refund = refundMap.get(id);

      if (refund) {
        row.items = normalizeItems(refund.items);

        row.documentTotal = Number(
          refund.grandTotal ?? refund.totalAmount ?? refund.subTotal ?? 0,
        );

        row.partyText = refund.customerName || party.name;
      }
    }

    if (
      ["purchase_return", "opening_purchase_return"].includes(row.sourceType)
    ) {
      const purchaseReturn = purchaseReturnMap.get(id);

      if (purchaseReturn) {
        row.items = normalizeItems(purchaseReturn.items);

        row.documentTotal = Number(
          purchaseReturn.grandTotal ??
            purchaseReturn.totalAmount ??
            purchaseReturn.subTotal ??
            0,
        );

        row.partyText = purchaseReturn.supplierName || party.name;
      }
    }
  }

  const finalTotalDebit = Number(totalDebit.toFixed(2));
  const finalTotalCredit = Number(totalCredit.toFixed(2));

  const closingBalance = Number(
    (openingBalance + finalTotalDebit - finalTotalCredit).toFixed(2),
  );

  return {
    partyId: party._id,

    partyName: party.name || "-",
    partyPhone: party.phone || "",
    role: party.role || "both",

    startDate,
    endDate,

    openingBalance: Number(openingBalance.toFixed(2)),
    partyOpeningBalance,

    totalDebit: finalTotalDebit,
    totalCredit: finalTotalCredit,

    closingBalance,

    ledger,
  };
};

const getPartyDetailLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;

    const { startDate, endDate, size, lang } = req.query;

    const rawData = await fetchPartyDetailedLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyDetailLedgerPrint(rawData);

    built.lang = lang || "ur";

    const html = generatePartyDetailLedgerHTML(built, size || "A4");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Party Detail Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate party detail ledger HTML");
  }
};

const generatePartyDetailLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;

    const { startDate, endDate, size, lang } = req.query;

    const rawData = await fetchPartyDetailedLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyDetailLedgerPrint(rawData);

    built.lang = lang || "ur";

    const html = generatePartyDetailLedgerHTML(built, size || "A4");

    const pdfBuffer = await generatePdfFromHtml(html);

    const safePartyName =
      String(rawData.partyName || "Party")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "Party";

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${safePartyName}-Detail-Ledger.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Party Detail Ledger PDF Error:", error.message);

    return res.status(500).json({
      message: "Party detail ledger PDF generation failed",
    });
  }
};

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
    console.error("❌ Party Detail Ledger JSON Error:", error.message);

    return res.status(500).json({
      message: "Party detail ledger fetch failed",
    });
  }
};

module.exports = {
  fetchPartyDetailedLedgerData,
  getPartyDetailLedgerHtml,
  generatePartyDetailLedgerPdf,
  getPartyDetailedLedgerJson,
};
