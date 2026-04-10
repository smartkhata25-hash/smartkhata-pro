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
    allowed: ["credit"],
    normal: "credit",
  },
  Income: {
    allowed: ["credit"],
    normal: "credit",
  },
  Expense: {
    allowed: ["debit"],
    normal: "debit",
  },
};

module.exports = JOURNAL_RULES;
