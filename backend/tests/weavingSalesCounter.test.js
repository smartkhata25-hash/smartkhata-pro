const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Execute the production allocator with a small atomic-update adapter, without
// connecting to or changing a live database.
const sequences = [
  ["weaving_sales_invoice", "WeavingSalesInvoice", "invoiceNo", "WS"],
  ["weaving_kacchi", "WeavingKacchiParchi", "kacchiNo", "KC"],
  ["weaving_pakki", "WeavingPakkiSettlement", "pakkiNo", "PK"],
  ["weaving_rejection_receipt", "WeavingRejectionReceipt", "receiptNo", "RR"],
  ["weaving_receive_payment", "WeavingMoneyTransaction", "transactionNo", "RCV"],
];
let records = {}, counters = new Map();
const session = {};
const evaluate = (expression, row) => {
  if (expression === "$seq") return row.seq;
  if (typeof expression !== "object" || expression === null) return expression;
  if (expression.$ifNull) return evaluate(expression.$ifNull[0], row) ?? expression.$ifNull[1];
  if (expression.$max) return Math.max(...expression.$max.map((value) => evaluate(value, row)));
  if (expression.$add) return expression.$add.reduce((sum, value) => sum + evaluate(value, row), 0);
  throw new Error("Unexpected counter expression");
};
const models = {
  Counter: { async findOneAndUpdate(filter, pipeline, options) {
    assert.strictEqual(options.session, session);
    assert(options.upsert && options.new && options.setDefaultsOnInsert === false);
    const key = `${filter.userId}:${filter.type}`;
    const row = { seq: counters.get(key) };
    row.seq = evaluate(pipeline[0].$set.seq, row);
    counters.set(key, row.seq);
    return row;
  } },
};
for (const [, model, field] of sequences) models[model] = {
  find(filter) {
    assert.deepStrictEqual(Object.keys(filter).sort(), [field, "userId"].sort());
    return {
      select(selected) { assert.strictEqual(selected, field); return this; },
      lean() { return this; },
      session(active) {
        assert.strictEqual(active, session);
        return Promise.resolve((records[model] || []).filter((row) => row.userId === filter.userId && new RegExp(filter[field].$regex).test(row[field])));
      },
    };
  },
};
const context = { module: { exports: {} }, require(name) {
  if (name === "./weavingCostingService") return { withCostingInvalidation: (fn) => fn };
  return models[path.basename(name)] || {};
} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8") + "\nmodule.exports.allocateForTest = allocateNo;", context);
const allocate = (type, prefix, user = "user") => context.module.exports.allocateForTest(user, type, prefix, 5, session);
(async () => {
  for (const [type, model, field, prefix] of sequences) {
    for (const seq of [undefined, 0, 3, 5, 20]) {
      records = { [model]: [1, 2, 5].map((n) => ({ userId: "user", [field]: `${prefix}-${String(n).padStart(5, "0")}`, status: "void" })) };
      records[model].push({ userId: "other", [field]: `${prefix}-99999` }, { userId: "user", [field]: `${prefix}-invalid` });
      counters = new Map(seq === undefined ? [] : [[`user:${type}`, seq]]);
      const before = JSON.stringify(records);
      const next = Math.max(seq || 0, 5) + 1;
      assert.strictEqual(await allocate(type, prefix), `${prefix}-${String(next).padStart(5, "0")}`);
      const parallel = await Promise.all(Array.from({ length: 8 }, () => allocate(type, prefix)));
      assert.strictEqual(new Set(parallel).size, 8, "atomic updates must allocate distinct numbers");
      assert.strictEqual(counters.get(`user:${type}`), next + 8);
      assert.strictEqual(JSON.stringify(records), before, "existing documents must remain untouched");
    }
    records = {}; counters = new Map();
    assert.strictEqual(await allocate(type, prefix), `${prefix}-00001`);
    // Simulate legacy data restored after this process has already allocated.
    records[model] = [{ userId: "user", [field]: `${prefix}-99999` }, { userId: "user", [field]: `${prefix}-100000` }];
    assert.strictEqual(await allocate(type, prefix), `${prefix}-100001`);
  }
  console.log("Sales counter reconciliation: all five sequences, missing/behind/ahead, restored data, numeric width and concurrent adapter allocations passed");
})().catch((error) => { console.error(error); process.exitCode = 1; });
