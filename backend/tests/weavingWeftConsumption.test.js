const assert = require("assert");
const fs = require("fs");
const path = require("path");

const WeavingYarnMovement = require("../models/WeavingYarnMovement");
const stock = require("../services/weaving/weavingYarnStockService");

const opening = { itemType: "yarn", transactionType: "opening", itemId: "y1", godownId: "g1", quantity: 100 };
const consumption = { _id: "m1", yarnId: "y1", movementType: "weft_consumption", quantityKg: 25, ownershipType: "own", sourceGodownId: "g1", isVoided: false };
const reversal = { _id: "m2", yarnId: "y1", movementType: "weft_consumption_reversal", quantityKg: 25, ownershipType: "own", godownId: "g1", reversalOfMovementId: "m1", isVoided: false };

const key = stock._test.balanceKey({ yarnId: "y1", godownId: "g1", ownershipType: "own" });
assert.strictEqual(stock._test.accumulateEffects([opening, consumption]).get(key).kg, 75, "actual Weft reduces the exact Godown bucket");
assert.strictEqual(stock._test.accumulateEffects([opening, consumption, reversal]).get(key).kg, 100, "reversal restores the same bucket once");
assert.strictEqual(stock._test.toGodownEffect(consumption).sign, -1);
assert.strictEqual(stock._test.toGodownEffect(reversal).sign, 1);

const partyA = { yarnId: "y1", movementType: "party_inward", quantityKg: 40, ownershipType: "party", ownerPartyId: "p1", destinationType: "godown", godownId: "g1", isVoided: false };
const partyUse = { yarnId: "y1", movementType: "weft_consumption", quantityKg: 10, ownershipType: "party", ownerPartyId: "p1", sourceGodownId: "g1", isVoided: false };
const partyKey = stock._test.balanceKey({ yarnId: "y1", godownId: "g1", ownershipType: "party", ownerPartyId: "p1" });
const partyBalances = stock._test.accumulateEffects([opening, partyA, partyUse]);
assert.strictEqual(partyBalances.get(partyKey).kg, 30, "Party A consumption remains isolated");
assert.strictEqual(partyBalances.get(key).kg, 100, "Party consumption never touches Own Yarn");

assert.ok(WeavingYarnMovement.schema.paths.loomId);
assert.ok(WeavingYarnMovement.schema.paths.beamSetId);
assert.ok(WeavingYarnMovement.schema.paths.contractId);
assert.ok(WeavingYarnMovement.schema.paths.fabricQualityId);
assert.ok(WeavingYarnMovement.schema.paths.reversalOfMovementId);

const serviceSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingYarnStockService.js"), "utf8");
assert.match(serviceSource, /withLocks/);
assert.match(serviceSource, /Only \$\{Math\.max\(0, remaining\)\} KG matching Yarn is available/);
assert.match(serviceSource, /requestKey/);
assert.match(serviceSource, /consumptionBatchId/);
assert.match(serviceSource, /dispatchStatus: "kacchi_out"/);
assert.match(serviceSource, /weft_consumption_reversal/);
assert.match(serviceSource, /bulkWrite\(originals\.map/);
assert.match(serviceSource, /movements\.length !== originals\.length/);

const routes = fs.readFileSync(path.join(__dirname, "../routes/weavingYarnStockRoutes.js"), "utf8");
assert.match(routes, /weaving\.yarn_stock\.consume/);
assert.match(routes, /weft-consumption\/:batchId\/reverse/);

console.log("weaving Weft Consumption tests passed");
