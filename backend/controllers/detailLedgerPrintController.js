const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");

const buildCustomerDetailLedgerPrint = require("../services/customerDetailLedgerPrintBuilder");
const generateCustomerDetailLedgerHTML = require("../templates/customerDetailLedgerTemplate");
const {
  getTravelCustomerJournalFilter,
} = require("../services/travel/travelAccountingMetricsService");

const { generatePdfFromHtml } = require("../services/pdfService");

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

const resolveSourceLabel = (sourceType, originModule = "") => {
  if (originModule === "travel_receive_payment" && sourceType === "receive_payment") {
    return "Travel Payment";
  }

  if (originModule === "travel_invoice" && sourceType === "receive_payment") {
    return "Travel Invoice Payment";
  }

  if (originModule === "travel_refund" && sourceType === "refund_payment") {
    return "Travel Refund Payment";
  }

  switch (sourceType) {
    case "travel_booking":
      return "Travel Invoice";

    case "travel_refund":
      return "Travel Refund";

    case "opening_sale_invoice":
      return "Opening Balance";

    case "opening_refund_invoice":
      return "Opening Balance";

    case "sale_invoice":
      return "Sale Invoice";

    case "refund_invoice":
      return "Refund Invoice";

    case "receive_payment":
      return "Receive Payment";

    case "receive_payment_discount":
      return "Receive Payment Discount";

    case "opening_balance":
      return "Opening Balance";

    default:
      return "-";
  }
};

