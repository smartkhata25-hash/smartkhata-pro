const assert = require("assert");
const fs = require("fs");
const path = require("path");

const WeavingCostSnapshot = require("../models/WeavingCostSnapshot");
const WeavingYarnMovement = require("../models/WeavingYarnMovement");
const costing = require("../services/weaving/weavingCostingService");

const { _test } = costing;
const runToken = "test-run";
const createdAt = (day) => `2026-09-${String(day).padStart(2, "0")}T08:00:00.000Z`;
const movement = (id, movementType, quantityKg, day, extra = {}) => ({
  _id: id, yarnId: "y1", movementType, quantityKg, date: `2026-09-${String(day).padStart(2, "0")}`,
  createdAt: createdAt(day), ownershipType: "own", destinationType: "godown", godownId: "g1",
  isVoided: false, ...extra,
});
const opening = (id, quantity, rate, itemId = "y1", godownId = "g1") => ({ _id: id, itemType: "yarn", transactionType: "opening", itemId, godownId, quantity, rate, createdAt: createdAt(1) });
const replayYarn = (openings, movements, purchases = []) => _test.replayYarn({ openings, movements, purchaseMap: new Map(purchases.map((row) => [String(row._id), row])), runToken });
const snapshot = (rows, type, key) => rows.find((row) => row.entityType === type && row.entityKey === key);

assert.strictEqual(_test.normalizePurchaseCostPerKg({ quantity: 100, amount: 22046.26, rateBasis: "lbs" }), 220.46, "LBS line amount normalizes once to cost/KG");

const weighted = replayYarn(
  [opening("o1", 100, 10)],
  [
    movement("p1", "purchase_in", 25, 2, { purchaseInvoiceId: "pi1" }),
    movement("s1", "sale_out", 50, 3, { sourceGodownId: "g1", godownId: null, salesInvoiceId: "sale1" }),
  ],
  [{ _id: "pi1", lines: [{ yarnId: "y1", quantity: 25, amount: 500, destinationType: "godown", godownId: "g1" }] }],
);
assert.strictEqual(snapshot(weighted.snapshots, "yarn_opening", "o1").components.total, 1000, "opening uses opening rate");
assert.strictEqual(snapshot(weighted.snapshots, "yarn_movement", "p1").unitCostKg, 20, "purchase uses actual line cost");
assert.strictEqual(snapshot(weighted.snapshots, "yarn_movement", "s1").components.total, 600, "sale freezes moving-average COGS");
assert.strictEqual(snapshot(weighted.snapshots, "yarn_inventory", "y1|godown|g1|own").inventoryValue, 900, "remaining weighted-average value is retained");

const sizing = replayYarn([opening("o2", 100, 10)], [
  movement("i1", "sizing_issue", 40, 2, { sourceGodownId: "g1", godownId: null, destinationType: "direct_sizing", sizingPartyId: "sp1", sizingIssueId: "si1" }),
  movement("r1", "sizing_receipt", 30, 3, { godownId: null, destinationType: "direct_sizing", sizingPartyId: "sp1", sizingIssueId: "si1", sizingReceiptId: "sr1" }),
  movement("b1", "sizing_return", 10, 4, { sizingPartyId: "sp1", godownId: "g1", sizingIssueId: "si1" }),
]);
assert.strictEqual(snapshot(sizing.snapshots, "yarn_movement", "i1").components.total, 400, "sizing issue consumes source cost");
assert.strictEqual(snapshot(sizing.snapshots, "yarn_movement", "r1").components.total, 300, "warp receipt preserves consumed cost");
assert.strictEqual(snapshot(sizing.snapshots, "yarn_movement", "b1").components.total, 100, "sizing return restores original issue cost");
assert.strictEqual(snapshot(sizing.snapshots, "yarn_inventory", "y1|godown|g1|own").inventoryValue, 700);

