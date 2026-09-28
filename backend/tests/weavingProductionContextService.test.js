const assert = require("node:assert/strict");
const test = require("node:test");
const context = require("../services/weaving/weavingProductionContextService");
const Contract = require("../models/WeavingContract");
const Quality = require("../models/WeavingFabricQuality");
const Party = require("../models/WeavingParty");
const Purchase = require("../models/WeavingPurchaseInvoice");
const Folding = require("../models/WeavingFoldingEntry");

const contracts = [
  { _id: "pc", type: "purchase", itemId: "yarn", partyId: "supplier", unit: "KG", rate: 5, quantity: 100, status: "active" },
  { _id: "fc", type: "purchase", purchaseItemType: "fabric", itemId: "quality", partyId: "supplier", unit: "Yard", rate: 10, quantity: 100, status: "active" },
  { _id: "sc", type: "sales", contractType: "fabric_sale", itemId: "quality", partyId: "customer", partyName: "Customer", unit: "Meter", quantity: 100, status: "active" },
  { _id: "cc", type: "sales", contractType: "conversion", itemId: "quality", partyId: "customer", unit: "Meter", quantity: 100, status: "active" },
];
const query = (value) => ({ session() { return this; }, select() { return this; }, lean: async () => value, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } });
const withIdentityModels = async (run) => {
  const originals = [Contract.findOne, Quality.exists, Party.exists];
  Contract.findOne = (filter) => query(filter.userId === "user" ? contracts.find((row) => row._id === filter._id) || null : null);
  Quality.exists = (filter) => query(filter.userId === "user" && filter._id === "quality" ? { _id: filter._id } : null);
  Party.exists = (filter) => query(filter.userId === "user" && filter._id === "customer" ? { _id: filter._id } : null);
  try { await run(); } finally { [Contract.findOne, Quality.exists, Party.exists] = originals; }
};

test("Fabric Sale customer is separate from Own stock; Conversion is Party-owned; unknown remains unknown", () => {
  const sale = context.contextFromSources(contracts[2]);
  assert.equal(sale.customerPartyId, "customer");
  assert.equal(sale.ownershipType, "own");
  assert.equal(sale.ownerPartyId, null);
  assert.equal(context.contextFromSources(contracts[3]).ownerPartyId, "customer");
  assert.equal(context.contextFromSources(contracts[0]).contractId, null);
  assert.equal(context.contextFromSources(null).ownershipType, null);
  assert.equal(context.upstreamOwnership(null, { lines: [{ ownershipType: "party", ownerPartyId: "a" }, { ownershipType: "party", ownerPartyId: "b" }] }).ownershipType, null);
});

test("production identity inherits Issue and prevents contract/quality/ownership drift", () => withIdentityModels(async () => {
  const issue = await context.productionIdentity("user", { contractId: "sc" });
  assert.deepEqual(issue, { contractId: "sc", fabricQualityId: "quality", ownershipType: "own", ownerPartyId: null });
  assert.deepEqual(await context.receiptIdentity("user", {}, issue, null), issue);
  for (const payload of [{ contractId: "cc" }, { fabricQualityId: "other" }, { ownershipType: "party", ownerPartyId: "customer" }]) {
    await assert.rejects(context.receiptIdentity("user", payload, issue, null), /must match/);
  }
  await assert.rejects(context.productionIdentity("user", { contractId: "pc" }), /not a Purchase Contract/);
  await assert.rejects(context.productionIdentity("other-user", { contractId: "sc" }), /Select a Sales/);
  const own = await context.productionIdentity("user", { fabricQualityId: "quality", ownershipType: "own" });
  assert.equal(own.contractId, null);
  await assert.rejects(context.receiptIdentity("user", { contractId: "sc" }, own, null), /no-contract/);
  const legacy = await context.productionIdentity("user", {}, { existing: { _id: "legacy" } });
  assert.equal(legacy.ownershipType, null);
}));

test("purchase links separate procurement and production, including legacy generic links", () => withIdentityModels(async () => {
  const line = { yarnId: "yarn", rate: 5, rateBasis: "kg", purchaseContractId: "pc", productionContractId: "sc", destinationType: "direct_sizing" };
  const payload = { purchaseType: "yarn", yarnSource: "own", partyId: "supplier" };
  const result = await context.purchaseLineContext("user", payload, line);
  assert.equal(result.purchaseContractId, "pc");
  assert.equal(result.productionContractId, "sc");
  assert.equal(result.contractId, null);
  assert.equal(result.productionFabricQualityId, "quality");
  const legacy = await context.purchaseLineContext("user", payload, { ...line, contractId: "pc", purchaseContractId: null });
  assert.equal(legacy.purchaseContractId, "pc");
  await assert.rejects(context.purchaseLineContext("user", { ...payload, partyId: "other" }, line), /Supplier and Item/);
  await assert.rejects(context.purchaseLineContext("user", payload, { ...line, rate: 9 }), /Unit and Rate/);
  await assert.rejects(context.purchaseLineContext("user", payload, { ...line, productionContractId: "cc" }), /Own Yarn/);
}));

