const Account = require("../models/Account");

const createBaseAccountsForUser = async (userId) => {
  const baseAccounts = [
    // 🔒 SYSTEM ACCOUNTS
    {
      name: "opening balance equity",
      type: "Equity",
      category: "other",
      code: "OPENING_BALANCE",
      normalBalance: "credit",
      isSystem: true,
    },
    {
      name: "sales",
      type: "Income",
      category: "other",
      code: "SALES",
      normalBalance: "credit",
      isSystem: true,
    },
    {
      name: "sales return",
      type: "Income",
      category: "other",
      code: "SALES_RETURN",
      normalBalance: "debit",
      isSystem: true,
    },
    {
      name: "purchase",
      type: "Expense",
      category: "purchase",
      code: "PURCHASE",
      normalBalance: "debit",
      isSystem: true,
    },
    {
      name: "purchase return",
      type: "Income",
      category: "other",
      code: "PURCHASE_RETURN",
      normalBalance: "credit",
      isSystem: true,
    },
    {
      name: "inventory",
      type: "Asset",
      category: "other",
      code: "INVENTORY",
      normalBalance: "debit",
      isSystem: true,
    },
    {
      name: "cogs",
      type: "Expense",
      category: "other",
      code: "COGS",
      normalBalance: "debit",
      isSystem: true,
    },

    // 🔓 USER ACCOUNTS
    {
      name: "Utility Expense",
      type: "Expense",
      category: "utility",
      code: "UTILITY_EXP",
      normalBalance: "debit",
      isSystem: false, // ✅ IMPORTANT
    },
    {
      name: "Rent Expense",
      type: "Expense",
      category: "rent",
      code: "RENT_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "Salary Expense",
      type: "Expense",
      category: "salary",
      code: "SALARY_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "Transport Expense",
      type: "Expense",
      category: "transport",
      code: "TRANSPORT_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "Marketing Expense",
      type: "Expense",
      category: "marketing",
      code: "MARKETING_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "Maintenance Expense",
      type: "Expense",
      category: "maintenance",
      code: "MAINTENANCE_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "Other Expense",
      type: "Expense",
      category: "other",
      code: "OTHER_EXP",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "HANDCASH",
      type: "Asset",
      category: "cash",
      code: "HANDCASH",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "BANK",
      type: "Asset",
      category: "bank",
      code: "BANK",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "JAZZCASH",
      type: "Asset",
      category: "online",
      code: "JAZZCASH",
      normalBalance: "debit",
      isSystem: false,
    },
    {
      name: "EASYPAISA",
      type: "Asset",
      category: "online",
      code: "EASYPAISA",
      normalBalance: "debit",
      isSystem: false,
    },
  ];

  for (const acc of baseAccounts) {
    await Account.findOneAndUpdate(
      { userId: userId, code: acc.code },
      {
        userId: userId,
        name: acc.name,
        type: acc.type,
        category: acc.category,
        code: acc.code,
        normalBalance: acc.normalBalance,
        balance: 0,
        openingBalance: 0,
        isSystem: acc.isSystem,
      },
      { upsert: true, new: true },
    );
  }
};

module.exports = createBaseAccountsForUser;
