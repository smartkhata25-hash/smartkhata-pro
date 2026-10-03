const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const { MODULE_SCOPES, applyModuleScopeFilter } = require("./moduleScope");
const {
  ensureExpenseTitleScopeIndex,
  normalizeExpenseTitleName,
} = require("./ensureExpenseTitleScopeIndex");
const {
  normalizeExpenseTitleScope,
} = require("./expenseTitleScope");
const {
  getDefinition: getDefaultDefinition,
  getExpectedCode,
  isValidDefaultAccount,
} = require("./expenseTitleDefaults");

const DEFAULT_TITLE_SCOPE = MODULE_SCOPES.TRADING;

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
  scope;

const createDefaultExpenseTitlesForUser = async (userId, options = {}) => {
  const moduleScope = normalizeExpenseTitleScope(
    options.moduleScope || DEFAULT_TITLE_SCOPE,
    DEFAULT_TITLE_SCOPE,
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

    const seedingErrors = [];

    for (const definition of definitions) {
      const defaultDefinition = getDefaultDefinition(definition.name, moduleScope);
      const account = accounts.find((candidate) =>
        candidate.code === getExpectedCode(defaultDefinition, moduleScope) &&
        isValidDefaultAccount({ account: candidate, userId, scope: moduleScope, definition: defaultDefinition }));

      if (!account) {
        console.log("No account found for default expense title:", {
          name: definition.name,
          code: definition.code,
          match: definition.match,
          moduleScope,
        });
        continue;
      }

      const normalizedName = normalizeExpenseTitleName(definition.name);

      try {
        const activeTitle = await ExpenseTitle.findOne({
          userId,
          normalizedName,
          moduleScope,
          isDeleted: { $ne: true },
        });

        if (activeTitle) {
          if (activeTitle.isDefault === true) {
            const linkedAccount = accounts.find((candidate) => String(candidate._id) === String(activeTitle.categoryId || ""));
            if (!isValidDefaultAccount({ account: linkedAccount, userId, scope: moduleScope, definition: defaultDefinition })) {
              activeTitle.categoryId = account._id;
            }
            if (activeTitle.isDeleted !== false) activeTitle.isDeleted = false;
            await activeTitle.save();
          } else {
            const linkedAccount = accounts.find((candidate) => String(candidate._id) === String(activeTitle.categoryId || ""));
            if (!linkedAccount || String(linkedAccount.userId) !== String(userId) || linkedAccount.type !== "Expense" || linkedAccount.isActive === false) {
              console.warn("Custom Expense Title requires manual category review", { titleId: String(activeTitle._id), userId: String(userId), moduleScope });
            }
          }

          continue;
        }

        const retiredTitle = await ExpenseTitle.findOne({
          userId,
          normalizedName,
          moduleScope,
          isDeleted: true,
        });

        if (retiredTitle) {
          retiredTitle.isDeleted = false;

          if (retiredTitle.isDefault === true) {
            retiredTitle.categoryId = account._id;
          }

          await retiredTitle.save();
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
      } catch (error) {
        console.error("Default Expense Title seed failed:", {
          userId: userId.toString(),
          moduleScope,
          title: definition.name,
          error: error.message,
        });
        seedingErrors.push(error);
      }
    }

    if (seedingErrors.length > 0) {
      throw new Error(
        `Failed to seed ${seedingErrors.length} default expense title(s) for ${moduleScope}`,
      );
    }

    console.log("Default Expense Titles ensured for user:", {
      userId: userId.toString(),
      moduleScope,
    });
  } catch (error) {
    console.error("Error creating default expense titles:", error);
    throw error;
  }
};

module.exports = createDefaultExpenseTitlesForUser;
