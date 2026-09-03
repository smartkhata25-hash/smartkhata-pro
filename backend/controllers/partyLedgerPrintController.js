// 📁 controllers/partyLedgerPrintController.js

const mongoose = require("mongoose");

const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");

const buildPartyLedgerPrint = require("../services/partyLedgerPrintBuilder");
const generatePartyLedgerHTML = require("../templates/partyLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  getRequestedModuleScope,
  normalizeModuleScope,
} = require("../utils/moduleScope");
const {
  TRAVEL_PARTY_OPENING_ORIGIN,
} = require("../services/travel/travelCounterpartyService");

const TRAVEL_PARTY_LEDGER_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  TRAVEL_PARTY_OPENING_ORIGIN,
]);

const getLedgerModuleScope = (query = {}) =>
  normalizeModuleScope(
    getRequestedModuleScope(query, MODULE_SCOPES.TRADING),
    MODULE_SCOPES.TRADING,
  );

const applyPartyLedgerJournalScope = (match, moduleScope) => {
  if (moduleScope === MODULE_SCOPES.TRAVEL) {
    match.originModule = {
      $in: TRAVEL_PARTY_LEDGER_ORIGINS,
    };

    return match;
  }

  match.$and = [
    ...(match.$and || []),
    {
      $or: [
        { originModule: { $exists: false } },
        { originModule: null },
        { originModule: "" },
        { originModule: { $nin: TRAVEL_PARTY_LEDGER_ORIGINS } },
      ],
    },
  ];

  return match;
};

const getPartySourceLabel = (entry) => {
  const type = entry.sourceType || "";

  if (type === "opening_balance") return "Opening Balance";
  if (entry.originModule === TRAVEL_PARTY_OPENING_ORIGIN) {
    return "Travel Opening Balance";
  }

  if (type === "sale_invoice") return "Sale Invoice";
  if (type === "opening_sale_invoice") return "Opening Balance";

  if (type === "refund_invoice") return "Sale Return";
  if (type === "opening_refund_invoice") return "Opening Balance";

  if (type === "purchase_invoice") return "Purchase Invoice";
  if (type === "opening_purchase_invoice") return "Opening Balance";

  if (type === "purchase_return") return "Purchase Return";
  if (type === "opening_purchase_return") return "Opening Balance";

  if (type === "receive_payment") return "Receive Payment";
  if (type === "travel_booking") return "Travel Invoice";
  if (type === "travel_vendor_cost") return "Travel Vendor Cost";
  if (type === "travel_refund") return "Travel Refund";
  if (type === "travel_vendor_return") return "Travel Vendor Return";
  if (type === "receive_payment_discount") {
    return "Receive Payment Discount";
  }

  if (type === "pay_bill") return "Pay Bill";
  if (type === "purchase_payment") return "Purchase Payment";
  if (type === "purchase_return_payment") {
    return "Purchase Return Payment";
  }

  if (type === "refund_payment") return "Refund Payment";
  if (type === "sale_discount") return "Sale Discount";
  if (type === "purchase_discount") return "Purchase Discount";

  if (type === "manual") return "Manual Entry";
  if (type === "adjustment") return "Adjustment";
  if (type === "expense") return "Expense";

  return type || "-";
};

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

const fetchPartyLedgerData = async ({
  partyId,
  userId,
  startDate,
  endDate,
  moduleScope = MODULE_SCOPES.TRADING,
}) => {
  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    throw new Error("Invalid party ID");
  }

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const partyObjectId = new mongoose.Types.ObjectId(partyId);
  const userObjectId = new mongoose.Types.ObjectId(userId);

  const party = await Party.findOne(
    applyModuleScopeFilter(
      {
        _id: partyObjectId,
        userId: userObjectId,
        isDeleted: false,
      },
      moduleScope,
    ),
  )
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

  const accountObjectId = new mongoose.Types.ObjectId(account);

  const start = getStartOfDay(startDate);
  const end = getEndOfDay(endDate);

  const matchFilter = applyPartyLedgerJournalScope(
    {
      createdBy: userObjectId,
      isDeleted: false,
      sourceType: { $ne: "reversal" },
      "lines.account": accountObjectId,
    },
    moduleScope,
  );

  if (start || end) {
    matchFilter.date = {};

    if (start) {
      matchFilter.date.$gte = start;
    }

    if (end) {
      matchFilter.date.$lte = end;
    }
  }

  let openingBalance = 0;

  if (start) {
    const result = await JournalEntry.aggregate([
      {
        $match: {
          ...applyPartyLedgerJournalScope(
            {
              createdBy: userObjectId,
              isDeleted: false,
              sourceType: { $ne: "reversal" },
              "lines.account": accountObjectId,
              date: {
                $lt: start,
              },
            },
            moduleScope,
          ),
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

  const entries = await JournalEntry.find(matchFilter)
    .select(
      [
        "date",
        "time",
        "billNo",
        "description",
        "sourceType",
        "originModule",
        "paymentType",
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
        date: entry.date,
        time: entry.time || "",
        billNo: entry.billNo || "",
        description: entry.description || "",
        sourceType: entry.sourceType || "",
        originModule: entry.originModule || "",
        sourceLabel: getPartySourceLabel(entry),
        debit,
        credit,
        paymentType: line.paymentType || entry.paymentType || "",
      });
    }
  }

  return {
    partyName: party.name || "-",
    partyPhone: party.phone || "",
    role: party.role || "both",
    moduleScope,
    openingBalance: Number(openingBalance.toFixed(2)),
    ledger,
  };
};

const getPartyLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;

    const { startDate, endDate, size, lang } = req.query;
    const moduleScope = getLedgerModuleScope(req.query);

    const rawData = await fetchPartyLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildPartyLedgerPrint({
      partyName: rawData.partyName,
      partyPhone: rawData.partyPhone,
      role: rawData.role,
      moduleScope: rawData.moduleScope,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

    const html = generatePartyLedgerHTML(built, size || "A5");

    res.set({
      "Content-Type": "text/html; charset=utf-8",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Party Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate party ledger HTML");
  }
};

const generatePartyLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;

    const { startDate, endDate, size, lang } = req.query;
    const moduleScope = getLedgerModuleScope(req.query);

    const rawData = await fetchPartyLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
      moduleScope,
    });

    const built = buildPartyLedgerPrint({
      partyName: rawData.partyName,
      partyPhone: rawData.partyPhone,
      role: rawData.role,
      moduleScope: rawData.moduleScope,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = lang || "ur";

    const html = generatePartyLedgerHTML(built, size || "A5");

    const pdfBuffer = await generatePdfFromHtml(html);

    const safePartyName =
      String(rawData.partyName || "Party")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "Party";

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${safePartyName}-Ledger.pdf`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("❌ Party Ledger PDF Error:", error.message);

    return res.status(500).json({
      message: "Party ledger PDF generation failed",
    });
  }
};

module.exports = {
  getPartyLedgerHtml,
  generatePartyLedgerPdf,
};
