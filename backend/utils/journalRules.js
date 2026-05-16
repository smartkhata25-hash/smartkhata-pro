// utils/journalRules.js

const JOURNAL_RULES = {
  Asset: {
    allowed: ["debit", "credit"],
    normal: "debit",
  },
  Liability: {
    allowed: ["debit", "credit"],
    normal: "credit",
  },
  Equity: {
    allowed: ["debit", "credit"],
    normal: "credit",
  },
  Income: {
    allowed: ["debit", "credit"],
    normal: "credit",
  },
  Expense: {
    allowed: ["debit", "credit"],
    normal: "debit",
  },
};

module.exports = JOURNAL_RULES;