test("Conversion inward matches the owner, and Fabric purchase fulfillment stays a separate route", () => withIdentityModels(async () => {
  const inward = await context.purchaseLineContext("user", { purchaseType: "yarn", yarnSource: "party", partyId: "customer" }, { productionContractId: "cc", yarnId: "yarn" });
  assert.equal(inward.productionContractId, "cc");
  assert.equal(inward.purchaseContractId, null);
  await assert.rejects(context.purchaseLineContext("user", { purchaseType: "yarn", yarnSource: "party", partyId: "other" }, { productionContractId: "cc" }), /same Party/);
  const fabric = await context.purchaseLineContext("user", { purchaseType: "fabric", partyId: "supplier" }, { purchaseContractId: "fc", fulfillmentContractId: "sc", fabricQualityId: "quality", unit: "Yard", rate: 10 });
  assert.equal(fabric.fulfillmentContractId, "sc");
  assert.equal(fabric.productionContractId, null);
  await assert.rejects(context.purchaseLineContext("user", { purchaseType: "fabric", partyId: "supplier" }, { fulfillmentContractId: "cc", fabricQualityId: "quality" }), /must match/);
}));

test("progress excludes voids, converts fabric units, separates external supply, and never commercially completes from gross Folding", async () => {
  const originals = [Purchase.find, Folding.find];
  const yarn = { purchaseType: "yarn", yarnSource: "own", partyId: "supplier", status: "posted", lines: [{ contractId: "pc", yarnId: "yarn", quantity: 100, unit: "KG" }] };
  const fabric = { purchaseType: "fabric", partyId: "supplier", status: "posted", lines: [{ purchaseContractId: "fc", fulfillmentContractId: "sc", fabricQualityId: "quality", quantity: 91.44, unit: "Meter" }] };
  Purchase.find = (filter) => { assert.equal(filter.userId, "user"); return query([yarn, fabric, { ...yarn, status: "void" }].filter((row) => row.status === filter.status)); };
  Folding.find = (filter) => query([
    { contractId: "sc", status: "posted", meter: 100, goodMeter: 90, bGradeMeter: 5, rejectedMeter: 5 },
    { contractId: "sc", status: "void", meter: 999 },
  ].filter((row) => row.status === filter.status));
  try {
    const rows = await context.contractProgress("user", contracts);
    assert.equal(rows[0].progress.purchasedQuantity, 100);
    assert.equal(rows[0].progress.remainingQuantity, 0);
    assert.equal(rows[0].progress.targetReached, true);
    assert.equal(rows[1].progress.purchasedQuantity, 100);
    assert.equal(rows[2].progress.grossProducedMeter, 100);
    assert.equal(rows[2].progress.rejectedMeter, 5);
    assert.equal(rows[2].progress.externalPurchasedMeter, 91.44);
    assert.equal(rows[2].progress.commercialCompletion, null);
    assert.equal(rows[2].status, "active");
    const revised = await context.contractProgress("user", [{ ...contracts[0], quantity: 150 }]);
    assert.equal(revised[0].progress.remainingQuantity, 50);
    assert.equal(revised[0].progress.targetReached, false);
  } finally { [Purchase.find, Folding.find] = originals; }
});

test("Fabric purchase normalizes Yard and KG-priced receipts into the existing Meter stock", async () => {
  const Godown = require("../models/WeavingGodown");
  const originals = [Quality.findOne, Godown.exists];
  Quality.findOne = () => query({ _id: "quality", name: "Grey" });
  Godown.exists = () => query({ _id: "godown" });
  try {
    const normalize = require("../services/weaving/weavingCommercialService")._test.normalizePurchaseLines;
    const [yard] = await normalize("user", { purchaseType: "fabric", lines: [{ fabricQualityId: "quality", godownId: "godown", quantity: 100, rate: 10, unit: "Yard" }] });
    assert.equal(yard.quantity, 91.44);
    assert.equal(yard.amount, 1000);
    assert.equal(yard.unit, "Meter");
    assert.equal(yard.sourceQuantity, 100);
    const [kg] = await normalize("user", { purchaseType: "fabric", lines: [{ fabricQualityId: "quality", godownId: "godown", quantity: 100, weightKg: 20, rate: 50, unit: "KG" }] });
    assert.equal(kg.quantity, 100);
    assert.equal(kg.amount, 1000);
    assert.equal(kg.sourceQuantity, 20);
    assert.equal(kg.rate, 10);
  } finally { [Quality.findOne, Godown.exists] = originals; }
});