const fetchCustomerDetailedLedgerData = async ({
  customerId,
  userId,
  startDate,
  endDate,
  moduleScope = "",
}) => {
  if (!mongoose.Types.ObjectId.isValid(customerId)) {
    throw new Error("Invalid customer ID");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const customerObjectId = new mongoose.Types.ObjectId(customerId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const customer = await Customer.findOne({
    _id: customerObjectId,
    createdBy: userObjectId,
  })
    .populate("account")
    .lean();

  if (!customer || !customer.account) {
    throw new Error("Customer not found");
  }

  const accountObjectId =
    customer.account?._id instanceof mongoose.Types.ObjectId
      ? customer.account._id
      : new mongoose.Types.ObjectId(customer.account);

  const accountId = accountObjectId.toString();

  const start = getStartOfDay(startDate);
  const end = getEndOfDay(endDate);
  const travelJournalFilter =
    moduleScope === "travel" ? getTravelCustomerJournalFilter() : {};

  let openingBalance = 0;

  if (start) {
    const result = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userObjectId,
          customerId: customerObjectId,
          isDeleted: false,
          sourceType: { $ne: "reversal" },
          "lines.account": accountObjectId,
          ...travelJournalFilter,
          date: {
            $lt: start,
          },
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
                {
                  $eq: ["$lines.type", "debit"],
                },
                "$lines.amount",
                {
                  $multiply: ["$lines.amount", -1],
                },
              ],
            },
          },
        },
      },
    ]);

    openingBalance = Number(result[0]?.balance || 0);
  }

  const matchFilter = {
    createdBy: userObjectId,
    customerId: customerObjectId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
    "lines.account": accountObjectId,
    ...travelJournalFilter,
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
        "lines.account",
        "lines.type",
        "lines.amount",
        "invoiceId",
        "referenceId",
      ].join(" "),
    )
    .sort({
      date: 1,
      time: 1,
      _id: 1,
    })
    .lean();

  const ledger = [];

  const saleInvoiceIds = new Set();
  const refundInvoiceIds = new Set();

  for (const entry of journals) {
    if (!Array.isArray(entry.lines)) {
      continue;
    }

    const customerLines = entry.lines.filter(
      (line) => line.account?.toString() === accountId,
    );

    if (customerLines.length === 0) {
      continue;
    }

    let debit = 0;
    let credit = 0;

    for (const line of customerLines) {
      const amount = Number(line.amount || 0);

      if (line.type === "debit") {
        debit += amount;
      }

      if (line.type === "credit") {
        credit += amount;
      }
    }

    const row = {
      _id: entry._id,

      referenceId: entry.referenceId || entry._id,

      invoiceId: entry.invoiceId || null,

      date: entry.date,

      time: entry.time || "",

      billNo: entry.billNo || "",

      description: entry.description || "",

      sourceType: entry.sourceType || "",

      sourceLabel: resolveSourceLabel(entry.sourceType, entry.originModule),

      debit,

      credit,

      items: [],
    };

    if (
      ["sale_invoice", "opening_sale_invoice"].includes(entry.sourceType) &&
      entry.invoiceId
    ) {
      saleInvoiceIds.add(entry.invoiceId.toString());
    }

    if (
      ["refund_invoice", "opening_refund_invoice"].includes(entry.sourceType) &&
      entry.invoiceId
    ) {
      refundInvoiceIds.add(entry.invoiceId.toString());
    }

    ledger.push(row);
  }

  const saleIds = Array.from(saleInvoiceIds);
  const refundIds = Array.from(refundInvoiceIds);

  const [invoices, refunds] = await Promise.all([
    saleIds.length
      ? Invoice.find({
          _id: {
            $in: saleIds,
          },
          createdBy: userObjectId,
          isDeleted: { $ne: true },
        })
          .select("items totalAmount")
          .populate("items.productId", "name")
          .lean()
      : [],

    refundIds.length
      ? RefundInvoice.find({
          _id: {
            $in: refundIds,
          },
          createdBy: userObjectId,
          isDeleted: { $ne: true },
        })
          .select("items totalAmount")
          .populate("items.productId", "name")
          .lean()
      : [],
  ]);

  const invoiceMap = new Map();
  const refundMap = new Map();

  for (const invoice of invoices) {
    invoiceMap.set(invoice._id.toString(), invoice);
  }

  for (const refund of refunds) {
    refundMap.set(refund._id.toString(), refund);
  }

  for (const row of ledger) {
    if (
      ["sale_invoice", "opening_sale_invoice"].includes(row.sourceType) &&
      row.invoiceId
    ) {
      const invoice = invoiceMap.get(row.invoiceId.toString());

      if (invoice) {
        row.invoiceTotal = Number(invoice.totalAmount || 0);

        if (Array.isArray(invoice.items)) {
          row.items = invoice.items.map((item) => ({
            productName: item.productId?.name || "Product",
            quantity: Number(item.quantity || 0),
            rate: Number(item.price || 0),
            total: Number(item.total || 0),
          }));
        }
      }
    }

    if (
      ["refund_invoice", "opening_refund_invoice"].includes(row.sourceType) &&
      row.invoiceId
    ) {
      const refund = refundMap.get(row.invoiceId.toString());

      if (refund) {
        row.invoiceTotal = Number(refund.totalAmount || 0);

        if (Array.isArray(refund.items)) {
          row.items = refund.items.map((item) => ({
            productName: item.productId?.name || "Product",
            quantity: Number(item.quantity || 0),
            rate: Number(item.price || 0),
            total: Number(item.total || 0),
          }));
        }
      }
    }
  }

  return {
    customerName: customer.name || "-",
    openingBalance,
    ledger,
  };
};

const getCustomerDetailLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { customerId } = req.params;

    const { startDate, endDate, size, lang, moduleScope = "" } = req.query;

    const rawData = await fetchCustomerDetailedLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildCustomerDetailLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

    const html = generateCustomerDetailLedgerHTML(built, size || "A4");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Detail Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate detailed ledger HTML");
  }
};

const generateCustomerDetailLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { customerId } = req.params;

    const { startDate, endDate, size, lang, moduleScope = "" } = req.query;

    const rawData = await fetchCustomerDetailedLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildCustomerDetailLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

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
    console.error("❌ Detail Ledger PDF Error:", error.message);

    return res.status(500).json({
      message: "Detailed ledger PDF generation failed",
    });
  }
};

module.exports = {
  getCustomerDetailLedgerHtml,
  generateCustomerDetailLedgerPdf,
};