const transfer = replayYarn([opening("o3", 100, 10)], [
  movement("to", "transfer_out", 20, 2, { sourceGodownId: "g1", godownId: null, stockAdjustmentId: "a1" }),
  movement("ti", "transfer_in", 20, 2, { yarnId: "y2", godownId: "g2", stockAdjustmentId: "a1" }),
]);
const transferValue = transfer.snapshots.filter((row) => row.entityType === "yarn_inventory").reduce((sum, row) => sum + row.inventoryValue, 0);
assert.strictEqual(transferValue, 1000, "Yarn transfer preserves total value");
assert.strictEqual(snapshot(transfer.snapshots, "yarn_inventory", "y2|godown|g2|own").inventoryValue, 200, "transfer-in receives exact carried cost");

const returnedSale = replayYarn([opening("o4", 100, 10)], [
  movement("so", "sale_out", 25, 2, { sourceGodownId: "g1", godownId: null, salesInvoiceId: "sale2" }),
  movement("sr", "sale_return", 25, 3, { godownId: "g1", salesInvoiceId: "sale2" }),
  movement("rw", "rewinder_recovery", 10, 4, { godownId: "g1" }),
]);
assert.strictEqual(snapshot(returnedSale.snapshots, "yarn_movement", "sr").components.total, 250, "sale return restores original sale cost");
assert.strictEqual(snapshot(returnedSale.snapshots, "yarn_movement", "rw").components.total, 0, "Rewinder recovery has zero purchase cost");
assert.strictEqual(snapshot(returnedSale.snapshots, "yarn_inventory", "y1|godown|g1|own").inventoryValue, 1000);

const party = replayYarn([], [
  movement("pp", "party_inward", 100, 1, { ownershipType: "party", ownerPartyId: "party1" }),
  movement("pc", "weft_consumption", 25, 2, { ownershipType: "party", ownerPartyId: "party1", sourceGodownId: "g1", godownId: null, beamSetId: "set1" }),
]);
const partyInventory = snapshot(party.snapshots, "yarn_inventory", "y1|godown|g1|party:party1");
assert.strictEqual(partyInventory.quantity.kg, 75, "party consumption reduces only its party bucket");
assert.strictEqual(partyInventory.inventoryValue, 0, "party Yarn is excluded from company value");
assert.strictEqual(snapshot(party.snapshots, "yarn_movement", "pc").components.total, 0, "party Weft has zero company material cost");

const ownWeft = replayYarn([opening("o5", 50, 12)], [movement("wc", "weft_consumption", 10, 2, { sourceGodownId: "g1", godownId: null, beamSetId: "set1", loomId: "loom1", contractId: "c1", fabricQualityId: "q1" })]);
assert.strictEqual(snapshot(ownWeft.snapshots, "yarn_movement", "wc").components.total, 120, "own actual Weft contributes material cost");
assert.strictEqual(snapshot(ownWeft.snapshots, "yarn_movement", "wc").dimensions.beamSetId, "set1", "Weft lineage is preserved");

const warpSnapshot = _test.makeSnapshot({ entityType: "yarn_movement", entityId: "warp", entityKey: "warp", dimensions: { movementType: "sizing_receipt" }, quantity: { kg: 10 }, components: { material: 100 }, sourceRefs: { sizingReceiptId: "receipt1" }, runToken });
const weftSnapshot = _test.makeSnapshot({ entityType: "yarn_movement", entityId: "weft", entityKey: "weft", dimensions: { movementType: "weft_consumption", beamSetId: "set1" }, quantity: { kg: 5 }, components: { material: 50 }, runToken });
const production = _test.buildBeamAndFoldingCosts({
  beamSets: [{ _id: "set1", sizingReceiptId: "receipt1", contractId: "c1", fabricQualityId: "q1", length: 100, status: "completed", createdAt: createdAt(1) }],
  receipts: [{ _id: "receipt1", date: "2026-09-01", netWeightKg: 10 }],
  bills: [{ _id: "bill1", receiptId: "receipt1", grossAmount: 20, gstAmount: 3.6, status: "posted" }],
  knottingJobs: [{ _id: "job1", beamSetId: "set1", amount: 10, earningKind: "piece", status: "approved" }],
  foldings: [
    { _id: "f1", beamSetId: "set1", status: "posted", date: "2026-09-05", meter: 60, weightKg: 6, ownershipType: "own" },
    { _id: "f2", beamSetId: "set1", status: "posted", date: "2026-09-06", meter: 40, weightKg: 4, ownershipType: "own" },
  ],
  yarnMovementSnapshots: [warpSnapshot, weftSnapshot], runToken,
});
const beamCost = snapshot(production.snapshots, "beam_set", "set1");
assert.strictEqual(beamCost.components.material, 150, "Warp and Weft form material cost once");
assert.strictEqual(beamCost.components.sizing, 20, "recoverable GST is excluded from sizing inventory cost");
assert.strictEqual(beamCost.components.knotting, 10, "traceable approved knotting is included once");
assert.strictEqual(beamCost.components.total, 180, "component total has no double count");
assert.strictEqual(snapshot(production.snapshots, "folding", "f1").components.total, 108, "KG allocation follows Beam Set");
assert.strictEqual(snapshot(production.snapshots, "folding", "f2").components.total, 72, "Folding allocations reconcile");

