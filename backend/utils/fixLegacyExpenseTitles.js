const mongoose = require("mongoose");
const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const { MODULE_SCOPES, normalizeModuleScope } = require("./moduleScope");
const { accountBelongsToScope, getDefinition, getExpectedCode, isValidDefaultAccount } = require("./expenseTitleDefaults");

const repairExpenseTitles = async (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("A valid userId is required to repair Expense Titles.");
  }

  const [titles, accounts] = await Promise.all([
    ExpenseTitle.find({ userId, isDeleted: { $ne: true } }).sort({ createdAt: 1, _id: 1 }),
    Account.find({ userId, type: "Expense", isActive: { $ne: false } }).lean(),
  ]);
  const accountsById = new Map(accounts.map((account) => [String(account._id), account]));
  const summary = { scanned: titles.length, valid: 0, repaired: 0, unresolved: 0 };

  for (const title of titles) {
    const scope = normalizeModuleScope(title.moduleScope, MODULE_SCOPES.TRADING);
    const current = accountsById.get(String(title.categoryId || ""));
    const definition = getDefinition(title.name, scope);

    if (title.isDefault === true && definition) {
      if (isValidDefaultAccount({ account: current, userId, scope, definition })) {
        summary.valid += 1;
        continue;
      }
      const replacement = accounts.find((account) => account.code === getExpectedCode(definition, scope) && isValidDefaultAccount({ account, userId, scope, definition }));
      if (isValidDefaultAccount({ account: replacement, userId, scope, definition })) {
        title.categoryId = replacement._id;
        await title.save();
        summary.repaired += 1;
      } else {
        summary.unresolved += 1;
        console.warn("Default Expense Title requires manual category review", { titleId: String(title._id), userId: String(userId), moduleScope: scope });
      }
      continue;
    }

    const currentIsSafe = current && String(current.userId) === String(userId) && current.type === "Expense" && current.isActive !== false && accountBelongsToScope(current, scope);
    if (currentIsSafe) summary.valid += 1;
    else {
      summary.unresolved += 1;
      console.warn("Custom Expense Title requires manual category review", { titleId: String(title._id), userId: String(userId), moduleScope: scope });
    }
  }

  return summary;
};

module.exports = repairExpenseTitles;
