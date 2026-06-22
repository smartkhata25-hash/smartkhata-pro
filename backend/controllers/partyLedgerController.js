const mongoose = require("mongoose");
const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");

/* =========================================================
   GET PARTY LEDGER
   One ledger for Sale + Purchase + Receive + Pay Bill
========================================================= */

const getPartyLedger = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);
    const { partyId } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(partyId)) {
      return res.status(400).json({ message: "Invalid party ID" });
    }

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
    }).populate("account");

    if (!party || !party.account) {
      return res.status(404).json({ message: "Party not found" });
    }

    const accountId = party.account._id || party.account;
    const accountObjectId = new mongoose.Types.ObjectId(accountId);

    const matchFilter = {
      createdBy: userId,
      isDeleted: false,
      sourceType: { $ne: "reversal" },
      "lines.account": accountObjectId,
    };

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      matchFilter.date = { $gte: start, $lte: end };
    }

    /* ===============================
       Opening Balance before startDate
    =============================== */
    let openingBalance = 0;

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);

      const result = await JournalEntry.aggregate([
        {
          $match: {
            createdBy: userId,
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

      openingBalance = result[0]?.balance || 0;
    }

    /* ===============================
       Main Entries
    =============================== */
    const entries = await JournalEntry.find(matchFilter)
      .select(
        "date time billNo description sourceType originModule lines paymentType attachmentUrl attachmentType invoiceId invoiceModel referenceId partyId customerId supplierId",
      )
      .sort({ date: 1, time: 1, createdAt: 1 })
      .lean();

    let balance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const ledger = [];

    for (const entry of entries) {
      for (const line of entry.lines || []) {
        if (line.account?.toString() !== accountId.toString()) continue;

        const debit = line.type === "debit" ? Number(line.amount || 0) : 0;
        const credit = line.type === "credit" ? Number(line.amount || 0) : 0;

        balance += debit - credit;
        totalDebit += debit;
        totalCredit += credit;

        ledger.push({
          _id: entry._id,
          date: entry.date,
          time: entry.time || "",
          billNo: entry.billNo || "",
          description: entry.description || "",
          sourceType: entry.sourceType || "",
          originModule: entry.originModule || "",
          sourceLabel: getPartySourceLabel(entry),
          debit,
          credit,
          balance: Number(balance.toFixed(2)),
          runningBalance: Number(balance.toFixed(2)),
          paymentType: line.paymentType || entry.paymentType || "-",
          attachmentUrl: entry.attachmentUrl || "",
          attachmentType: entry.attachmentType || "",
          invoiceId: entry.invoiceId || null,
          invoiceModel: entry.invoiceModel || null,
          referenceId: entry.referenceId || null,
          partyId: entry.partyId || party._id,
          customerId: entry.customerId || null,
          supplierId: entry.supplierId || null,
        });
      }
    }

    return res.json({
      partyId: party._id,
      partyName: party.name,
      partyPhone: party.phone || "",
      role: party.role,
      accountId,
      openingBalance: Number(openingBalance.toFixed(2)),
      totalDebit: Number(totalDebit.toFixed(2)),
      totalCredit: Number(totalCredit.toFixed(2)),
      closingBalance: Number(balance.toFixed(2)),
      ledger,
    });
  } catch (err) {
    console.error("❌ Party Ledger Error:", err);
    return res.status(500).json({
      message: "Party ledger fetch failed",
      error: err.message,
    });
  }
};

/* =========================================================
   SOURCE LABEL HELPER
========================================================= */

const getPartySourceLabel = (entry) => {
  const type = entry.sourceType || "";

  if (type === "opening_balance") return "Opening Balance";

  if (type === "sale_invoice") return "Sale Invoice";
  if (type === "opening_sale_invoice") return "Opening Sale Invoice";

  if (type === "refund_invoice") return "Sale Return";
  if (type === "opening_refund_invoice") return "Opening Sale Return";

  if (type === "purchase_invoice") return "Purchase Invoice";
  if (type === "opening_purchase_invoice") return "Opening Purchase Invoice";

  if (type === "purchase_return") return "Purchase Return";
  if (type === "opening_purchase_return") return "Opening Purchase Return";

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

module.exports = {
  getPartyLedger,
};
