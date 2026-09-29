const ExpenseTitle = require("../models/ExpenseTitle");
const Expense = require("../models/Expense");
const Account = require("../models/Account");
const { MODULE_SCOPES } = require("./moduleScope");

const DEFAULT_TITLE_CATEGORIES = new Map([
  ["electricity bill", "utility"], ["gas bill", "utility"], ["water bill", "utility"], ["internet bill", "utility"], ["mobile load", "utility"], ["telephone bill", "utility"],
  ["office rent", "rent"], ["shop rent", "rent"], ["warehouse rent", "rent"], ["salary expense", "salary"], ["wages", "salary"], ["staff salary", "salary"],
  ["petrol", "transport"], ["fuel expense", "transport"], ["delivery charges", "transport"], ["transport expense", "transport"], ["rickshaw / loader", "transport"],
  ["office maintenance", "maintenance"], ["repair expense", "maintenance"], ["equipment repair", "maintenance"], ["marketing expense", "marketing"], ["advertisement", "marketing"],
  ["facebook ads", "marketing"], ["google ads", "marketing"], ["printing & banners", "marketing"], ["packing material", "purchase"], ["office supplies", "purchase"], ["stationery", "purchase"],
  ["tea expense", "other_expense"], ["lunch expense", "other_expense"], ["staff food", "other_expense"], ["bank charges", "other_expense"], ["transaction fee", "other_expense"],
  ["tax payment", "other_expense"], ["government fee", "other_expense"], ["general expense", "other_expense"], ["misc expense", "other_expense"], ["other expense", "other_expense"],
]);
const normalizeName = (name = "") => String(name || "").trim().toLowerCase();
const validScopes = new Set([MODULE_SCOPES.TRADING, MODULE_SCOPES.TRAVEL, MODULE_SCOPES.WEAVING]);
const getAccountScope = (account) => validScopes.has(account?.moduleScope) ? account.moduleScope : null;

const findDefaultAccount = (accounts, scope, normalizedName) => {
  const category = DEFAULT_TITLE_CATEGORIES.get(normalizedName);
  return category && accounts.find((account) => getAccountScope(account) === scope && account.category === category);
};

const repairExpenseTitles = async (userId = null) => {
  const userFilter = userId ? { userId } : {};
  const [titles, accounts] = await Promise.all([
    ExpenseTitle.find(userFilter).sort({ createdAt: 1, _id: 1 }).lean(),
    Account.find({ ...userFilter, type: "Expense", isActive: { $ne: false } }).lean(),
  ]);
  const originalById = new Map(titles.map((title) => [String(title._id), title]));
  const accountsById = new Map(accounts.map((account) => [String(account._id), account]));
  const resolved = titles.map((title) => {
    const normalizedName = normalizeName(title.name);
    const category = accountsById.get(String(title.categoryId || ""));
    const scope = getAccountScope(category) || (validScopes.has(title.moduleScope) ? title.moduleScope : null) || MODULE_SCOPES.TRADING;
    const replacement = (!category || getAccountScope(category) !== scope) && title.isDefault
      ? findDefaultAccount(accounts, scope, normalizedName)
      : null;
    return { ...title, normalizedName, moduleScope: scope, categoryId: replacement?._id || title.categoryId };
  });
  const groups = new Map();
  for (const title of resolved) {
    if (title.isDeleted !== true) {
      const key = `${title.userId}:${title.moduleScope}:${title.normalizedName}`;
      groups.set(key, [...(groups.get(key) || []), title]);
    }
  }
  for (const titlesInGroup of groups.values()) {
    titlesInGroup.sort((left, right) => {
      const leftIsValid = getAccountScope(accountsById.get(String(left.categoryId || ""))) === left.moduleScope;
      const rightIsValid = getAccountScope(accountsById.get(String(right.categoryId || ""))) === right.moduleScope;
      if (leftIsValid !== rightIsValid) return leftIsValid ? -1 : 1;
      return String(left._id).localeCompare(String(right._id));
    });
  }
  const updates = [];
  for (const title of resolved) {
    if (title.isDeleted === true) continue;
    const key = `${title.userId}:${title.moduleScope}:${title.normalizedName}`;
    const canonical = (groups.get(key) || [])[0];
    if (canonical && String(canonical._id) !== String(title._id)) {
      await Expense.updateMany({ userId: title.userId, titleId: title._id }, { $set: { titleId: canonical._id } });
      updates.push({ updateOne: { filter: { _id: title._id }, update: { $set: { isDeleted: true, normalizedName: `${title.normalizedName}__retired__${title._id}` } } } });
      continue;
    }
    const original = originalById.get(String(title._id));
    if (title.normalizedName !== original.normalizedName || title.moduleScope !== original.moduleScope || String(title.categoryId || "") !== String(original.categoryId || "") || original.isDeleted !== false) {
      updates.push({ updateOne: { filter: { _id: title._id }, update: { $set: { normalizedName: title.normalizedName, moduleScope: title.moduleScope, categoryId: title.categoryId, isDeleted: false } } } });
    }
  }
  if (updates.length) await ExpenseTitle.bulkWrite(updates, { ordered: true });
};

module.exports = repairExpenseTitles;
