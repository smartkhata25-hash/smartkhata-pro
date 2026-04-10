const asyncHandler = require("express-async-handler");
const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");

/* =========================================================
   AGING BUCKET CALCULATOR
========================================================= */

const calculateAgingBuckets = (entries, asOfDate) => {
  const aging = {
    recent: 0,
    mid1: 0,
    mid2: 0,
    oldest: 0,
  };

  entries.forEach((entry) => {
    const entryDate = new Date(entry.date);
    const days = Math.floor((asOfDate - entryDate) / (1000 * 60 * 60 * 24));

    const amount = entry.balance;

    if (amount <= 0) return;

    if (days <= 30) aging.recent += amount;
    else if (days <= 60) aging.mid1 += amount;
    else if (days <= 90) aging.mid2 += amount;
    else aging.oldest += amount;
  });

  return aging;
};

/* =========================================================
   GET CUSTOMER AGING REPORT
========================================================= */

const getAgingReport = asyncHandler(async (req, res) => {
  const { asOfDate } = req.query;

  const reportDate = asOfDate ? new Date(asOfDate) : new Date();

  /* ==============================
     STEP 1 — GET CUSTOMERS
  ============================== */

  const customers = await Customer.find({ isActive: true }).lean();

  if (!customers.length) {
    return res.json([]);
  }

  const accountMap = new Map();

  customers.forEach((c) => {
    if (c.account) {
      accountMap.set(c.account.toString(), c);
    }
  });

  const customerAccounts = Array.from(accountMap.keys());

  /* ==============================
     STEP 2 — GET JOURNAL ENTRIES
  ============================== */

  const journalEntries = await JournalEntry.find({
    isDeleted: { $ne: true },
    date: { $lte: reportDate },
    "lines.account": { $in: customerAccounts },
  }).lean();

  /* ==============================
     STEP 3 — GROUP CUSTOMER LINES
  ============================== */

  const customerLinesMap = {};

  journalEntries.forEach((entry) => {
    entry.lines.forEach((line) => {
      const accId = line.account?.toString();

      if (!accId || !customerAccounts.includes(accId)) return;

      if (!customerLinesMap[accId]) {
        customerLinesMap[accId] = [];
      }

      customerLinesMap[accId].push({
        type: line.type,
        amount: Number(line.amount || 0),
        date: entry.date,
      });
    });
  });

  /* ==============================
     STEP 4 — CALCULATE AGING
  ============================== */

  const results = customers.map((customer) => {
    const accId = customer.account?.toString();

    if (!accId || !customerLinesMap[accId]) {
      return {
        customerId: customer._id,
        customerName: customer.name,
        aging: {
          recent: 0,
          mid1: 0,
          mid2: 0,
          oldest: 0,
        },
        total: 0,
      };
    }

    const lines = customerLinesMap[accId];

    let runningBalance = 0;

    const entryBalances = [];

    lines
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .forEach((line) => {
        if (line.type === "debit") {
          runningBalance += line.amount;

          entryBalances.push({
            date: line.date,
            balance: line.amount,
          });
        }

        if (line.type === "credit") {
          runningBalance -= line.amount;

          let remainingCredit = line.amount;

          for (let i = 0; i < entryBalances.length; i++) {
            const item = entryBalances[i];

            if (item.balance <= 0) continue;

            const applied = Math.min(item.balance, remainingCredit);

            item.balance -= applied;

            remainingCredit -= applied;

            if (remainingCredit <= 0) break;
          }
        }
      });

    const aging = calculateAgingBuckets(entryBalances, reportDate);

    const total = aging.recent + aging.mid1 + aging.mid2 + aging.oldest;

    return {
      customerId: customer._id,
      customerName: customer.name,
      aging,
      total,
    };
  });

  /* ==============================
     FINAL RESPONSE
  ============================== */

  res.json(results);
});

module.exports = { getAgingReport };
