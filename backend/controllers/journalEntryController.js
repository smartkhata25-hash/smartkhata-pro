const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");
const Account = require("../models/Account");
const JOURNAL_RULES = require("../utils/journalRules");
const { createReversalEntry } = require("../utils/journalReversal");
const { logAudit } = require("../utils/auditHelper");
const { isPeriodLocked } = require("../utils/periodLockHelper");

// ✅ Helper: Check if entry is balanced
const isBalanced = (lines) => {
  const debit = lines
    .filter((l) => l.type === "debit")
    .reduce((sum, l) => sum + l.amount, 0);
  const credit = lines
    .filter((l) => l.type === "credit")
    .reduce((sum, l) => sum + l.amount, 0);
  return debit === credit;
};

// ✅ Helper: Recalculate all involved accounts
const recalculateInvolvedAccounts = async (lines) => {
  const uniqueAccounts = [
    ...new Set(lines.map((line) => line.account.toString())),
  ];
  for (let accId of uniqueAccounts) {
    await recalculateAccountBalance(accId);
  }
};

// ✅ Create Entry
exports.createEntry = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const {
      date,
      time,
      description,
      lines,
      customerId,
      supplierId,
      billNo,
      paymentType,
      sourceType,
      attachmentUrl,
      attachmentType,
      invoiceId,
      invoiceModel,
      referenceId,
    } = req.body;

    // 🔒 PERIOD LOCK CHECK (CREATE)
    if (await isPeriodLocked(userId, date)) {
      return res.status(403).json({
        message: "This accounting period is locked.",
      });
    }

    if (!lines || lines.length < 2) {
      return res.status(400).json({ message: "کم از کم دو لائنز ہونی چاہئیں" });
    }

    if (!isBalanced(lines)) {
      return res
        .status(400)
        .json({ message: "Total Debit اور Credit برابر ہونے چاہئیں" });
    }

    const accountIds = lines.map((l) => l.account);
    const accounts = await Account.find({ _id: { $in: accountIds } });

    for (const line of lines) {
      const account = accounts.find(
        (a) => a._id.toString() === line.account.toString(),
      );

      if (!account) {
        return res.status(400).json({
          message: "غلط اکاؤنٹ استعمال کیا گیا ہے",
        });
      }

      const rule = JOURNAL_RULES[account.type];
      if (!rule) {
        return res.status(400).json({
          message: `اکاؤنٹ ٹائپ ${account.type} کے لیے رولز موجود نہیں`,
        });
      }

      if (!rule.allowed.includes(line.type)) {
        return res.status(400).json({
          message: `${account.type} اکاؤنٹ کو ${line.type} نہیں کیا جا سکتا`,
        });
      }

      if (!line.amount || line.amount <= 0) {
        return res.status(400).json({
          message: "رقم صفر یا منفی نہیں ہو سکتی",
        });
      }
    }

    const entry = new JournalEntry({
      date,
      time,
      description,
      lines,
      customerId: customerId || null,
      supplierId: supplierId || null,
      billNo: billNo || "",
      paymentType: paymentType || "",
      sourceType: sourceType || "manual",
      attachmentUrl: attachmentUrl || "",
      attachmentType: attachmentType || "",
      invoiceId: invoiceId || null,
      invoiceModel: invoiceModel || null,
      referenceId: referenceId || null,
      createdBy: userId,
      isDeleted: false,
    });

    await entry.save();
    await recalculateInvolvedAccounts(lines);
    await logAudit({
      userId,
      action: "CREATE",
      entityType: "JournalEntry",
      entityId: entry._id,
      before: null,
      after: entry.toObject(),
    });

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Update Entry
exports.updateEntry = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const {
      date,
      time,
      description,
      lines,
      billNo,
      paymentType,
      sourceType,
      attachmentUrl,
      attachmentType,
      invoiceId,
      invoiceModel,
      customerId,
      supplierId,
      referenceId,
    } = req.body;

    if (!lines || lines.length < 2) {
      return res.status(400).json({ message: "کم از کم دو لائنز ہونی چاہئیں" });
    }

    if (!isBalanced(lines)) {
      return res
        .status(400)
        .json({ message: "Total Debit اور Credit برابر ہونے چاہئیں" });
    }

    const accountIds = lines.map((l) => l.account);
    const accounts = await Account.find({ _id: { $in: accountIds } });

    for (const line of lines) {
      const account = accounts.find(
        (a) => a._id.toString() === line.account.toString(),
      );

      if (!account) {
        return res.status(400).json({
          message: "غلط اکاؤنٹ استعمال کیا گیا ہے",
        });
      }

      const rule = JOURNAL_RULES[account.type];
      if (!rule) {
        return res.status(400).json({
          message: `اکاؤنٹ ٹائپ ${account.type} کے لیے رولز موجود نہیں`,
        });
      }

      // ❌ allowed debit / credit check
      if (!rule.allowed.includes(line.type)) {
        return res.status(400).json({
          message: `${account.type} اکاؤنٹ کو ${line.type} نہیں کیا جا سکتا`,
        });
      }

      // ❌ zero / negative amount protection
      if (!line.amount || line.amount <= 0) {
        return res.status(400).json({
          message: "رقم صفر یا منفی نہیں ہو سکتی",
        });
      }
    }

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!entry) {
      return res
        .status(404)
        .json({ message: "Entry نہیں ملی یا delete ہو چکی ہے" });
    }

    // 🔒 PERIOD LOCK CHECK (UPDATE)
    if (await isPeriodLocked(userId, date)) {
      return res.status(403).json({
        message: "This accounting period is locked.",
      });
    }

    const beforeUpdate = entry.toObject();

    const oldLines = entry.lines;

    entry.date = date;
    entry.time = time;
    entry.description = description;
    entry.lines = lines;
    entry.customerId = customerId || null;
    entry.supplierId = supplierId || null;
    entry.billNo = billNo || "";
    entry.paymentType = paymentType || "";
    entry.sourceType = sourceType || "manual";
    entry.attachmentUrl = attachmentUrl || "";
    entry.attachmentType = attachmentType || "";
    entry.invoiceId = invoiceId || null;
    entry.invoiceModel = invoiceModel || null;
    entry.referenceId = referenceId || null;

    await entry.save();
    await recalculateInvolvedAccounts([...oldLines, ...lines]);
    await logAudit({
      userId,
      action: "UPDATE",
      entityType: "JournalEntry",
      entityId: entry._id,
      before: beforeUpdate,
      after: entry.toObject(),
    });

    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
