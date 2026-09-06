const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalances } = require("../utils/accountHelper");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const JOURNAL_RULES = require("../utils/journalRules");
const { createReversalEntry } = require("../utils/journalReversal");
const { isBalanced } = require("../utils/journalHelper");
const { logAudit } = require("../utils/auditHelper");
const { isPeriodLocked } = require("../utils/periodLockHelper");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
} = require("../utils/employeePayrollOrigins");
const {
  BUSINESS_TIME_ZONE,
  buildBusinessDateRange,
  getBusinessDateKey,
  parseBusinessDateTime,
  startOfBusinessDay,
} = require("../utils/businessDate");

const TRAVEL_JOURNAL_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
  ...TRAVEL_EMPLOYEE_ORIGIN_VALUES,
  ...TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
]);

const TRAVEL_JOURNAL_SOURCE_TYPES = Object.freeze([
  "travel_booking",
  "travel_customer_advance",
  "travel_vendor_cost",
  "travel_vendor_advance",
  "travel_vendor_return",
  "travel_commission",
  "travel_refund",
  "travel_adjustment",
]);

const getTravelJournalConditions = () => [
  { originModule: { $in: TRAVEL_JOURNAL_ORIGINS } },
  { sourceType: { $in: TRAVEL_JOURNAL_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_JOURNAL_ORIGINS },
  },
];

const getTradingJournalFilter = () => ({
  $nor: getTravelJournalConditions(),
});

// ✅ Helper: Recalculate all involved accounts in one batch
const recalculateInvolvedAccounts = async (lines) => {
  const uniqueAccounts = [
    ...new Set(
      lines
        .filter((line) => line?.account)
        .map((line) => line.account.toString()),
    ),
  ];

  if (uniqueAccounts.length === 0) {
    return [];
  }

  return await recalculateAccountBalances(uniqueAccounts);
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
      partyId,
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
    const resolvedTime = time !== undefined ? time || "" : "";
    const entryDate = parseBusinessDateTime(date || new Date(), resolvedTime, {
      defaultTime: "00:00",
      label: "journal date",
    });

    if (await isPeriodLocked(userId, entryDate)) {
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

      line.amount = Number(line.amount);

      if (!line.amount || line.amount <= 0) {
        return res.status(400).json({
          message: "رقم صفر یا منفی نہیں ہو سکتی",
        });
      }
    }

    const entry = new JournalEntry({
      date: entryDate,
      time: resolvedTime,
      description,
      lines,
      customerId: customerId || null,
      supplierId: supplierId || null,
      partyId: partyId || null,
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

    console.log("🔥 STEP1 JOURNAL SAVED:", {
      supplierId,
      customerId,
      partyId,
      lines,
    });

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
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
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
      partyId,
      referenceId,
    } = req.body;

    if (!lines || lines.length < 2) {
      return res.status(400).json({
        message: "کم از کم دو لائنز ہونی چاہئیں",
      });
    }

    if (!isBalanced(lines)) {
      return res.status(400).json({
        message: "Total Debit اور Credit برابر ہونے چاہئیں",
      });
    }

    const accountIds = lines.map((l) => l.account);
    const accounts = await Account.find({
      _id: { $in: accountIds },
    });

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

      line.amount = Number(line.amount);

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
      ...getTradingJournalFilter(),
    });

    if (!entry) {
      return res.status(404).json({
        message: "Entry نہیں ملی یا delete ہو چکی ہے",
      });
    }

    // 🔒 PERIOD LOCK CHECK (UPDATE)
    if (await isPeriodLocked(userId, date)) {
      return res.status(403).json({
        message: "This accounting period is locked.",
      });
    }

    const beforeUpdate = entry.toObject();
    const oldLines = entry.lines;

    entry.date = entryDate;
    entry.time = resolvedTime;
    entry.description = description;
    entry.lines = lines;
    entry.customerId = customerId || null;
    entry.supplierId = supplierId || null;
    entry.partyId = partyId || null;
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
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
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

    const filter = {
      createdBy: userId,
      isDeleted: false,
      ...getTradingJournalFilter(),
    };

    const entryDateRange = buildBusinessDateRange({
      startDate,
      endDate,
    }).date;
    if (entryDateRange) {
      filter.date = entryDateRange;
    }

    const entries = await JournalEntry.find(filter)
      .populate("lines.account")
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await JournalEntry.countDocuments(filter);

    res.json(entries);
  } catch (err) {
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

// ✅ Delete / Reverse Trading Entry
exports.deleteEntry = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
      ...getTradingJournalFilter(),
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
    console.error("REVERSAL ERROR:", err);

    res.status(500).json({
      message: err.message,
      error: err.message,
    });
  }
};

