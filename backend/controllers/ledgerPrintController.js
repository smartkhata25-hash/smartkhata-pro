// 📁 controllers/ledgerPrintController.js

const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const {
  getTravelCustomerJournalFilter,
} = require("../services/travel/travelAccountingMetricsService");

const buildCustomerLedgerPrint = require("../services/ledgerPrintBuilder");
const generateCustomerLedgerHTML = require("../templates/customerLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

const getStartOfDay = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);

  return date;
};

const getEndOfDay = (value) => {
  if (!value) return null;

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return null;
  }

  date.setHours(23, 59, 59, 999);

  return date;
};

const resolveSourceLabel = (entry = {}) => {
  if (entry.originModule === "travel_receive_payment" && entry.sourceType === "receive_payment") {
    return "Travel Payment";
  }

  if (entry.originModule === "travel_invoice" && entry.sourceType === "receive_payment") {
    return "Travel Invoice Payment";
  }

  if (entry.originModule === "travel_refund" && entry.sourceType === "refund_payment") {
    return "Travel Refund Payment";
  }

  if (entry.sourceType === "travel_booking") {
    return "Travel Invoice";
  }

  if (entry.sourceType === "travel_refund") {
    return "Travel Refund";
  }

  switch (entry.sourceType) {
    case "opening_sale_invoice":
      return "Opening Balance";

    case "opening_refund_invoice":
      return "Opening Balance";

    case "sale_invoice":
      return "Sale Invoice";

    case "receive_payment":
      return "Receive Payment";

    case "receive_payment_discount":
      return "Receive Payment Discount";

    case "refund_invoice":
      return "Refund Invoice";

    case "purchase_invoice":
      return "Purchase Invoice";

    case "opening_purchase_invoice":
      return "Opening Balance";

    case "purchase_return":
      return "Purchase Return";

    case "opening_purchase_return":
      return "Opening Balance";

    case "pay_bill":
      return "Pay Bill";

    default:
      return "-";
  }
};

const fetchCustomerLedgerData = async ({
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

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const customerObjectId = new mongoose.Types.ObjectId(customerId);

  // ✅ Security: customer must belong to logged-in user
  const customer = await Customer.findOne({
    _id: customerObjectId,
    createdBy: userObjectId,
  })
    .populate("account")
    .lean();

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

  const accountObjectId = new mongoose.Types.ObjectId(account);

  const start = getStartOfDay(startDate);
  const end = getEndOfDay(endDate);
  const travelJournalFilter =
    moduleScope === "travel" ? getTravelCustomerJournalFilter() : {};

  const matchFilter = {
    createdBy: userObjectId,
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

  let opening = 0;

  if (start) {
    const openingResult = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: userObjectId,
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

    opening = Number(openingResult[0]?.balance || 0);
  }

  const entries = await JournalEntry.find(matchFilter)
    .select(
      [
        "date",
        "time",
        "billNo",
        "sourceType",
        "description",
        "originModule",
        "invoiceId",
        "referenceId",
        "lines.account",
        "lines.type",
        "lines.amount",
      ].join(" "),
    )
    .sort({
      date: 1,
      time: 1,
      _id: 1,
    })
    .lean();

  const ledger = [];

  for (const entry of entries) {
    if (!Array.isArray(entry.lines)) {
      continue;
    }

    for (const line of entry.lines) {
      if (line.account?.toString() !== accountObjectId.toString()) {
        continue;
      }

      const amount = Number(line.amount || 0);

      const debit = line.type === "debit" ? amount : 0;
      const credit = line.type === "credit" ? amount : 0;

      ledger.push({
        _id: entry._id,

        date: entry.date,

        time: entry.time || "",

        billNo: entry.billNo || "",

        description: entry.description || "",

        sourceType: entry.sourceType || "",

        sourceLabel: resolveSourceLabel(entry),

        originModule: entry.originModule || "",

        invoiceId: entry.invoiceId || null,

        referenceId: entry.referenceId || null,

        debit,

        credit,
      });
    }
  }

  return {
    customerName: customer.name || "-",
    openingBalance: opening,
    ledger,
  };
};

const getCustomerLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { customerId } = req.params;

    const { startDate, endDate, size, lang, moduleScope = "" } = req.query;

    const rawData = await fetchCustomerLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildCustomerLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

    const html = generateCustomerLedgerHTML(built, size || "A5");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate ledger HTML");
  }
};

const generateCustomerLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const { customerId } = req.params;

    const { startDate, endDate, size, lang, moduleScope = "" } = req.query;

    const rawData = await fetchCustomerLedgerData({
      customerId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildCustomerLedgerPrint({
      customerName: rawData.customerName,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

    const html = generateCustomerLedgerHTML(built, size || "A5");

    const pdfBuffer = await generatePdfFromHtml(html);

    res.set({
      "Content-Type": "application/pdf",

      "Content-Disposition": "attachment; filename=Customer-Ledger.pdf",

      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Ledger PDF Error:", error.message);

    return res.status(500).json({
      message: "Ledger PDF generation failed",
    });
  }
};

module.exports = {
  getCustomerLedgerHtml,
  generateCustomerLedgerPdf,
};