const reversedWeftSnapshot = _test.makeSnapshot({ entityType: "yarn_movement", entityId: "weft-reversal", entityKey: "weft-reversal", dimensions: { movementType: "weft_consumption_reversal", beamSetId: "set1" }, quantity: { kg: 5 }, components: { material: 50 }, sourceRefs: { reversalOfMovementId: "weft" }, runToken });
const reversedWeftProduction = _test.buildBeamAndFoldingCosts({
  beamSets: [{ _id: "set1", sizingReceiptId: "receipt1", status: "completed", createdAt: createdAt(1) }],
  receipts: [{ _id: "receipt1", date: "2026-09-01", netWeightKg: 10 }],
  bills: [{ _id: "bill1", receiptId: "receipt1", grossAmount: 20, status: "posted" }],
  knottingJobs: [], foldings: [], yarnMovementSnapshots: [warpSnapshot, weftSnapshot, reversedWeftSnapshot], runToken,
});
const reversedBeamCost = snapshot(reversedWeftProduction.snapshots, "beam_set", "set1");
assert.strictEqual(reversedBeamCost.components.weft, 0, "reversed Weft is removed from Beam Set cost");
assert.ok(reversedBeamCost.missingReasons.includes("missing Weft consumption"), "reversed Weft leaves explicit partial coverage");

const missingWeft = _test.buildBeamAndFoldingCosts({ beamSets: [{ _id: "set2", sizingReceiptId: "receipt2", status: "available" }], receipts: [{ _id: "receipt2", date: "2026-09-01" }], bills: [], knottingJobs: [], foldings: [], yarnMovementSnapshots: [], runToken });
assert.strictEqual(snapshot(missingWeft.snapshots, "beam_set", "set2").costStatus, "pending_source_cost");
assert.ok(snapshot(missingWeft.snapshots, "beam_set", "set2").missingReasons.includes("missing Weft consumption"), "missing actual Weft is explicit");

const foldingCost = _test.makeSnapshot({ entityType: "folding", entityId: "f3", entityKey: "f3", ownershipType: "own", quantity: { meter: 100, kg: 20 }, components: { material: 800, processing: 200, warp: 500, weft: 300, sizing: 150, knotting: 50 }, runToken });
const fabricOpenings = _test.replayFabric({
  openings: [
    { _id: "fo-meter", itemId: "qm", godownId: "g1", unit: "Meter", quantity: 10, rate: 20, createdAt: createdAt(1) },
    { _id: "fo-yard", itemId: "qy", godownId: "g1", unit: "Yard", quantity: 10, rate: 18, createdAt: createdAt(1) },
    { _id: "fo-kg", itemId: "qk", godownId: "g1", unit: "KG", quantity: 10, rate: 30, createdAt: createdAt(1) },
  ],
  foldings: [], movements: [], purchaseMap: new Map(), foldingCosts: new Map(), pakkis: [], kacchis: [], rejectionReceipts: [], runToken,
});
assert.strictEqual(snapshot(fabricOpenings.snapshots, "fabric_opening", "fo-meter").quantity.meter, 10, "Meter opening preserves its primary unit");
assert.strictEqual(snapshot(fabricOpenings.snapshots, "fabric_opening", "fo-yard").quantity.meter, 9.144, "Yard opening normalizes to Meter once");
assert.strictEqual(snapshot(fabricOpenings.snapshots, "fabric_opening", "fo-yard").components.total, 180, "Yard opening preserves original total value");
assert.strictEqual(snapshot(fabricOpenings.snapshots, "fabric_opening", "fo-kg").quantity.kg, 10, "KG opening remains KG");
assert.strictEqual(snapshot(fabricOpenings.snapshots, "fabric_opening", "fo-kg").quantity.meter, 0, "KG opening does not invent Meter quantity");

