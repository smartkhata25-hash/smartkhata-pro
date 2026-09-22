const assert = require("assert");
const fs = require("fs");
const path = require("path");

const WeavingFabricMovement = require("../models/WeavingFabricMovement");
const WeavingStockAdjustment = require("../models/WeavingStockAdjustment");
const WeavingYarnMovement = require("../models/WeavingYarnMovement");
const stockControl = require("../services/weaving/weavingStockControlService");
const yarnStock = require("../services/weaving/weavingYarnStockService");

const source = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingStockControlService.js"), "utf8");
const backupSource = fs.readFileSync(path.join(__dirname, "../services/backupService.js"), "utf8");
const restoreSource = fs.readFileSync(path.join(__dirname, "../services/restoreService.js"), "utf8");
const permissionSource = fs.readFileSync(path.join(__dirname, "../utils/permissionList.js"), "utf8");
const routeSource = fs.readFileSync(path.join(__dirname, "../routes/weavingStockControlRoutes.js"), "utf8");
const sizingSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSizingService.js"), "utf8");

assert.ok(WeavingFabricMovement.schema.path("movementType").enumValues.includes("quality_transfer_out"));
assert.ok(WeavingFabricMovement.schema.path("movementType").enumValues.includes("quality_transfer_in"));
assert.ok(WeavingYarnMovement.schema.path("movementType").enumValues.includes("transfer_out"));
assert.ok(WeavingYarnMovement.schema.path("movementType").enumValues.includes("transfer_in"));
assert.ok(WeavingYarnMovement.schema.path("movementType").enumValues.includes("rewinder_recovery"));
assert.ok(WeavingFabricMovement.schema.paths.stockAdjustmentId);
assert.ok(WeavingYarnMovement.schema.paths.stockAdjustmentId);

const adjustmentIndexes = WeavingStockAdjustment.schema.indexes();
assert.ok(adjustmentIndexes.some(([fields, options]) => fields.requestKey === 1 && options.unique));
assert.ok(adjustmentIndexes.some(([fields, options]) => fields.adjustmentNo === 1 && options.unique));
assert.ok(adjustmentIndexes.some(([fields, options]) => fields.recoverySourceKey === 1 && options.unique));

assert.strictEqual(stockControl._test.fabricGrade("normal"), "a");
assert.strictEqual(stockControl._test.fabricGrade("b"), "b");
assert.strictEqual(stockControl._test.sameBucket(
  { yarnId: "y1", godownId: "g1", category: "", ownershipType: "party", ownerPartyId: "p1" },
  { yarnId: "y1", godownId: "g1", category: "", ownershipType: "party", ownerPartyId: "p1" },
  "yarnId",
), true);
assert.strictEqual(stockControl._test.sameBucket(
  { yarnId: "y1", godownId: "g1", category: "", ownershipType: "party", ownerPartyId: "p1" },
  { yarnId: "y2", godownId: "g1", category: "", ownershipType: "party", ownerPartyId: "p1" },
  "yarnId",
), false);
assert.doesNotThrow(() => stockControl._test.assertAvailable({ kg: 20, packages: 2 }, { quantityKg: 20, packageQty: 2 }, [["quantityKg", "kg", "KG"], ["packageQty", "packages", "Packages"]]));
assert.throws(() => stockControl._test.assertAvailable({ kg: 19.999 }, { quantityKg: 20 }, [["quantityKg", "kg", "KG"]]), /Insufficient KG/);

const rows = [
  { itemType: "yarn", transactionType: "opening", itemId: "y1", godownId: "g1", quantity: 100 },
  { yarnId: "y1", movementType: "transfer_out", quantityKg: 20, packageQty: 2, largeCones: 2, ownershipType: "own", sourceGodownId: "g1", isVoided: false },
  { yarnId: "y2", movementType: "transfer_in", quantityKg: 20, packageQty: 2, largeCones: 2, ownershipType: "own", godownId: "g2", isVoided: false },
  { yarnId: "y2", movementType: "rewinder_recovery", quantityKg: 5, packageQty: 1, smallCones: 3, ownershipType: "own", godownId: "g2", isVoided: false },
];
const balances = yarnStock._test.accumulateEffects(rows);
const sourceBalance = balances.get(yarnStock._test.balanceKey({ yarnId: "y1", godownId: "g1", ownershipType: "own" }));
const targetBalance = balances.get(yarnStock._test.balanceKey({ yarnId: "y2", godownId: "g2", ownershipType: "own" }));
assert.strictEqual(sourceBalance.kg, 80);
assert.strictEqual(targetBalance.kg, 25);
assert.strictEqual(sourceBalance.kg + targetBalance.kg, 105);
assert.strictEqual(targetBalance.packages, 3);
assert.strictEqual(targetBalance.largeCones, 2);
assert.strictEqual(targetBalance.smallCones, 3);

const fabricCreate = source.slice(source.indexOf("const createFabricTransfer"), source.indexOf("const createYarnTransfer"));
const yarnCreate = source.slice(source.indexOf("const createYarnTransfer"), source.indexOf("const sizingReturnExists"));
const recoveryCreate = source.slice(source.indexOf("const createRewinderRecovery"), source.indexOf("const hasFabricDownstream"));
const reversal = source.slice(source.indexOf("const hasFabricDownstream"), source.indexOf("const getMeta"));

assert.match(fabricCreate, /quality_transfer_out/);
assert.match(fabricCreate, /quality_transfer_in/);
assert.match(fabricCreate, /runAtomic/);
assert.match(fabricCreate, /getFabricBucketBalance/);
assert.match(yarnCreate, /transfer_out/);
assert.match(yarnCreate, /transfer_in/);
assert.match(yarnCreate, /runAtomic/);
assert.match(yarnCreate, /getGodownBalance/);
assert.match(recoveryCreate, /rewinder_recovery/);
assert.match(recoveryCreate, /referenceValue: round\(quantityKg \* referenceRate\)/);
assert.match(recoveryCreate, /resolveSizingLeftover/);
assert.match(source, /existingByRequest/);
assert.match(source, /withStockLock/);
assert.match(reversal, /hasFabricDownstream/);
assert.match(reversal, /hasYarnDownstream/);
assert.match(reversal, /isVoided: true/);
assert.doesNotMatch(source, /JournalEntry|EmployeePayroll|WeavingAttendance|WeavingFoldingEntry|WeavingBeam|createJournal|ensureAccount/);

assert.match(backupSource, /weavingstockadjustments/);
assert.match(restoreSource, /weavingstockadjustments: \(\) => require\("\.\.\/models\/WeavingStockAdjustment"\)/);
assert.match(permissionSource, /weaving\.fabric_stock\.transfer/);
assert.match(permissionSource, /weaving\.yarn_stock\.transfer/);
assert.match(permissionSource, /weaving\.yarn_stock\.rewinder_recovery/);
assert.match(permissionSource, /weaving\.stock_adjustment\.reverse/);
assert.match(routeSource, /requirePermission\("weaving\.fabric_stock\.transfer"\)/);
assert.match(routeSource, /requirePermission\("weaving\.stock_adjustment\.reverse"\)/);
assert.match(sizingSource, /movementType: "sizing_issue"/);
assert.match(sizingSource, /movementType: "sizing_receipt"/);
assert.match(sizingSource, /movementType: "sizing_return"/);
assert.match(sizingSource, /getGodownBalance/);

console.log("weaving stock control tests passed");
