const path = require("path");
const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config();

const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const { MODULE_SCOPES, normalizeModuleScope } = require("../utils/moduleScope");
const { accountBelongsToScope, getDefinition, getExpectedCode, isValidDefaultAccount } = require("../utils/expenseTitleDefaults");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const requestedUserId = args.find((arg) => arg.startsWith("--userId="))?.split("=")[1] || "";
const requestedScope = args.find((arg) => arg.startsWith("--scope="))?.split("=")[1] || "all";
const allowedScopes = new Set(["all", MODULE_SCOPES.TRADING, MODULE_SCOPES.TRAVEL, MODULE_SCOPES.WEAVING]);
if (args.includes("--dry-run") && apply) throw new Error("Choose either --dry-run or --apply, not both.");
if (requestedUserId && !mongoose.Types.ObjectId.isValid(requestedUserId)) throw new Error("--userId must be a valid ObjectId.");
if (!allowedScopes.has(requestedScope)) throw new Error("--scope must be trading, travel, weaving or all.");

const totals = { usersScanned: 0, titlesScanned: 0, validTitles: 0, crossUserLinks: 0, missingAccountLinks: 0, inactiveAccountLinks: 0, wrongScopeLinks: 0, repairableTitles: 0, repairedTitles: 0, unresolvedTitles: 0, errors: 0 };

const reasonFor = (account, userId, scope) => {
  if (!account) return "missing-account";
  if (String(account.userId) !== String(userId)) return "cross-user";
  if (account.isActive === false) return "inactive-account";
  if (account.type !== "Expense") return "wrong-account-type";
  if (!accountBelongsToScope(account, scope)) return "wrong-scope";
  return "mapping-mismatch";
};

const recordReason = (reason) => {
  if (reason === "cross-user") totals.crossUserLinks += 1;
  else if (reason === "missing-account") totals.missingAccountLinks += 1;
  else if (reason === "inactive-account") totals.inactiveAccountLinks += 1;
  else if (reason === "wrong-scope") totals.wrongScopeLinks += 1;
};

const processUser = async (userId) => {
  const titleFilter = { userId, isDeleted: { $ne: true }, ...(requestedScope === "all" ? {} : { moduleScope: requestedScope }) };
  const titles = await ExpenseTitle.find(titleFilter).lean();
  const ownAccounts = await Account.find({ userId, type: "Expense" }).lean();
  const referencedIds = [...new Set(titles.map((title) => String(title.categoryId || "")).filter(Boolean))];
  const referencedAccounts = await Account.find({ _id: { $in: referencedIds } }).lean();
  const referencedById = new Map(referencedAccounts.map((account) => [String(account._id), account]));
  const operations = [];
  totals.usersScanned += 1;

  for (const title of titles) {
    totals.titlesScanned += 1;
    const scope = normalizeModuleScope(title.moduleScope, MODULE_SCOPES.TRADING);
    const current = referencedById.get(String(title.categoryId || ""));
    const definition = getDefinition(title.name, scope);
    let replacement = null;
    let valid = false;

    if (title.isDefault === true && definition) {
      valid = isValidDefaultAccount({ account: current, userId, scope, definition });
      replacement = ownAccounts.find((account) => account.code === getExpectedCode(definition, scope) && isValidDefaultAccount({ account, userId, scope, definition })) || null;
      if (!isValidDefaultAccount({ account: replacement, userId, scope, definition })) replacement = null;
    } else {
      valid = Boolean(current) && String(current.userId) === String(userId) && current.type === "Expense" && current.isActive !== false && accountBelongsToScope(current, scope);
      if (!valid && current?.code) {
        const candidates = ownAccounts.filter((account) => account.code === current.code && account.type === "Expense" && account.isActive !== false && accountBelongsToScope(account, scope));
        if (candidates.length === 1) replacement = candidates[0];
      }
    }

    if (valid) { totals.validTitles += 1; continue; }
    const reason = reasonFor(current, userId, scope);
    recordReason(reason);
    if (!replacement) {
      totals.unresolvedTitles += 1;
      console.log(JSON.stringify({ classification: "UNRESOLVED", titleId: String(title._id), name: title.name, userId: String(userId), moduleScope: scope, oldCategoryId: String(title.categoryId || ""), reason }));
      continue;
    }
    totals.repairableTitles += 1;
    console.log(JSON.stringify({ classification: "REPAIRABLE", titleId: String(title._id), name: title.name, userId: String(userId), moduleScope: scope, oldCategoryId: String(title.categoryId || ""), newCategoryId: String(replacement._id), reason }));
    if (apply) operations.push({ updateOne: { filter: { _id: title._id, userId }, update: { $set: { categoryId: replacement._id } } } });
  }
  if (apply && operations.length) {
    const result = await ExpenseTitle.bulkWrite(operations, { ordered: true });
    totals.repairedTitles += result.modifiedCount || 0;
  }
};

const main = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
  if (!mongoUri) throw new Error("MongoDB connection URI is not configured.");
  await mongoose.connect(mongoUri);
  const userIds = requestedUserId ? [new mongoose.Types.ObjectId(requestedUserId)] : await ExpenseTitle.distinct("userId");
  for (const userId of userIds) {
    try { await processUser(userId); } catch (error) { totals.errors += 1; console.error(JSON.stringify({ userId: String(userId), error: error.message })); }
  }
  console.log(JSON.stringify({ mode: apply ? "APPLY" : "DRY_RUN", ...totals }, null, 2));
  if (totals.errors) process.exitCode = 1;
};

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
