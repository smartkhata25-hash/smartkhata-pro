const WeavingBeam = require("../../models/WeavingBeam");
const WeavingBeamSet = require("../../models/WeavingBeamSet");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingParty = require("../../models/WeavingParty");
const WeavingPurchaseInvoice = require("../../models/WeavingPurchaseInvoice");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");

const id = (value) => String(value?._id || value || "");
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });

// The sizing service party is never the production owner by implication.
const upstreamOwnership = (contract, issue) => {
  if (contract?.contractType === "conversion" && contract.partyId) {
    return { ownershipType: "party", ownerPartyId: contract.partyId };
  }
  const lines = issue?.lines || [];
  if (lines.length && lines.every((line) =>
    !line.$isDefault?.("ownershipType") &&
    ["own", "party"].includes(line.ownershipType) &&
    (line.ownershipType !== "party" || line.ownerPartyId) &&
    line.ownershipType === lines[0].ownershipType &&
    (line.ownershipType === "own" || id(line.ownerPartyId) === id(lines[0].ownerPartyId)))) {
    return { ownershipType: lines[0].ownershipType, ownerPartyId: lines[0].ownershipType === "party" ? lines[0].ownerPartyId : null };
  }
  return { ownershipType: null, ownerPartyId: null };
};

const isProductionContract = (contract) => contract?.type === "sales" && ["fabric_sale", "conversion"].includes(contract.contractType);
const contractIsOpen = (contract) => contract?.status === "active" && (!contract.expiryDate || contract.expiryDate >= new Date().toISOString().slice(0, 10));

const contextFromSources = (contract, source = {}) => {
  const production = isProductionContract(contract) ? contract : null;
  const ownership = source.ownershipType ? source : production
    ? { ownershipType: production.contractType === "conversion" ? "party" : "own", ownerPartyId: production.contractType === "conversion" ? production.partyId : null }
    : upstreamOwnership(null, source);
  return { contractId: production?._id || null, fabricQualityId: source.fabricQualityId || production?.itemId || null,
    ownershipType: ownership.ownershipType || null, ownerPartyId: ownership.ownershipType === "party" ? ownership.ownerPartyId || null : null,
    customerPartyId: production?.partyId || null, customerName: production?.partyName || "",
    contractNo: production?.contractNo || "", contractType: production?.contractType || "", contractQuantity: production?.quantity ?? null, contractUnit: production?.unit || "" };
};

const productionIdentity = async (userId, payload, { source = null, existing = null, session = null, requireIdentity = true } = {}) => {
  const readContract = (value) => value ? WeavingContract.findOne({ _id: value, userId }).session(session).lean() : null;
  const upstream = await readContract(source?.contractId);
  const inherited = contextFromSources(upstream, source || {});
  if (inherited.contractId && Object.prototype.hasOwnProperty.call(payload, "contractId") && id(payload.contractId) !== id(inherited.contractId)) {
    throw fail("Production Contract must match the selected Sizing Issue");
  }
  const contractId = inherited.contractId || payload.contractId || null;
  const contract = id(contractId) === id(upstream) ? upstream : await readContract(contractId);
  const unchangedLegacy = existing && id(existing.contractId) === id(contractId) && contract && !isProductionContract(contract);
  if (contractId && !isProductionContract(contract) && !unchangedLegacy) throw fail("Select a Sales / Conversion Production Contract, not a Purchase Contract");
  if (isProductionContract(contract) && !contractIsOpen(contract) && id(existing?.contractId) !== id(contractId) && id(inherited.contractId) !== id(contractId)) {
    throw fail("Select an active, unexpired Production Contract");
  }
  const defaults = contextFromSources(contract);
  if (source?.fabricQualityId && source?.ownershipType && !inherited.contractId && contractId) throw fail("This Sizing Issue is for a no-contract production context. Change the Issue first");
  for (const field of ["fabricQualityId", "ownershipType", "ownerPartyId"]) {
    if (inherited[field] && defaults[field] && id(inherited[field]) !== id(defaults[field])) throw fail("Production Contract conflicts with the Sizing Issue context");
  }
  const known = { fabricQualityId: inherited.fabricQualityId || defaults.fabricQualityId,
    ownershipType: inherited.ownershipType || defaults.ownershipType,
    ownerPartyId: inherited.ownershipType ? inherited.ownerPartyId : defaults.ownerPartyId };
  for (const field of ["fabricQualityId", "ownershipType", "ownerPartyId"]) {
    if (known[field] && payload[field] && id(known[field]) !== id(payload[field])) throw fail("Party / Quality / Ownership must match the Production Contract or selected Sizing Issue");
  }
  if (known.ownershipType === "own" && payload.ownerPartyId) throw fail("Own Production cannot have an owner Party");
  const fabricQualityId = known.fabricQualityId || payload.fabricQualityId || existing?.fabricQualityId || null;
  const ownershipType = known.ownershipType || payload.ownershipType || existing?.ownershipType || null;
  const ownerPartyId = ownershipType === "party" ? known.ownerPartyId || payload.ownerPartyId || existing?.ownerPartyId || null : null;
  if (fabricQualityId && !await WeavingFabricQuality.exists({ _id: fabricQualityId, userId }).session(session)) throw fail("Selected Fabric Quality not found");
  if (ownershipType && !["own", "party"].includes(ownershipType)) throw fail("Invalid production ownership");
  if (ownershipType === "party" && (!ownerPartyId || !await WeavingParty.exists({ _id: ownerPartyId, userId }).session(session))) throw fail("Select a valid production Party");
  if (requireIdentity && !existing && (!fabricQualityId || !ownershipType)) throw fail("Select one Fabric Quality and Own Production or a production Party");
  return { contractId, fabricQualityId, ownershipType, ownerPartyId };
};
const receiptIdentity = (userId, payload, issue, session, existing = null) => productionIdentity(userId, payload, { source: issue, session, existing });