const fabric = _test.replayFabric({
  openings: [], purchaseMap: new Map(), foldingCosts: new Map([["f3", foldingCost]]),
  foldings: [{ _id: "f3", status: "posted", date: "2026-09-01", createdAt: createdAt(1), meter: 100, weightKg: 20, goodMeter: 100, bGradeMeter: 0, rejectedMeter: 0, fabricQualityId: "q1", godownId: "g1", ownershipType: "own" }],
  movements: [{ _id: "ko", date: "2026-09-02", createdAt: createdAt(2), movementType: "kacchi_out", direction: "out", category: "normal", fabricQualityId: "q1", godownId: "g1", ownershipType: "own", meter: 100, weightKg: 20, kacchiId: "k1", sourceFoldingEntryId: "f3", isVoided: false }, { _id: "rr", date: "2026-09-04", createdAt: createdAt(4), movementType: "rejection_recovery", direction: "in", category: "rejected", fabricQualityId: "q1", godownId: "g1", ownershipType: "own", meter: 10, weightKg: 2, rejectionReceiptId: "receipt-r", isVoided: false }],
  pakkis: [{ _id: "pk1", sourceKacchiId: "k1", grossMeter: 100, rejectionMeter: 10 }],
  kacchis: [{ _id: "k1", totalMeter: 100, lines: [{ foldingEntryId: "f3" }] }],
  rejectionReceipts: [{ _id: "receipt-r", pakkiId: "pk1" }], runToken,
});
assert.strictEqual(snapshot(fabric.snapshots, "fabric_movement", "ko").components.total, 1000, "Kacchi carries exact Folding cost");
assert.strictEqual(snapshot(fabric.snapshots, "fabric_movement", "rr").components.total, 100, "Rejection recovery restores proportional source cost");
assert.strictEqual(fabric.snapshots.filter((row) => row.entityType === "fabric_inventory").reduce((sum, row) => sum + row.inventoryValue, 0), 100, "recovered Fabric returns to inventory without new production");

const pakkiSale = _test.buildSalesCosts({
  invoices: [{ _id: "inv1", status: "posted", invoiceDate: "2026-09-05", saleSource: "pakki", saleNature: "fabric", sourcePakkiId: "pk1", ownershipType: "own", subtotal: 1500, discountAmount: 0, quantity: 90, uom: "Meter" }],
  pakkis: [{ _id: "pk1", sourceKacchiId: "k1", grossMeter: 100, rejectionMeter: 10 }],
  kacchis: [{ _id: "k1", lines: [{ foldingEntryId: "f3" }] }], yarnMovementCosts: new Map(), fabricMovementCosts: fabric.movementCosts, runToken,
});
assert.strictEqual(pakkiSale[0].components.total, 900, "Pakki-linked COGS excludes recoverable rejection cost");
assert.strictEqual(pakkiSale[0].grossProfit, 600, "invoice gross profit uses revenue less source COGS");

