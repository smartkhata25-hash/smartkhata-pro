const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");

const createDefaultExpenseTitlesForUser = async (userId) => {
  try {
    const accounts = await Account.find({
      userId,
      type: "Expense",
    });

    const findAccount = (keyword) => {
      return accounts.find((acc) => acc.category === keyword);
    };

    // 🔥 PRO LEVEL DEFAULT TITLES (REAL BUSINESS USE)
    const defaultTitles = [
      // ⚡ UTILITIES
      { name: "Electricity Bill", match: "utility" },
      { name: "Gas Bill", match: "utility" },
      { name: "Water Bill", match: "utility" },
      { name: "Internet Bill", match: "utility" },
      { name: "Mobile Load", match: "utility" },
      { name: "Telephone Bill", match: "utility" },

      // 🏠 RENT
      { name: "Office Rent", match: "rent" },
      { name: "Shop Rent", match: "rent" },
      { name: "Warehouse Rent", match: "rent" },

      // 👨‍💼 SALARY
      { name: "Salary Expense", match: "salary" },
      { name: "Wages", match: "salary" },
      { name: "Staff Salary", match: "salary" },

      // 🚗 TRANSPORT
      { name: "Petrol", match: "transport" },
      { name: "Fuel Expense", match: "transport" },
      { name: "Delivery Charges", match: "transport" },
      { name: "Transport Expense", match: "transport" },
      { name: "Rickshaw / Loader", match: "transport" },

      // 🔧 MAINTENANCE
      { name: "Office Maintenance", match: "maintenance" },
      { name: "Repair Expense", match: "maintenance" },
      { name: "Equipment Repair", match: "maintenance" },

      // 📢 MARKETING
      { name: "Marketing Expense", match: "marketing" },
      { name: "Advertisement", match: "marketing" },
      { name: "Facebook Ads", match: "marketing" },
      { name: "Google Ads", match: "marketing" },
      { name: "Printing & Banners", match: "marketing" },

      // 🛒 PURCHASE RELATED
      { name: "Packing Material", match: "purchase" },
      { name: "Office Supplies", match: "purchase" },
      { name: "Stationery", match: "purchase" },

      // 🍽️ DAILY EXPENSES
      { name: "Tea Expense", match: "other" },
      { name: "Lunch Expense", match: "other" },
      { name: "Staff Food", match: "other" },

      // 🏦 BANK / CHARGES
      { name: "Bank Charges", match: "other" },
      { name: "Transaction Fee", match: "other" },

      // 🧾 TAX / GOV
      { name: "Tax Payment", match: "other" },
      { name: "Government Fee", match: "other" },

      // 📦 MISC
      { name: "General Expense", match: "other" },
      { name: "Misc Expense", match: "other" },
      { name: "Other Expense", match: "other" },
    ];

    for (const item of defaultTitles) {
      const account = findAccount(item.match);

      if (!account) {
        console.log("❌ NO ACCOUNT FOUND FOR:", item.match);
        continue;
      }

      await ExpenseTitle.findOneAndUpdate(
        {
          name: item.name,
          userId,
        },
        {
          name: item.name,
          userId,
          categoryId: account._id,
          isDefault: true,
          isDeleted: false,
        },
        {
          upsert: true,
          new: true,
        },
      );
    }

    console.log(
      "✅ Default Expense Titles created for user:",
      userId.toString(),
    );
  } catch (error) {
    console.error("❌ Error creating default expense titles:", error);
  }
};

module.exports = createDefaultExpenseTitlesForUser;
