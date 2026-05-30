const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");

const fixLegacyExpenseTitles = async (userId) => {
  try {
    // ✅ Other Expense account
    const otherExpenseAccount = await Account.findOne({
      userId,
      code: "OTHER_EXP",
    });

    // ✅ COGS account
    const cogsAccount = await Account.findOne({
      userId,
      code: "COGS",
    });

    if (!otherExpenseAccount || !cogsAccount) {
      return;
    }

    // ✅ Titles that should belong to Other Expense
    const legacyTitles = [
      "Tea Expense",
      "Lunch Expense",
      "Staff Food",
      "Bank Charges",
      "Transaction Fee",
      "Tax Payment",
      "Government Fee",
      "General Expense",
      "Misc Expense",
      "Other Expense",
    ];

    const result = await ExpenseTitle.updateMany(
      {
        userId,
        name: { $in: legacyTitles },

        categoryId: cogsAccount._id,
      },
      {
        $set: {
          categoryId: otherExpenseAccount._id,
        },
      },
    );
  } catch (error) {
    console.error("❌ Error fixing legacy expense titles:", error.message);
  }
};

module.exports = fixLegacyExpenseTitles;