// ✅ Get All Entries
exports.getEntries = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { startDate, endDate } = req.query;
    const page = parseInt(req.query.page || "1");
    const limit = parseInt(req.query.limit || "20");
    const skip = (page - 1) * limit;

    const filter = { createdBy: userId, isDeleted: false };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const entries = await JournalEntry.find(filter)
      .populate("lines.account")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);
    const total = await JournalEntry.countDocuments(filter);

    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

exports.deleteEntry = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!entry) {
      return res.status(404).json({
        message: "Journal entry not found or already deleted.",
      });
    }

    // 🔒 PERIOD LOCK CHECK (DELETE / REVERSE)
    if (await isPeriodLocked(userId, entry.date)) {
      return res.status(403).json({
        message: "This accounting period is locked.",
      });
    }

    // 🔒 Prevent reversing invoice-linked locked entries
    if (entry.sourceType === "sale_invoice" && entry.referenceId) {
      return res.status(403).json({
        message:
          "Invoice-linked journal entries cannot be deleted or reversed.",
      });
    }

    if (entry.isReversed) {
      return res.status(400).json({
        message: "This journal entry has already been reversed.",
      });
    }

    // 🔁 Create reversal entry
    const reversal = await createReversalEntry(entry, userId);
    await logAudit({
      userId,
      action: "REVERSE",
      entityType: "JournalEntry",
      entityId: entry._id,
      before: entry.toObject(),
      after: null,
    });

    entry.isDeleted = true;
    await entry.save();

    await recalculateInvolvedAccounts([...entry.lines, ...reversal.lines]);

    res.json({
      message: "Journal entry reversed successfully.",
      reversalEntryId: reversal._id,
    });
  } catch (err) {
    res.status(500).json({
      message: "Failed to reverse journal entry.",
      error: err.message,
    });
  }
};

// ✅ Trial Balance (Optimized Professional Version)

exports.getTrialBalance = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);
    const { startDate, endDate } = req.query;

    const matchFilter = {
      createdBy: userId,
      isDeleted: false,
    };

    if (startDate && endDate) {
      matchFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 🔥 Aggregate ALL accounts in ONE query
    const summary = await JournalEntry.aggregate([
      { $match: matchFilter },
      { $unwind: "$lines" },

      {
        $group: {
          _id: "$lines.account",
          totalDebit: {
            $sum: {
              $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
            },
          },
          totalCredit: {
            $sum: {
              $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
            },
          },
        },
      },
    ]);

    // 🔹 Get all accounts
    const accounts = await Account.find({ userId });

    const trialBalance = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const acc of accounts) {
      const accSummary = summary.find(
        (s) => s._id.toString() === acc._id.toString(),
      );

      const dr = accSummary?.totalDebit || 0;
      const cr = accSummary?.totalCredit || 0;

      let netBalance = 0;

      if (acc.normalBalance === "debit") {
        netBalance = dr - cr;
      } else {
        netBalance = cr - dr;
      }

      let debit = 0;
      let credit = 0;

      if (netBalance > 0) {
        if (acc.normalBalance === "debit") {
          debit = netBalance;
        } else {
          credit = netBalance;
        }
      }

      if (netBalance < 0) {
        if (acc.normalBalance === "debit") {
          credit = Math.abs(netBalance);
        } else {
          debit = Math.abs(netBalance);
        }
      }

      if (debit !== 0 || credit !== 0) {
        trialBalance.push({
          accountId: acc._id,
          accountName: acc.name,
          debit,
          credit,
        });

        totalDebit += debit;
        totalCredit += credit;
      }
    }

    res.json({
      trialBalance,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
    });
  } catch (err) {
    res.status(500).json({
      message: "Trial balance error",
      error: err.message,
    });
  }
};

