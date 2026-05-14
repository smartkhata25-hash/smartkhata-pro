const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");

const createReversalEntry = async (originalEntry, userId) => {
  const reversedLines = originalEntry.lines.map((line) => ({
    account: line.account,
    amount: line.amount,
    type: line.type === "debit" ? "credit" : "debit",
    paymentType: line.paymentType || undefined,
  }));

  const reversalEntry = new JournalEntry({
    date: new Date(),
    description: `Reversal of entry ${originalEntry._id}`,
    lines: reversedLines,
    sourceType: "reversal",
    createdBy: userId,
    isDeleted: false,
    isReversed: false,
    reversalOf: originalEntry._id,
    isReversal: true,
  });

  await reversalEntry.save();

  originalEntry.isReversed = true;
  await originalEntry.save();

  return reversalEntry;
};

module.exports = { createReversalEntry };
