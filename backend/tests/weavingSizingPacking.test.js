const assert = require("assert");
const { calculateYarnPacking, packageProfilesFor } = require("../services/weaving/weavingPacking");
const { LBS_TO_KG } = require("../services/weaving/weavingOperationsUtils");
const WeavingSizingIssue = require("../models/WeavingSizingIssue");
const WeavingYarnMovement = require("../models/WeavingYarnMovement");
const fs = require("fs");
const path = require("path");

const legacyYarn = { defaultPackageType: "bag", packageWeight: 100, packageWeightUnit: "LBS", smallConesPerPackage: 40, largeConesPerPackage: 24 };
assert.strictEqual(packageProfilesFor(legacyYarn)[0].packageType, "bag");

const bags = calculateYarnPacking({ packageType: "bag", packageQty: 10 }, legacyYarn);
assert.strictEqual(bags.quantityLbs, 1000);
assert.strictEqual(bags.quantityKg, Math.round(1000 * LBS_TO_KG * 1e6) / 1e6);
assert.strictEqual(bags.packageWeight, 100);

const mixed = calculateYarnPacking({ packageType: "bag", packageQty: 10, smallCones: 4, largeCones: 2 }, legacyYarn);
assert.strictEqual(mixed.quantityLbs, Math.round((1000 + 10 + (2 / 24) * 100) * 1e6) / 1e6);

const custom = calculateYarnPacking({ packageType: "carton", packageQty: 2, smallCones: 5 }, {
  defaultPackageType: "carton",
  packagingProfiles: [{ packageType: "carton", packageWeight: 80, smallConesPerPackage: 20, largeConesPerPackage: 10 }],
});
assert.strictEqual(custom.quantityLbs, 180);
assert.strictEqual(custom.smallConesPerPackage, 20);

assert.throws(() => calculateYarnPacking({ packageType: "bag", packageQty: -1 }, legacyYarn), /zero or positive/);
assert.throws(() => calculateYarnPacking({ packageType: "bag", packageQty: 0 }, legacyYarn), /greater than zero/);
assert.throws(() => calculateYarnPacking({ packageType: "crate", packageQty: 1 }, legacyYarn), /Invalid Package Type/);

assert.ok(WeavingSizingIssue.schema.path("lines").schema.path("quantityLbs"));
assert.ok(WeavingSizingIssue.schema.path("lines").schema.path("packageWeight"));
assert.ok(WeavingYarnMovement.schema.path("quantityLbs"));
assert.ok(WeavingYarnMovement.schema.path("packageWeight"));
const sizingSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSizingService.js"), "utf8");
assert.match(sizingSource, /createIssue: costing\.withCostingInvalidation\(atomicSave\(createIssue\)/);
assert.match(sizingSource, /updateIssue: costing\.withCostingInvalidation\(atomicSave\(updateIssue\)/);
assert.match(sizingSource, /sourceEntryUnit: "LBS"/);

console.log("weavingSizingPacking tests passed");
