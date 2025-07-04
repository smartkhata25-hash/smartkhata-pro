// utils/journalHelper.js

// ✅ Helper to check if journal lines are balanced
exports.isBalanced = (lines = []) => {
  const debit = lines
    .filter((l) => l.type === "debit")
    .reduce((sum, l) => sum + l.amount, 0);

  const credit = lines
    .filter((l) => l.type === "credit")
    .reduce((sum, l) => sum + l.amount, 0);

  return debit === credit;
};