// The same resolver supplies defaults to the UI and validates them on save.
const attachProductionContexts = (contracts, issues = []) => {
  const contractMap = new Map(contracts.map((contract) => [id(contract), contract]));
  return { contracts: contracts.map((contract) => ({ ...contract, productionContext: contextFromSources(contract) })),
    issues: issues.map((issue) => ({ ...issue, productionContext: contextFromSources(contractMap.get(id(issue.contractId)), issue) })) };
};

const purchaseLineContext = async (userId, payload, line, previous = null) => {
  const read = (value) => value ? WeavingContract.findOne({ _id: value, userId }).lean() : null;
  const legacy = await read(line.contractId);
  const purchaseContractId = line.purchaseContractId || (legacy?.type === "purchase" ? legacy._id : null);
  const productionContractId = line.productionContractId || (payload.purchaseType === "yarn" && isProductionContract(legacy) ? legacy._id : null);
  const fulfillmentContractId = line.fulfillmentContractId || (payload.purchaseType === "fabric" && legacy?.type === "sales" && legacy.contractType === "fabric_sale" ? legacy._id : null);
  const purchase = await read(purchaseContractId);
  const priorPurchaseId = previous?.purchaseContractId || (id(previous?.contractId) === id(purchaseContractId) ? previous?.contractId : null);
  if (purchaseContractId) {
    if (!purchase || purchase.type !== "purchase" || (purchase.purchaseItemType || "yarn") !== payload.purchaseType) throw fail("Select the matching Yarn / Fabric Purchase Contract");
    if (payload.purchaseType === "yarn" && payload.yarnSource === "party") throw fail("Party Yarn uses a Conversion Contract, not a Purchase Contract");
    if (!contractIsOpen(purchase) && id(priorPurchaseId) !== id(purchaseContractId)) throw fail("Select an active, unexpired Purchase Contract");
    const itemId = payload.purchaseType === "yarn" ? line.yarnId : line.fabricQualityId;
    if (id(purchase.partyId) !== id(payload.partyId) || id(purchase.itemId) !== id(itemId)) throw fail("Supplier and Item must match the Purchase Contract");
    const unit = payload.purchaseType === "yarn" ? "KG" : line.unit || "Meter";
    if (unit !== purchase.unit || !Number.isFinite(Number(line.rate))) throw fail("Unit and Rate must match the selected Purchase Contract");
  }
  let production = null;
  if (productionContractId) {
    if (payload.purchaseType !== "yarn") throw fail("Fabric purchases do not pass through production");
    production = await productionIdentity(userId, { contractId: productionContractId, fabricQualityId: line.productionFabricQualityId }, {
      existing: previous && id(previous.productionContractId || previous.contractId) === id(productionContractId) ? { contractId: productionContractId } : null,
    });
    if (payload.yarnSource === "party") {
      const contract = await read(productionContractId);
      if (contract.contractType !== "conversion" || id(contract.partyId) !== id(payload.partyId)) throw fail("Party Yarn must match the same Party's Conversion Contract");
    } else if (production.ownershipType !== "own") throw fail("Own Yarn cannot be used for a Party-owned Conversion Contract");
  } else if (payload.purchaseType === "yarn" && line.destinationType === "direct_sizing") {
    production = await productionIdentity(userId, { fabricQualityId: line.productionFabricQualityId,
      ownershipType: payload.yarnSource === "party" ? "party" : "own", ownerPartyId: payload.yarnSource === "party" ? payload.partyId : null }, { existing: previous });
  }
  if (fulfillmentContractId) {
    const contract = await read(fulfillmentContractId);
    if (payload.purchaseType !== "fabric" || !isProductionContract(contract) || contract.contractType !== "fabric_sale" || id(contract.itemId) !== id(line.fabricQualityId)) throw fail("Against Fabric Sale Contract must match this Fabric Quality");
    if (!contractIsOpen(contract) && id(previous?.fulfillmentContractId) !== id(fulfillmentContractId)) throw fail("Select an active Fabric Sale Contract");
  }
  return { purchaseContractId, productionContractId, fulfillmentContractId, productionFabricQualityId: production?.fabricQualityId || null, contractId: null };
};

