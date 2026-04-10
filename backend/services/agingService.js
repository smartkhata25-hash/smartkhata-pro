const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");

const getAgingReportData = async ({ userId, asOfDate }) => {
  const reportDate = asOfDate ? new Date(asOfDate) : new Date();

  const customers = await Customer.find({ isActive: true }).lean();

  const results = [];

  for (const customer of customers) {
    if (!customer.account) continue;

    const entries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      "lines.account": customer.account,
      date: { $lte: reportDate },
    }).lean();

    let recent = 0;
    let mid1 = 0;
    let mid2 = 0;
    let oldest = 0;

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account?.toString() !== customer.account.toString()) continue;

        if (line.type !== "debit") continue;

        const days =
          (reportDate - new Date(entry.date)) / (1000 * 60 * 60 * 24);

        if (days <= 30) recent += line.amount;
        else if (days <= 60) mid1 += line.amount;
        else if (days <= 90) mid2 += line.amount;
        else oldest += line.amount;
      }
    }

    const total = recent + mid1 + mid2 + oldest;

    results.push({
      customerId: customer._id,
      customerName: customer.name,
      aging: { recent, mid1, mid2, oldest },
      total,
    });
  }

  return results;
};

module.exports = {
  getAgingReportData,
};