test("historical Than edits retain original run rather than resolving today's loaded Beam", async () => {
  const original = Quality.findOne;
  Quality.findOne = () => query({ _id: "quality", name: "Grey" });
  try {
    const existing = { loomId: "loom", beamId: "old-beam", beamSetId: "old-set", contractId: "old-contract", fabricQualityId: "quality", ownershipType: "own", ownerPartyId: null,
      loomNumberSnapshot: "7", beamNoSnapshot: "B01", setNoSnapshot: "SET1", contractNoSnapshot: "SC-OLD" };
    const build = require("../services/weaving/weavingFoldingService")._test.buildPayload;
    const result = await build("user", { loomId: "loom", contractId: "old-contract", meter: 25, weightKg: 5, date: "2026-09-23" }, existing);
    assert.equal(result.beamId, "old-beam");
    assert.equal(result.beamSetId, "old-set");
    assert.equal(result.contractId, "old-contract");
    assert.equal(result.contractNoSnapshot, "SC-OLD");
    await assert.rejects(build("user", { loomId: "loom", contractId: "today-contract" }, existing), /must match/);
  } finally { Quality.findOne = original; }
});

test("linked Contract identity is protected, while target and rate revisions remain allowed", async () => {
  const models = [Purchase, require("../models/WeavingSizingIssue"), require("../models/WeavingSizingReceipt"), require("../models/WeavingBeamSet"), Folding,
    require("../models/WeavingSalesInvoice"), require("../models/WeavingPakkiSettlement"), require("../models/WeavingKacchiParchi")];
  const originals = models.map((Model) => Model.exists);
  models.forEach((Model, index) => { Model.exists = () => query(index === 0 ? { _id: "linked-history" } : null); });
  try {
    const contract = { ...contracts[0], purchaseItemType: "yarn" };
    await context.assertContractIdentityEdit("user", contract, { ...contract, quantity: 70, rate: 9 });
    await assert.rejects(context.assertContractIdentityEdit("user", contract, { ...contract, partyId: "different-supplier" }), /linked transactions/);
    await assert.rejects(context.assertContractIdentityEdit("user", contract, { ...contract, purchaseItemType: "fabric" }), /linked transactions/);
  } finally { models.forEach((Model, index) => { Model.exists = originals[index]; }); }
});

test("physical stock remains separate by owner, not customer Contract; missing ownership stays unknown", async () => {
  const Movement = require("../models/WeavingFabricMovement");
  const Godown = require("../models/WeavingGodown");
  const models = [Folding, Movement, Quality, Godown, Party];
  const originals = models.map((Model) => Model.find);
  const entries = [
    { ownershipType: "own", ownerPartyId: null, contractId: "sale-1" },
    { ownershipType: "own", ownerPartyId: null, contractId: "sale-2" },
    { ownershipType: "party", ownerPartyId: "a" },
    { ownershipType: "party", ownerPartyId: "b" },
    { ownerPartyId: null },
  ].map((identity) => ({ ...identity, fabricQualityId: "quality", godownId: "godown", meter: 10, goodMeter: 10, bGradeMeter: 0, rejectedMeter: 0, weightKg: 2, weightLbs: 4.409245 }));
  const rows = [entries, [], [{ _id: "quality", name: "Grey" }], [{ _id: "godown", name: "One" }], [{ _id: "a", name: "A" }, { _id: "b", name: "B" }]];
  models.forEach((Model, index) => { Model.find = () => query(rows[index]); });
  try {
    const result = await require("../services/weaving/weavingFoldingService").stockSummary("user");
    assert.equal(result.rows.length, 4);
    assert.equal(result.rows.find((row) => row.ownershipType === "own").meter, 20);
    assert.deepEqual(result.rows.map((row) => row.ownerName).sort(), ["A", "B", "Own", "Unknown"]);
  } finally { models.forEach((Model, index) => { Model.find = originals[index]; }); }
});
