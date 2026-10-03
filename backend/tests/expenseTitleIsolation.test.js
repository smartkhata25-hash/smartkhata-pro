const assert = require("node:assert/strict");
const test = require("node:test");
const repairExpenseTitles = require("../utils/fixLegacyExpenseTitles");
const createBaseAccountsForUser = require("../utils/createBaseAccounts");
const defaults = require("../utils/expenseTitleDefaults");
const ExpenseTitle = require("../models/ExpenseTitle");
const Account = require("../models/Account");
const expenseController = require("../controllers/expenseController");

const userA = "64f000000000000000000001";
const userB = "64f000000000000000000002";
const accountA = "64f000000000000000000011";
const accountB = "64f000000000000000000012";
const titleId = "64f000000000000000000021";
const query = (value) => ({ sort() { return Promise.resolve(value); }, lean() { return Promise.resolve(value); } });

const withRepairData = async ({ titles, accounts }, run) => {
  const originalTitleFind = ExpenseTitle.find;
  const originalAccountFind = Account.find;
  ExpenseTitle.find = (filter) => query(titles.filter((title) => String(title.userId) === String(filter.userId)));
  Account.find = (filter) => ({ lean: async () => accounts.filter((account) => String(account.userId) === String(filter.userId) && account.type === "Expense" && account.isActive !== false) });
  try { await run(); } finally { ExpenseTitle.find = originalTitleFind; Account.find = originalAccountFind; }
};

const account = (_id, userId, code, moduleScope = "trading") => ({ _id, userId, code, moduleScope, type: "Expense", isActive: true });
const title = (userId, categoryId, name = "Delivery Charges", isDefault = true) => ({ _id: titleId, userId, categoryId, name, moduleScope: "trading", isDefault, isDeleted: false, saves: 0, async save() { this.saves += 1; } });

test("per-user repair never cross-links users and repairs a corrupted default title idempotently", async () => {
  const a = account(accountA, userA, "TRANSPORT_EXP");
  const b = account(accountB, userB, "TRANSPORT_EXP");
  const corrupted = title(userA, accountB);
  await withRepairData({ titles: [corrupted], accounts: [a, b] }, async () => {
    const first = await repairExpenseTitles(userA);
    assert.equal(String(corrupted.categoryId), accountA);
    assert.equal(first.repaired, 1);
    assert.equal(corrupted.saves, 1);
    const second = await repairExpenseTitles(userA);
    assert.equal(second.repaired, 0);
    assert.equal(second.valid, 1);
    assert.equal(corrupted.saves, 1);
  });
  assert.equal(b.userId, userB);
});

test("two owners resolve the same default title only to their own accounts", async () => {
  const a = account(accountA, userA, "TRANSPORT_EXP");
  const b = account(accountB, userB, "TRANSPORT_EXP");
  const titleA = title(userA, accountB);
  const titleB = { ...title(userB, accountA), _id: "64f000000000000000000022", async save() { this.saves += 1; } };
  await withRepairData({ titles: [titleA, titleB], accounts: [a, b] }, async () => {
    await repairExpenseTitles(userA);
    await repairExpenseTitles(userB);
  });
  assert.equal(String(titleA.categoryId), accountA);
  assert.equal(String(titleB.categoryId), accountB);
});

test("custom invalid titles remain unresolved and a missing userId is rejected", async () => {
  const custom = title(userA, accountB, "My Special Expense", false);
  await withRepairData({ titles: [custom], accounts: [account(accountA, userA, "OTHER_EXP"), account(accountB, userB, "OTHER_EXP")] }, async () => {
    const summary = await repairExpenseTitles(userA);
    assert.equal(summary.unresolved, 1);
    assert.equal(custom.saves, 0);
    assert.equal(String(custom.categoryId), accountB);
  });
  await assert.rejects(repairExpenseTitles(), /valid userId is required/);
});

test("Travel purchase provisioning and module default mappings stay isolated", async () => {
  const original = Account.findOneAndUpdate;
  const rows = [];
  Account.findOneAndUpdate = async (filter, update) => { rows.push({ filter, update }); return {}; };
  try { await createBaseAccountsForUser(userA, { includeWeaving: true }); } finally { Account.findOneAndUpdate = original; }
  const travelPurchase = rows.find((row) => row.filter.code === "TRAVEL_PURCHASE_EXP");
  assert.ok(travelPurchase);
  assert.equal(travelPurchase.update.$setOnInsert.moduleScope, "travel");
  for (const name of ["Packing Material", "Office Supplies", "Stationery"]) {
    assert.equal(defaults.getExpectedCode(defaults.getDefinition(name, "travel"), "travel"), "TRAVEL_PURCHASE_EXP");
    assert.equal(defaults.getExpectedCode(defaults.getDefinition(name, "trading"), "trading"), "PURCHASE");
  }
  assert.equal(defaults.getExpectedCode(defaults.getDefinition("Sizing Charges", "weaving"), "weaving"), "WEAVING_SIZING_EXP");
});

test("repaired same-user Trading title and HANDCASH pass unchanged expense account validation", async () => {
  const original = Account.find;
  const rows = [
    { _id: accountA, userId: userA, type: "Expense", category: "transport", moduleScope: "trading", isActive: true },
    { _id: "64f000000000000000000013", userId: userA, type: "Asset", category: "cash", moduleScope: "shared", isActive: true },
  ];
  Account.find = (filter) => ({ select() { return this; }, lean: async () => rows.filter((row) => filter._id.$in.map(String).includes(String(row._id)) && String(row.userId) === String(filter.userId) && row.isActive !== false) });
  try {
    await expenseController._validateScopedExpenseAccounts({ userId: userA, moduleScope: "trading", debitAccountId: accountA, creditEntries: [{ account: rows[1]._id, amount: 100 }] });
  } finally { Account.find = original; }
});
