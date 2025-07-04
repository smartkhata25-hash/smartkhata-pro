const asyncHandler = require("express-async-handler");
const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");

// 🧠 Aging Buckets Calculator
const calculateAgingBuckets = (lines, fromDate, toDate) => {
  const now = new Date();
  const aging = {
    recent: 0,
    mid1: 0,
    mid2: 0,
    oldest: 0,
  };

  lines.forEach((line) => {
    if (!line.account || !line.type || line.type !== "debit") return;

    const entryDate = new Date(line.date || line.createdAt || Date.now());
    if (fromDate && entryDate < new Date(fromDate)) return;
    if (toDate && entryDate > new Date(toDate)) return;

    const days = Math.floor((now - entryDate) / (1000 * 60 * 60 * 24));
    const amount = Number(line.amount || 0);
    if (amount <= 0) return;

    if (days <= 30) aging.recent += amount;
    else if (days <= 60) aging.mid1 += amount;
    else if (days <= 90) aging.mid2 += amount;
    else aging.oldest += amount;
  });

  return aging;
};

// ✅ GET /api/aging-report
const getAgingReport = asyncHandler(async (req, res) => {
  const { fromDate, toDate } = req.query;

  const customers = await Customer.find({}).lean();

  const results = await Promise.all(
    customers.map(async (customer) => {
      if (!customer.account) return null; // ✅ Skip if no account

      const journalEntries = await JournalEntry.find({
        isDeleted: { $ne: true },
        "lines.account": customer.account,
      }).lean();

      const customerLines = journalEntries.flatMap((entry) =>
        entry.lines
          .filter(
            (line) =>
              line.account?.toString() === customer.account?.toString() &&
              line.type === "debit"
          )
          .map((line) => ({
            ...line,
            date: entry.date,
            createdAt: entry.createdAt,
          }))
      );

      const aging = calculateAgingBuckets(customerLines, fromDate, toDate);
      const totalAged = aging.recent + aging.mid1 + aging.mid2 + aging.oldest;

      console.log(`🧾 Aging fetched for ${customer.name}`);

      return {
        customerId: customer._id,
        customerName: customer.name,
        aging,
        totalAged,
      };
    })
  );

  res.json(results.filter(Boolean)); // ✅ Remove nulls
});

module.exports = { getAgingReport };
