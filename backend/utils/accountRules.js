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
      "employee",
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
      "discount",
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
      "cogs",
      "discount",
      "other",
    ],
    normalBalance: "debit",
  },
};

const getNormalBalance = (type, category) => {
  if (category === "drawings") {
    return "debit";
  }
  return ACCOUNT_RULES[type]?.normalBalance || "debit";
};

ACCOUNT_RULES.getNormalBalance = getNormalBalance;

module.exports = ACCOUNT_RULES;
