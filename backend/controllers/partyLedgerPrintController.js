// 📁 controllers/partyLedgerPrintController.js

const mongoose = require("mongoose");

const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");

const buildPartyLedgerPrint = require("../services/partyLedgerPrintBuilder");
const generatePartyLedgerHTML = require("../templates/partyLedgerTemplate");
const { generatePdfFromHtml } = require("../services/pdfService");

/* =========================================================
   SOURCE LABEL HELPER
========================================================= */

const getPartySourceLabel = (entry) => {
  const type = entry.sourceType || "";

  if (type === "opening_balance") return "Opening Balance";

  if (type === "sale_invoice") return "Sale Invoice";
  if (type === "opening_sale_invoice") return "Opening Balance";

  if (type === "refund_invoice") return "Sale Return";
  if (type === "opening_refund_invoice") return "Opening Balance";

  if (type === "purchase_invoice") return "Purchase Invoice";
  if (type === "opening_purchase_invoice") return "Opening Balance";

  if (type === "purchase_return") return "Purchase Return";
  if (type === "opening_purchase_return") return "Opening Balance";

  if (type === "receive_payment") return "Receive Payment";
  if (type === "receive_payment_discount") return "Receive Payment Discount";

  if (type === "pay_bill") return "Pay Bill";
  if (type === "purchase_payment") return "Purchase Payment";
  if (type === "purchase_return_payment") return "Purchase Return Payment";

  if (type === "refund_payment") return "Refund Payment";
  if (type === "sale_discount") return "Sale Discount";
  if (type === "purchase_discount") return "Purchase Discount";

  if (type === "manual") return "Manual Entry";
  if (type === "adjustment") return "Adjustment";
  if (type === "expense") return "Expense";

  return type || "-";
};

/* =========================================================
   INTERNAL: FETCH PARTY LEDGER DATA
========================================================= */

const fetchPartyLedgerData = async ({
  partyId,
  userId,
  startDate,
  endDate,
}) => {
  if (!mongoose.Types.ObjectId.isValid(partyId)) {
    throw new Error("Invalid party ID");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const party = await Party.findOne({
    _id: partyId,
    userId: userObjectId,
    isDeleted: false,
  }).populate("account");

  if (!party || !party.account) {
    throw new Error("Party not found");
  }

  const account =
    typeof party.account === "object" && party.account?._id
      ? party.account._id
      : party.account;

  const accountObjectId = new mongoose.Types.ObjectId(account);

  let start = null;
  let end = null;

  if (startDate) {
    start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
  }

  if (endDate) {
    end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
  }

  const matchFilter = {
    createdBy: userObjectId,
    isDeleted: false,
    sourceType: { $ne: "reversal" },
    "lines.account": accountObjectId,
  };

  if (start && end) {
    matchFilter.date = { $gte: start, $lte: end };
  } else if (start) {
    matchFilter.date = { $gte: start };
  } else if (end) {
    matchFilter.date = { $lte: end };
  }

  /* ================================
     Opening Balance before startDate
  ================================ */

  let openingBalance = 0;

  if (start) {
    const result = await JournalEntry.aggregate([
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

    openingBalance = Number(result[0]?.balance || 0);
  }

  /* ================================
     Ledger Entries
  ================================ */

  const entries = await JournalEntry.find(matchFilter)
    .select(
      "date time billNo description sourceType originModule lines paymentType createdAt",
    )
    .sort({ date: 1, time: 1, createdAt: 1 })
    .lean();

  const ledger = [];

  for (const entry of entries) {
    for (const line of entry.lines || []) {
      if (line.account?.toString() !== account.toString()) continue;

      const debit = line.type === "debit" ? Number(line.amount || 0) : 0;
      const credit = line.type === "credit" ? Number(line.amount || 0) : 0;

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
    partyName: party.name,
    partyPhone: party.phone || "",
    role: party.role || "both",
    openingBalance,
    ledger,
  };
};

/* =========================================================
   GET PARTY LEDGER HTML
========================================================= */

const getPartyLedgerHtml = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchPartyLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyLedgerPrint({
      partyName: rawData.partyName,
      partyPhone: rawData.partyPhone,
      role: rawData.role,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = req.query.lang || "ur";

    const html = generatePartyLedgerHTML(built, size || "A5");

    res.set({
      "Content-Type": "text/html",
    });

    return res.send(html);
  } catch (error) {
    console.error("❌ Party Ledger HTML Error:", error.message);

    return res.status(500).send("Failed to generate party ledger HTML");
  }
};

/* =========================================================
   GENERATE PARTY LEDGER PDF
========================================================= */

const generatePartyLedgerPdf = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { partyId } = req.params;
    const { startDate, endDate, size } = req.query;

    const rawData = await fetchPartyLedgerData({
      partyId,
      userId,
      startDate,
      endDate,
    });

    const built = buildPartyLedgerPrint({
      partyName: rawData.partyName,
      partyPhone: rawData.partyPhone,
      role: rawData.role,
      startDate,
      endDate,
      openingBalance: rawData.openingBalance,
      ledger: rawData.ledger,
    });

    built.lang = req.query.lang || "ur";

    const html = generatePartyLedgerHTML(built, size || "A5");

    const pdfBuffer = await generatePdfFromHtml(html);

    const safePartyName = String(rawData.partyName || "Party")
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

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
