const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const { MODULE_SCOPES, applyModuleScopeFilter } = require("./moduleScope");
const {
  ensureExpenseTitleScopeIndex,
  normalizeExpenseTitleName,
} = require("./ensureExpenseTitleScopeIndex");
const {
  buildExpenseTitleScopeFilter,
  normalizeExpenseTitleScope,
} = require("./expenseTitleScope");

const LEGACY_DEFAULT_TITLE_SCOPE = MODULE_SCOPES.BOTH;

const tradingAndTravelDefaultTitles = Object.freeze([
  { name: "Electricity Bill", match: "utility" },
  { name: "Gas Bill", match: "utility" },
  { name: "Water Bill", match: "utility" },
  { name: "Internet Bill", match: "utility" },
  { name: "Mobile Load", match: "utility" },
  { name: "Telephone Bill", match: "utility" },

  { name: "Office Rent", match: "rent" },
  { name: "Shop Rent", match: "rent" },
  { name: "Warehouse Rent", match: "rent" },

  { name: "Salary Expense", match: "salary" },
  { name: "Wages", match: "salary" },
  { name: "Staff Salary", match: "salary" },

  { name: "Petrol", match: "transport" },
  { name: "Fuel Expense", match: "transport" },
  { name: "Delivery Charges", match: "transport" },
  { name: "Transport Expense", match: "transport" },
  { name: "Rickshaw / Loader", match: "transport" },

  { name: "Office Maintenance", match: "maintenance" },
  { name: "Repair Expense", match: "maintenance" },
  { name: "Equipment Repair", match: "maintenance" },

  { name: "Marketing Expense", match: "marketing" },
  { name: "Advertisement", match: "marketing" },
  { name: "Facebook Ads", match: "marketing" },
  { name: "Google Ads", match: "marketing" },
  { name: "Printing & Banners", match: "marketing" },

  { name: "Packing Material", match: "purchase" },
  { name: "Office Supplies", match: "purchase" },
  { name: "Stationery", match: "purchase" },

  { name: "Tea Expense", match: "other" },
  { name: "Lunch Expense", match: "other" },
  { name: "Staff Food", match: "other" },

  { name: "Bank Charges", match: "other" },
  { name: "Transaction Fee", match: "other" },

  { name: "Tax Payment", match: "other" },
  { name: "Government Fee", match: "other" },

  { name: "General Expense", match: "other" },
  { name: "Misc Expense", match: "other" },
  { name: "Other Expense", match: "other" },
]);

const weavingDefaultTitles = Object.freeze([
  { name: "Electricity Bill", code: "WEAVING_POWER_EXP" },
  { name: "Power Expense", code: "WEAVING_POWER_EXP" },
  { name: "Salary Expense", code: "WEAVING_SALARY_EXP" },
  { name: "Wages", code: "WEAVING_SALARY_EXP" },
  { name: "Sizing Charges", code: "WEAVING_SIZING_EXP" },
  { name: "Folding Charges", code: "WEAVING_FOLDING_EXP" },
  { name: "Loom Repair", code: "WEAVING_MAINTENANCE_EXP" },
  { name: "Machine Maintenance", code: "WEAVING_MAINTENANCE_EXP" },
  { name: "Factory Rent", code: "WEAVING_RENT_EXP" },
  { name: "Transport Expense", code: "WEAVING_TRANSPORT_EXP" },
  { name: "General Expense", code: "WEAVING_OTHER_EXP" },
  { name: "Other Expense", code: "WEAVING_OTHER_EXP" },
]);

const getDefinitionsForScope = (scope) =>
  scope === MODULE_SCOPES.WEAVING
    ? weavingDefaultTitles
    : tradingAndTravelDefaultTitles;

const getAccountScopeForTitleScope = (scope) =>
  scope === MODULE_SCOPES.WEAVING
    ? MODULE_SCOPES.WEAVING
    : MODULE_SCOPES.TRADING;

const findAccountForTitle = (accounts, definition) => {
  if (definition.code) {
    return accounts.find((account) => account.code === definition.code);
  }

  if (definition.match === "other") {
    return accounts.find((account) => account.code === "OTHER_EXP");
  }

  return accounts.find((account) => account.category === definition.match);
};

const createDefaultExpenseTitlesForUser = async (userId, options = {}) => {
  const moduleScope = normalizeExpenseTitleScope(
    options.moduleScope || LEGACY_DEFAULT_TITLE_SCOPE,
    LEGACY_DEFAULT_TITLE_SCOPE,
  );

  try {
    await ensureExpenseTitleScopeIndex();

    const accountQuery = {
      userId,
      type: "Expense",
      isActive: { $ne: false },
    };

    applyModuleScopeFilter(
      accountQuery,
      getAccountScopeForTitleScope(moduleScope),
    );

    const accounts = await Account.find(accountQuery).lean();
    const definitions = getDefinitionsForScope(moduleScope);

    for (const definition of definitions) {
      const account = findAccountForTitle(accounts, definition);

      if (!account) {
        console.log("No account found for default expense title:", {
          name: definition.name,
          code: definition.code,
          match: definition.match,
          moduleScope,
        });
        continue;
      }

      const existingTitle = await ExpenseTitle.findOne({
        userId,
        isDeleted: false,
        normalizedName: normalizeExpenseTitleName(definition.name),
        ...buildExpenseTitleScopeFilter(moduleScope),
      }).select("_id");

      if (existingTitle) {
        continue;
      }

      await ExpenseTitle.create({
        name: definition.name,
        userId,
        categoryId: account._id,
        moduleScope,
        isDefault: true,
        isDeleted: false,
      });
    }

    console.log("Default Expense Titles ensured for user:", {
      userId: userId.toString(),
      moduleScope,
    });
  } catch (error) {
    console.error("Error creating default expense titles:", error);
  }
};

module.exports = createDefaultExpenseTitlesForUser;
