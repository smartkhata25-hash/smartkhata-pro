const assert = require("assert");
const { _test } = require("../services/weaving/weavingCommercialService");

assert.strictEqual(_test.mergeRoles("customer", "customer"), "customer");
assert.strictEqual(_test.mergeRoles("supplier", "supplier"), "supplier");
assert.strictEqual(_test.mergeRoles("customer", "supplier"), "both");
assert.strictEqual(_test.mergeRoles("both", "supplier"), "both");

const source = "64b000000000000000000001";
const target = "64b000000000000000000002";
const expense = "64b000000000000000000003";
const consolidated = _test.consolidateJournalLines([
  { account: source, type: "credit", amount: 120 },
  { account: target, type: "debit", amount: 20 },
  { account: expense, type: "debit", amount: 100 },
], source, target);
assert.deepStrictEqual(consolidated, [
  { account: target, type: "credit", amount: 100 },
  { account: expense, type: "debit", amount: 100 },
]);
assert.strictEqual(consolidated.filter((line) => line.type === "debit").reduce((sum, line) => sum + line.amount, 0), consolidated.filter((line) => line.type === "credit").reduce((sum, line) => sum + line.amount, 0));

console.log("weaving party merge tests passed");