// Read-only progress. Production grades are not commercial acceptance, and
// externally purchased fabric is a separate supply route, never folded output.
const contractProgress = async (userId, contracts) => {
  const ids = contracts.map((row) => row._id);
  if (!ids.length) return contracts;
  const [purchases, folding] = await Promise.all([
    WeavingPurchaseInvoice.find({ userId, status: "posted", purchaseType: { $in: ["yarn", "fabric"] }, $or: [
      { "lines.purchaseContractId": { $in: ids } }, { "lines.contractId": { $in: ids } }, { "lines.fulfillmentContractId": { $in: ids } },
    ] }).select("partyId purchaseType yarnSource lines").lean(),
    WeavingFoldingEntry.find({ userId, status: "posted", contractId: { $in: ids } }).select("contractId meter goodMeter bGradeMeter rejectedMeter").lean(),
  ]);
  const round = (value) => Math.round(value * 1000000) / 1000000;
  return contracts.map((contract) => {
    let purchased = 0; let externalPurchasedMeter = 0;
    for (const invoice of purchases) for (const line of invoice.lines) {
      if (contract.type === "purchase" && id(line.purchaseContractId || line.contractId) === id(contract) &&
        invoice.purchaseType === (contract.purchaseItemType || "yarn") && !(invoice.purchaseType === "yarn" && invoice.yarnSource === "party") &&
        id(invoice.partyId) === id(contract.partyId) && id(line.yarnId || line.fabricQualityId) === id(contract.itemId)) {
        if (invoice.purchaseType === "fabric" && contract.unit === "KG") purchased += Number(line.weightKg) || 0;
        else if (line.unit === contract.unit) purchased += Number(line.quantity) || 0;
        else if (line.unit === "Meter" && contract.unit === "Yard") purchased += Number(line.quantity) / 0.9144;
        else if (line.unit === "Yard" && contract.unit === "Meter") purchased += Number(line.quantity) * 0.9144;
      }
      if (invoice.purchaseType === "fabric" && contract.type === "sales" && contract.contractType === "fabric_sale" && id(line.fabricQualityId) === id(contract.itemId) && id(line.fulfillmentContractId || line.contractId) === id(contract)) externalPurchasedMeter += Number(line.quantity) * (line.unit === "Yard" ? 0.9144 : 1);
    }
    if (contract.type === "purchase") return { ...contract, progress: { purchasedQuantity: round(purchased), remainingQuantity: round(Math.max(0, Number(contract.quantity) - purchased)), targetReached: purchased + 0.000001 >= Number(contract.quantity) } };
    const production = folding.filter((row) => id(row.contractId) === id(contract));
    const sum = (field) => round(production.reduce((total, row) => total + Number(row[field] || 0), 0));
    return { ...contract, progress: { grossProducedMeter: sum("meter"), goodMeter: sum("goodMeter"), bGradeMeter: sum("bGradeMeter"), rejectedMeter: sum("rejectedMeter"), externalPurchasedMeter: round(externalPurchasedMeter), commercialCompletion: null } };
  });
};

const assertContractIdentityEdit = async (userId, existing, next) => {
  const fields = ["type", "partyId", "itemId", "unit", existing.type === "purchase" ? "purchaseItemType" : "contractType"];
  if (!fields.some((field) => id(existing[field] || (field === "purchaseItemType" ? "yarn" : "")) !== id(next[field]))) return;
  const contractId = existing._id;
  const linked = await Promise.all([
    WeavingPurchaseInvoice.exists({ userId, $or: ["contractId", "purchaseContractId", "productionContractId", "fulfillmentContractId"].map((field) => ({ ["lines." + field]: contractId })) }),
    ...[WeavingSizingIssue, WeavingSizingReceipt, WeavingBeamSet, WeavingFoldingEntry,
      require("../../models/WeavingSalesInvoice"), require("../../models/WeavingPakkiSettlement"), require("../../models/WeavingKacchiParchi")].map((Model) => Model.exists({ userId, contractId })),
  ]);
  if (linked.some(Boolean)) throw fail("This Contract has linked transactions. Keep its Party, Item, Type and Unit; you may revise its target, rate, terms, dates or status");
};

