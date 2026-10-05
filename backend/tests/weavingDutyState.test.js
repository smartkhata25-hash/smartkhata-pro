const assert = require("assert");
const { deriveDoubleDutyUnits } = require("../services/weaving/weavingDutyStateService");

assert.strictEqual(deriveDoubleDutyUnits([]), 0);
assert.strictEqual(deriveDoubleDutyUnits([{ status: "present", isDoubleDuty: true }]), 0);
assert.strictEqual(deriveDoubleDutyUnits([{ status: "present" }, { status: "present" }]), 1);
assert.strictEqual(deriveDoubleDutyUnits([{ status: "present" }, { status: "absent" }]), 0);
assert.strictEqual(deriveDoubleDutyUnits([{ status: "leave" }, { status: "present" }]), 0);
assert.strictEqual(deriveDoubleDutyUnits([
  { status: "present" },
  { status: "present", generatedByReplacement: true },
  { status: "present" },
]), 2);

console.log("Weaving duty-state derivation tests passed");
