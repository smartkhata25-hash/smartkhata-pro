// utils/accountRules.js

const ACCOUNT_RULES = {
  Asset: {
    allowedCategories: [
      "cash",
      "bank",
      "online",
      "cheque",
      "inventory",
      "receivable",
      "prepaid",
      "fixed",
      "other",
    ],
    normalBalance: "debit",
  },

  Liability: {
    allowedCategories: [
      "payable",
      "credit",
      "loan",
      "tax",
      "supplier",
      "other",
    ],
    normalBalance: "credit",
  },

  Equity: {
    allowedCategories: ["capital", "drawings", "other"],
    normalBalance: "credit",
  },

  Income: {
    allowedCategories: [
      "sales",
      "service",
      "discount_income",
      "other_income",
      "customer",
      "other",
    ],
    normalBalance: "credit",
  },

  Expense: {
    allowedCategories: [
      "purchase",
      "salary",
      "rent",
      "utility",
      "transport",
      "marketing",
      "maintenance",
      "supplier",
      "other_expense",
      "other",
    ],
    normalBalance: "debit",
  },
};

module.exports = ACCOUNT_RULES;