// ✅ Ledger by Account (with Opening Balance)
exports.getLedgerByAccount = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { accountId } = req.params;

    // 🔍 Fetch account to get normalBalance
    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const { startDate, endDate } = req.query;

    // ✅ Correctly cast accountId to ObjectId
    const objectId = new mongoose.Types.ObjectId(accountId);

    const filter = {
      createdBy: userId,
      "lines.account": objectId,
      isDeleted: false,
    };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 🔢 All matching entries for date range
    const entries = await JournalEntry.find(filter)
      .populate("lines.account")
      .sort({ date: 1 })
      .limit(500);

    let balance = 0;
    const ledger = [];

    let openingBalance = 0;

    if (startDate) {
      const openingEntries = await JournalEntry.find({
        createdBy: userId,
        "lines.account": accountId,
        date: { $lt: new Date(startDate) },
        isDeleted: false,
      });

      openingEntries.forEach((entry) => {
        entry.lines.forEach((line) => {
          if (line.account && line.account.toString() === accountId) {
            const debit = line.type === "debit" ? line.amount : 0;
            const credit = line.type === "credit" ? line.amount : 0;

            if (account.normalBalance === "debit") {
              openingBalance += debit - credit;
            } else {
              openingBalance += credit - debit;
            }
          }
        });
      });

      balance = openingBalance;

      ledger.push({
        date: null,
        description: "Opening Balance",
        debit: 0,
        credit: 0,
        balance,
        isOpening: true,
      });
    }

    // 🔁 Entries with running balance
    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const accId = line.account?._id?.toString() || line.account?.toString();
        const targetId = accountId.toString();

        if (accId === targetId) {
          const debit = line.type === "debit" ? line.amount : 0;
          const credit = line.type === "credit" ? line.amount : 0;

          // 🔥 NEW LOGIC BASED ON ACCOUNT TYPE
          if (account.normalBalance === "debit") {
            balance += debit - credit;
          } else {
            balance += credit - debit;
          }

          ledger.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time,
            description: entry.description,
            billNo: entry.billNo || "",
            paymentType: entry.paymentType || "",
            sourceType: entry.sourceType || "",
            invoiceId: entry.invoiceId || null,
            attachmentUrl: entry.attachmentUrl || "",
            attachmentType: entry.attachmentType || "",
            debit,
            credit,
            balance,
            isOpening: false,
          });
        }
      });
    });

    res.json({
      openingBalance,
      ledger,
    });
  } catch (error) {
    console.error("❌ Ledger error:", error);
    res.status(500).json({ message: "Ledger error", error: error.message });
  }
};

// ✅ Monthly Cash Flow Summary for Dashboard (Professional Version)

exports.getMonthlyCashFlow = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    // ✅ Year from query (fallback current year)
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year}-12-31`);

    const objectUserId = new mongoose.Types.ObjectId(userId);

    // 🔥 Aggregate directly from database (FAST)
    const data = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          date: { $gte: start, $lte: end },
        },
      },

      { $unwind: "$lines" },

      {
        $lookup: {
          from: "accounts",
          localField: "lines.account",
          foreignField: "_id",
          as: "account",
        },
      },

      { $unwind: "$account" },

      {
        $match: {
          "account.category": { $in: ["cash", "bank"] },
        },
      },

      {
        $group: {
          _id: {
            month: { $month: "$date" },
            type: "$lines.type",
          },
          total: { $sum: "$lines.amount" },
        },
      },
    ]);

    const inflow = new Array(12).fill(0);
    const outflow = new Array(12).fill(0);

    data.forEach((row) => {
      const monthIndex = row._id.month - 1;

      if (row._id.type === "credit") {
        inflow[monthIndex] = row.total;
      }

      if (row._id.type === "debit") {
        outflow[monthIndex] = row.total;
      }
    });

    const labels = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    res.json({
      year,
      labels,
      inflow,
      outflow,
    });
  } catch (err) {
    console.error("Cash flow error:", err);
    res.status(500).json({
      message: "Cash flow error",
      error: err.message,
    });
  }
};
