const assert = require("assert");
const Counter = require("../models/Counter");
const WeavingFoldingEntry = require("../models/WeavingFoldingEntry");
const { lbsFromKg } = require("../services/weaving/weavingOperationsUtils");
const { nextThanNo, _test } = require("../services/weaving/weavingFoldingService");

const run = async () => {
  assert.deepStrictEqual(_test.gradeSplit({ grade: "a", meter: 120 }), { grade: "a", goodMeter: 120, bGradeMeter: 0, rejectedMeter: 0 });
  assert.deepStrictEqual(_test.gradeSplit({ grade: "b", meter: 120 }), { grade: "b", goodMeter: 0, bGradeMeter: 120, rejectedMeter: 0 });
  assert.deepStrictEqual(_test.gradeSplit({ grade: "rejected", meter: 120 }), { grade: "rejected", goodMeter: 0, bGradeMeter: 0, rejectedMeter: 120 });
  assert.deepStrictEqual(_test.gradeSplit({ grade: "partial", meter: 120, goodMeter: 108, bGradeMeter: 5, rejectedMeter: 7 }), { grade: "partial", goodMeter: 108, bGradeMeter: 5, rejectedMeter: 7 });
  assert.throws(() => _test.gradeSplit({ grade: "partial", meter: 120, goodMeter: 108, bGradeMeter: 5, rejectedMeter: 6 }), /must equal/);

  const entry = { meter: 120, weightKg: 24, weightLbs: lbsFromKg(24), goodMeter: 108, bGradeMeter: 5, rejectedMeter: 7 };
  const split = _test.splitStockRows(entry);
  assert.strictEqual(split.length, 3);
  assert.strictEqual(split.reduce((sum, row) => sum + row.meter, 0), 120);
  assert.strictEqual(split.reduce((sum, row) => sum + row.weightKg, 0), 24);
  assert.strictEqual(split.reduce((sum, row) => sum + row.than, 0), 1);
  assert.strictEqual(lbsFromKg(10), 22.046226);

  assert.strictEqual(_test.FOLDING_THAN_COUNTER_KEY, "weaving_folding_than");
  assert.notStrictEqual(_test.FOLDING_THAN_COUNTER_KEY, "invoice");
  assert.strictEqual(_test.formatThanNo(42), "TH-000042");
  assert.strictEqual(_test.sequenceFromThanNo("TH-001274"), 1274);
  assert.strictEqual(_test.assertQualitySelection("quality-a", "quality-a"), "quality-a");
  assert.strictEqual(_test.assertQualitySelection(null, "quality-manual"), "quality-manual");
  assert.throws(() => _test.assertQualitySelection("quality-a", "quality-b"), /does not match the active Beam/);

  const originalEntryFindOne = WeavingFoldingEntry.findOne;
  const originalCounterFindOneAndUpdate = Counter.findOneAndUpdate;
  let sequence = 80;
  const counterTypes = [];
  WeavingFoldingEntry.findOne = () => ({ sort: () => ({ select: () => ({ lean: async () => ({ thanNo: "TH-000080" }) }) }) });
  Counter.findOneAndUpdate = async (filter, update) => {
    counterTypes.push(filter.type);
    if (update.$max) sequence = Math.max(sequence, update.$max.seq);
    if (update.$inc) sequence += update.$inc.seq;
    return { seq: sequence };
  };
  try {
    const numbers = await Promise.all([nextThanNo("user-1"), nextThanNo("user-1")]);
    assert.deepStrictEqual([...numbers].sort(), ["TH-000081", "TH-000082"]);
    assert.ok(counterTypes.every((type) => type === "weaving_folding_than"));
  } finally {
    WeavingFoldingEntry.findOne = originalEntryFindOne;
    Counter.findOneAndUpdate = originalCounterFindOneAndUpdate;
  }

  const operationalQuality = { name: "40x40", warpCount: "40/1", weftCount: "40/1", construction: "100x80", width: "63", brand: "Mill", cadReference: "CAD-1" };
  assert.ok(!("rate" in operationalQuality));
  assert.ok(!("cost" in operationalQuality));
  assert.ok(!("profit" in operationalQuality));
  console.log("weaving folding tests passed");
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