const partyFabric = _test.replayFabric({ openings: [], movements: [], purchaseMap: new Map(), pakkis: [], kacchis: [], rejectionReceipts: [], runToken,
  foldings: [{ _id: "pf", status: "posted", date: "2026-09-01", createdAt: createdAt(1), meter: 50, weightKg: 10, goodMeter: 50, bGradeMeter: 0, rejectedMeter: 0, fabricQualityId: "q2", godownId: "g1", ownershipType: "party", ownerPartyId: "party1" }],
  foldingCosts: new Map([["pf", _test.makeSnapshot({ entityType: "folding", entityId: "pf", entityKey: "pf", ownershipType: "party", components: { material: 0, processing: 250, sizing: 200, knotting: 50 }, quantity: { meter: 50 }, runToken })]]),
});
const partyFabricInventory = partyFabric.snapshots.find((row) => row.entityType === "fabric_inventory");
assert.strictEqual(partyFabricInventory.inventoryValue, 0, "party Fabric is excluded from company inventory value");
assert.strictEqual(partyFabricInventory.components.processing, 250, "company-paid conversion processing remains traceable");

const dispatchedPartyFabric = _test.replayFabric({ openings: [], purchaseMap: new Map(), pakkis: [], kacchis: [], rejectionReceipts: [], runToken,
  foldings: [{ _id: "pcf", status: "posted", date: "2026-09-01", createdAt: createdAt(1), meter: 50, weightKg: 10, goodMeter: 50, bGradeMeter: 0, rejectedMeter: 0, fabricQualityId: "q2", godownId: "g1", ownershipType: "party", ownerPartyId: "party1" }],
  foldingCosts: new Map([["pcf", _test.makeSnapshot({ entityType: "folding", entityId: "pcf", entityKey: "pcf", ownershipType: "party", components: { processing: 250, sizing: 200, knotting: 50 }, quantity: { meter: 50 }, runToken })]]),
  movements: [{ _id: "pko", date: "2026-09-02", createdAt: createdAt(2), movementType: "kacchi_out", direction: "out", category: "normal", fabricQualityId: "q2", godownId: "g1", ownershipType: "party", ownerPartyId: "party1", meter: 50, weightKg: 10, kacchiId: "pkc", sourceFoldingEntryId: "pcf", isVoided: false }],
});
const partyKacchiCost = snapshot(dispatchedPartyFabric.snapshots, "fabric_movement", "pko");
const dispatchedPartyInventory = dispatchedPartyFabric.snapshots.find((row) => row.entityType === "fabric_inventory");
assert.strictEqual(dispatchedPartyInventory.quantity.meter, 0, "Party Fabric Kacchi dispatch reduces the physical costing bucket");
assert.strictEqual(dispatchedPartyInventory.inventoryValue, 0, "Party Fabric remains excluded after dispatch");
assert.strictEqual(partyKacchiCost.components.processing, 250, "conversion processing cost follows Party Fabric dispatch");

const bucket = _test.createBucket(); _test.addToBucket(bucket, { kg: 100, components: { material: 1000 } }); _test.addToBucket(bucket, { kg: 100, components: { material: 2000 } });
assert.strictEqual(_test.consumeFromBucket(bucket, 50).components.total, 750, "weighted average helper is deterministic");
assert.strictEqual(bucket.components.material, 2250);

assert.ok(WeavingYarnMovement.schema.path("movementType").enumValues.includes("weft_consumption"));
assert.ok(WeavingYarnMovement.schema.path("movementType").enumValues.includes("weft_consumption_reversal"));
assert.ok(WeavingYarnMovement.schema.indexes().some(([fields, options]) => fields.requestKey === 1 && fields.requestLineKey === 1 && options.unique), "consumption request is idempotent");
assert.ok(WeavingCostSnapshot.schema.indexes().some(([fields, options]) => fields.entityType === 1 && fields.entityKey === 1 && options.unique), "cost snapshots are uniquely rebuildable");

const source = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingCostingService.js"), "utf8");
assert.doesNotMatch(source, /JournalEntry\.(create|insertMany)|WeavingYarnMovement\.(create|insertMany)|WeavingFabricMovement\.(create|insertMany)/, "cost rebuild creates no business transaction or journal");
assert.match(source, /bulkWrite/);
assert.match(source, /runToken/);
assert.match(source, /costingVersion/);

console.log("weaving costing service tests passed");