// ✅ Trial Balance
exports.getTrialBalance = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { startDate, endDate } = req.query;

    const matchFilter = {
      createdBy: userId,
      isDeleted: false,
      ...getTradingJournalFilter(),
    };

    const trialDateRange = buildBusinessDateRange({
      startDate,
      endDate,
    }).date;
    if (trialDateRange) {
      matchFilter.date = trialDateRange;
    }

    const summary = await JournalEntry.aggregate([
      {
        $match: matchFilter,
      },
      {
        $unwind: "$lines",
      },
      {
        $group: {
          _id: "$lines.account",

          totalDebit: {
            $sum: {
              $cond: [
                {
                  $eq: ["$lines.type", "debit"],
                },
                "$lines.amount",
                0,
              ],
            },
          },

          totalCredit: {
            $sum: {
              $cond: [
                {
                  $eq: ["$lines.type", "credit"],
                },
                "$lines.amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    const accounts = await Account.find({
      userId,
    });

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

// ✅ Ledger by Account
exports.getLedgerByAccount = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);
    const { accountId } = req.params;

    const account = await Account.findById(accountId);

    if (!account) {
      return res.status(404).json({
        message: "Account not found",
      });
    }

    const { startDate, endDate } = req.query;

    const objectId = new mongoose.Types.ObjectId(accountId);

    const filter = {
      createdBy: userId,
      "lines.account": objectId,
      isDeleted: false,
      ...getTradingJournalFilter(),
    };

    const ledgerDateRange = buildBusinessDateRange({
      startDate,
      endDate,
    }).date;
    if (ledgerDateRange) {
      filter.date = ledgerDateRange;
    }

    const entries = await JournalEntry.find(filter)
      .populate("lines.account")
      .sort({
        date: 1,
      });

    let balance = 0;

    const ledger = [];

    let openingBalance = 0;

    if (startDate) {
      const openingEntries = await JournalEntry.find({
        createdBy: userId,
        "lines.account": objectId,
        date: {
          $lt: startOfBusinessDay(startDate),
        },
        isDeleted: false,
        ...getTradingJournalFilter(),
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

    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const accId = line.account?._id?.toString() || line.account?.toString();

        const targetId = accountId.toString();

        if (accId === targetId) {
          const debit = line.type === "debit" ? line.amount : 0;

          const credit = line.type === "credit" ? line.amount : 0;

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

    res.status(500).json({
      message: "Ledger error",
      error: error.message,
    });
  }
};

// ✅ Monthly Cash Flow Summary for Dashboard
exports.getMonthlyCashFlow = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const year =
      parseInt(req.query.year) ||
      Number(getBusinessDateKey(new Date()).slice(0, 4));

    const start = startOfBusinessDay(`${year}-01-01`);
    const end = startOfBusinessDay(`${year + 1}-01-01`);

    const objectUserId = new mongoose.Types.ObjectId(userId);

    const data = await JournalEntry.aggregate([
      {
        $match: {
          createdBy: objectUserId,
          isDeleted: false,
          date: {
            $gte: start,
            $lt: end,
          },
          ...getTradingJournalFilter(),
        },
      },

      {
        $unwind: "$lines",
      },

      {
        $lookup: {
          from: "accounts",
          localField: "lines.account",
          foreignField: "_id",
          as: "account",
        },
      },

      {
        $unwind: "$account",
      },

      {
        $match: {
          "account.category": {
            $in: ["cash", "bank"],
          },
        },
      },

      {
        $group: {
          _id: {
            month: {
              $month: {
                date: "$date",
                timezone: BUSINESS_TIME_ZONE,
              },
            },
            type: "$lines.type",
          },

          total: {
            $sum: "$lines.amount",
          },
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