// Read current runs from beams, leaving Loom machine records unchanged. Batch
// lookups also support old beams assigned by number before a Loom master existed.
const runningContexts = async (userId, { completedLoomNumber, beamId } = {}) => {
  const historical = completedLoomNumber !== undefined;
  let query = WeavingBeam.find({ userId, status: historical ? "completed" : "loaded",
    ...(historical ? { loomNumber: completedLoomNumber } : {}), ...(beamId ? { _id: beamId } : {}) });
  if (historical) query = query.sort({ completedAt: -1, loadedAt: -1 }).limit(20);
  const beams = await query.lean();
  if (!beams.length) return [];
  const findRows = (Model, ids, fields = "") => Model.find({ userId, _id: { $in: [...new Set(ids.map(id).filter(Boolean))] } }).select(fields).lean();
  const map = (rows) => new Map(rows.map((row) => [id(row), row]));
  const sets = map(await findRows(WeavingBeamSet, beams.map((beam) => beam.beamSetId)));
  const receipts = map(await findRows(WeavingSizingReceipt, [...sets.values()].map((set) => set.sizingReceiptId)));
  const issues = map(await findRows(WeavingSizingIssue, [...receipts.values()].map((receipt) => receipt.issueId)));
  const contracts = map(await findRows(WeavingContract, [
    ...[...sets.values()].map((set) => set.contractId),
    ...[...receipts.values()].map((receipt) => receipt.contractId),
    ...[...issues.values()].map((issue) => issue.contractId),
  ], "type contractNo itemId contractType partyId partyName quantity unit"));
  const contexts = beams.map((beam) => {
    const beamSet = sets.get(id(beam.beamSetId)) || null;
    const receipt = receipts.get(id(beamSet?.sizingReceiptId));
    const issue = issues.get(id(receipt?.issueId));
    const linked = contracts.get(id(beamSet?.contractId || receipt?.contractId || issue?.contractId));
    const contract = isProductionContract(linked) ? linked : null;
    const ownership = contextFromSources(contract, { ...issue, ...receipt, ...beamSet,
      ownershipType: beamSet?.ownershipType || receipt?.ownershipType || issue?.ownershipType,
      fabricQualityId: beamSet?.fabricQualityId || receipt?.fabricQualityId || issue?.fabricQualityId,
      ownerPartyId: beamSet?.ownershipType ? beamSet.ownerPartyId : receipt?.ownershipType ? receipt.ownerPartyId : issue?.ownerPartyId,
    });
    return { beam, beamSet, contract, fabricQualityId: ownership.fabricQualityId, customerPartyId: ownership.customerPartyId, customerName: ownership.customerName,
      ownershipType: ownership.ownershipType || null, ownerPartyId: ownership.ownershipType === "party" ? ownership.ownerPartyId : null };
  });
  const [qualities, parties] = await Promise.all([
    findRows(WeavingFabricQuality, contexts.map((row) => row.fabricQualityId), "name code warpCount weftCount construction width brand cadReference"),
    findRows(WeavingParty, contexts.map((row) => row.ownerPartyId), "name"),
  ]);
  const qualityMap = map(qualities); const partyMap = map(parties);
  return contexts.map((row) => ({ ...row, quality: qualityMap.get(id(row.fabricQualityId)) || null, ownerParty: partyMap.get(id(row.ownerPartyId)) || null }));
};

const runForLoom = (runs, loom) => runs.find((run) => id(run.beam.activeLoomId) === id(loom) ||
  (!run.beam.activeLoomId && run.beam.loomNumber && run.beam.loomNumber === loom.loomNumber)) || null;
const attachLoomRuns = async (userId, looms) => {
  const runs = await runningContexts(userId);
  return looms.map((loom) => ({ ...loom, currentRun: runForLoom(runs, loom) }));
};

module.exports = { purchaseLineContext, contractProgress, assertContractIdentityEdit, productionIdentity, contextFromSources, attachProductionContexts, isProductionContract, contractIsOpen, receiptIdentity, upstreamOwnership, runningContexts, runForLoom, attachLoomRuns };
