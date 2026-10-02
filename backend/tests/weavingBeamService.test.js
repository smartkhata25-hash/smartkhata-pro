const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { _test } = require("../services/weaving/weavingBeamService");
const serviceSource = fs.readFileSync(
  path.join(__dirname, "../services/weaving/weavingBeamService.js"),
  "utf8",
);

test("monthly knotting does not create a separate earning", () => {
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "monthly", completedBeams: 4, rate: 500 }), { amount: 0, earningKind: "none" });
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "fixed_monthly", completedBeams: 4, rate: 500 }), { amount: 0, earningKind: "none" });
});

test("per beam and monthly per beam calculate once from completed quantity", () => {
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "per_beam", completedBeams: 4, rate: 125 }), { amount: 500, earningKind: "piece" });
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "monthly_per_beam", completedBeams: 4, rate: 125 }), { amount: 500, earningKind: "bonus" });
});

test("per set rates are not multiplied by beam quantity", () => {
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "per_set", completedBeams: 8, rate: 900 }), { amount: 900, earningKind: "piece" });
  assert.deepEqual(_test.calculateKnottingEarning({ paymentMethod: "monthly_per_set", completedBeams: 8, rate: 900 }), { amount: 900, earningKind: "bonus" });
});

test("manual knotting allocates only real available beams with no Loom", () => {
  assert.match(serviceSource, /Number\.isSafeInteger\(quantity\)/);
  assert.match(serviceSource, /knottingPaymentMethod: "per_beam"/);
  assert.match(serviceSource, /status: "available",\s*knottingJobId: null/);
  assert.match(serviceSource, /entryMode: "manual"/);
  assert.match(serviceSource, /activeLoomId: null,\s*loomNumber: ""/);
  assert.match(serviceSource, /allocation\.modifiedCount !== quantity/);
});
