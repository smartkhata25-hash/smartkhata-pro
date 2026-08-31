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
      moduleScope: "trading",
    },
    {
      name: "sales",
      type: "Income",
      category: "other",
      code: "SALES",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "sales discount",
      type: "Expense",
      category: "discount",
      code: "SALES_DISCOUNT",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "receive payment discount",
      type: "Expense",
      category: "discount",
      code: "RECEIVE_PAYMENT_DISCOUNT",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "sales return",
      type: "Income",
      category: "other",
      code: "SALES_RETURN",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "purchase",
      type: "Expense",
      category: "purchase",
      code: "PURCHASE",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "purchase discount",
      type: "Income",
      category: "discount",
      code: "PURCHASE_DISCOUNT",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "purchase return",
      type: "Income",
      category: "other",
      code: "PURCHASE_RETURN",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "inventory",
      type: "Asset",
      category: "other",
      code: "INVENTORY",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "cogs",
      type: "Expense",
      category: "cogs",
      code: "COGS",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },

    // 🔒 LIABILITY ACCOUNTS
    {
      name: "Business Loan",
      type: "Liability",
      category: "loan",
      code: "BUSINESS_LOAN",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Bank Loan",
      type: "Liability",
      category: "loan",
      code: "BANK_LOAN",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Supplier Payable",
      type: "Liability",
      category: "supplier",
      code: "SUPPLIER_PAYABLE",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Credit Payable",
      type: "Liability",
      category: "credit",
      code: "CREDIT_PAYABLE",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Tax Payable",
      type: "Liability",
      category: "tax",
      code: "TAX_PAYABLE",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Other Liability",
      type: "Liability",
      category: "other",
      code: "OTHER_LIABILITY",
      normalBalance: "credit",
      isSystem: true,
      moduleScope: "trading",
    },
    {
      name: "Loan Receivable",
      type: "Asset",
      category: "receivable",
      code: "LOAN_RECEIVABLE",
      normalBalance: "debit",
      isSystem: true,
      moduleScope: "trading",
    },

    // 🔓 USER ACCOUNTS
    {
      name: "Utility Expense",
      type: "Expense",
      category: "utility",
      code: "UTILITY_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Rent Expense",
      type: "Expense",
      category: "rent",
      code: "RENT_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Salary Expense",
      type: "Expense",
      category: "salary",
      code: "SALARY_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Transport Expense",
      type: "Expense",
      category: "transport",
      code: "TRANSPORT_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Marketing Expense",
      type: "Expense",
      category: "marketing",
      code: "MARKETING_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Maintenance Expense",
      type: "Expense",
      category: "maintenance",
      code: "MAINTENANCE_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },
    {
      name: "Other Expense",
      type: "Expense",
      category: "other_expense",
      code: "OTHER_EXP",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "trading",
    },

    // 💳 SHARED PAYMENT ACCOUNTS
    // ایک ہی account دونوں modules میں استعمال ہوگا،
    // لیکن Trading اور Travel balance الگ calculate ہوگا۔
    {
      name: "HANDCASH",
      type: "Asset",
      category: "cash",
      code: "HANDCASH",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "both",
    },
    {
      name: "BANK",
      type: "Asset",
      category: "bank",
      code: "BANK",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "both",
    },
    {
      name: "JAZZCASH",
      type: "Asset",
      category: "online",
      code: "JAZZCASH",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "both",
    },
    {
      name: "EASYPAISA",
      type: "Asset",
      category: "online",
      code: "EASYPAISA",
      normalBalance: "debit",
      isSystem: false,
      moduleScope: "both",
    },
  ];

  for (const acc of baseAccounts) {
    const isSharedPaymentAccount = acc.moduleScope === "both";

    await Account.findOneAndUpdate(
      {
        userId,
        code: acc.code,
      },
      {
        $setOnInsert: {
          userId,
          name: acc.name,
          type: acc.type,
          category: acc.category,
          code: acc.code,
          normalBalance: acc.normalBalance,
          openingBalance: 0,
          isSystem: acc.isSystem,
          isActive: true,
        },

        // Existing HANDCASH/BANK/EASYPAISA/JAZZCASH بھی درست ہو جائیں۔
        ...(isSharedPaymentAccount
          ? {
              $set: {
                moduleScope: "both",
              },
            }
          : {}),
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );
  }
};

module.exports = createBaseAccountsForUser;
