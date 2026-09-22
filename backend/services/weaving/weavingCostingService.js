const crypto = require("crypto");

const WeavingBeamSet = require("../../models/WeavingBeamSet");
const WeavingCostSnapshot = require("../../models/WeavingCostSnapshot");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingKacchiParchi = require("../../models/WeavingKacchiParchi");
const WeavingKnottingJob = require("../../models/WeavingKnottingJob");
const WeavingPakkiSettlement = require("../../models/WeavingPakkiSettlement");
const WeavingPurchaseInvoice = require("../../models/WeavingPurchaseInvoice");
const WeavingRejectionReceipt = require("../../models/WeavingRejectionReceipt");
const WeavingSalesInvoice = require("../../models/WeavingSalesInvoice");
const WeavingSizingBill = require("../../models/WeavingSizingBill");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingStockTransaction = require("../../models/WeavingStockTransaction");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");

const COSTING_VERSION = 1;
const EPSILON = 0.000001;
const COMPONENT_KEYS = ["material", "warp", "weft", "sizing", "knotting", "otherDirect", "processing"];
const rebuildPromises = new Map();

const id = (value) => String(value?._id || value || "");
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const qty = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const dateKey = (value) => {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};
const unique = (values = []) => [...new Set(values.filter(Boolean))];
const emptyComponents = () => ({ material: 0, warp: 0, weft: 0, sizing: 0, knotting: 0, otherDirect: 0, processing: 0 });
const sumComponents = (components = {}) => money(
  Number(components.material || 0)
  + Number(components.processing || 0)
  + Number(components.otherDirect || 0),
);
const normalizeComponents = (components = {}) => {
  const result = emptyComponents();
  COMPONENT_KEYS.forEach((key) => { result[key] = money(components[key]); });
  result.total = sumComponents(result);
  result.knownTotal = result.total;
  return result;
};
const addComponents = (...items) => normalizeComponents(items.reduce((result, item) => {
  COMPONENT_KEYS.forEach((key) => { result[key] += Number(item?.[key] || 0); });
  return result;
}, emptyComponents()));
const scaleComponents = (components, ratio) => normalizeComponents(COMPONENT_KEYS.reduce((result, key) => {
  result[key] = Number(components?.[key] || 0) * Number(ratio || 0);
  return result;
}, {}));

const createBucket = () => ({ kg: 0, meter: 0, than: 0, pieces: 0, unknownKg: 0, unknownMeter: 0, components: emptyComponents() });
const addToBucket = (bucket, { kg = 0, meter = 0, than = 0, pieces = 0, components = {}, complete = true }) => {
  bucket.kg = qty(bucket.kg + kg); bucket.meter = qty(bucket.meter + meter);
  bucket.than = qty(bucket.than + than); bucket.pieces = qty(bucket.pieces + pieces);
  if (!complete) { bucket.unknownKg = qty(bucket.unknownKg + kg); bucket.unknownMeter = qty(bucket.unknownMeter + meter); }
  COMPONENT_KEYS.forEach((key) => { bucket.components[key] = money(bucket.components[key] + Number(components[key] || 0)); });
  return bucket;
};
const consumeFromBucket = (bucket, amount, basis = "kg", exactComponents = null) => {
  const quantityField = basis === "meter" ? "meter" : "kg";
  const unknownField = basis === "meter" ? "unknownMeter" : "unknownKg";
  const available = Number(bucket[quantityField] || 0);
  const requested = Math.max(0, Number(amount || 0));
  const ratio = available > EPSILON ? Math.min(1, requested / available) : 0;
  const components = exactComponents ? normalizeComponents(exactComponents) : scaleComponents(bucket.components, ratio);
  const unknownConsumed = qty(Number(bucket[unknownField] || 0) * ratio);
  bucket[quantityField] = qty(available - requested);
  if (basis === "meter" && available > EPSILON) {
    bucket.kg = qty(bucket.kg * Math.max(0, 1 - ratio));
    bucket.than = qty(bucket.than * Math.max(0, 1 - ratio));
    bucket.pieces = qty(bucket.pieces * Math.max(0, 1 - ratio));
    bucket.unknownKg = qty(bucket.unknownKg * Math.max(0, 1 - ratio));
  }
  bucket[unknownField] = qty(Number(bucket[unknownField] || 0) - unknownConsumed);
  COMPONENT_KEYS.forEach((key) => { bucket.components[key] = money(bucket.components[key] - Number(components[key] || 0)); });
  const reasons = [];
  if (requested > available + EPSILON) reasons.push("source quantity exceeds costed stock");
  if (unknownConsumed > EPSILON) reasons.push("source cost unavailable");
  return { components, complete: reasons.length === 0, missingReasons: reasons, quantity: requested };
};

const ownershipKey = (type, ownerPartyId) => type === "party" ? `party:${id(ownerPartyId)}` : "own";
const yarnBucketKey = ({ yarnId, locationType, locationId, ownershipType, ownerPartyId }) =>
  [id(yarnId), locationType, id(locationId), ownershipKey(ownershipType, ownerPartyId)].join("|");
const fabricBucketKey = ({ fabricQualityId, godownId, category, ownershipType, ownerPartyId, valuationUnit = "meter" }) =>
  [id(fabricQualityId), id(godownId) || "unassigned", category || "normal", ownershipKey(ownershipType, ownerPartyId), valuationUnit].join("|");
const statusFrom = (reasons, pending = false) => reasons.length ? (pending ? "pending_source_cost" : "partial") : "complete";

const makeSnapshot = ({ entityType, entityId = null, entityKey, date = "", scope = "combined", ownershipType = "", ownerPartyId = null, dimensions = {}, quantity = {}, components = {}, costStatus = "complete", allocationBasis = "", missingReasons = [], sourceRefs = {}, inventoryValue = 0, knownInventoryValue = 0, grossProfit = null, runToken }) => {
  const normalized = normalizeComponents(components);
  const kg = qty(quantity.kg); const meter = qty(quantity.meter);
  return {
    moduleScope: "weaving", entityType, entityId, entityKey, runToken,
    costingVersion: COSTING_VERSION, date: dateKey(date), scope, ownershipType,
    ownerPartyId: ownerPartyId || null, dimensions,
    quantity: { kg, meter, than: qty(quantity.than), pieces: qty(quantity.pieces) },
    components: normalized,
    unitCostKg: costStatus === "complete" && kg > EPSILON ? money(normalized.total / kg) : null,
    unitCostMeter: costStatus === "complete" && meter > EPSILON ? money(normalized.total / meter) : null,
    inventoryValue: money(inventoryValue), knownInventoryValue: money(knownInventoryValue),
    grossProfit: grossProfit === null ? null : money(grossProfit), costStatus,
    allocationBasis, missingReasons: unique(missingReasons), sourceRefs, calculatedAt: new Date(),
  };
};

const normalizePurchaseCostPerKg = (line) => {
  const kg = Number(line?.quantity || 0);
  const amount = Number(line?.amount || 0);
  return kg > EPSILON && Number.isFinite(amount) ? money(amount / kg) : null;
};

const eventSort = (a, b) => String(a.date).localeCompare(String(b.date))
  || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  || Number(a.rank || 0) - Number(b.rank || 0)
  || id(a.row).localeCompare(id(b.row));

const findYarnPurchaseLine = (movement, purchaseMap) => {
  const invoice = purchaseMap.get(id(movement.purchaseInvoiceId));
  const candidates = (invoice?.lines || []).filter((line) => id(line.yarnId) === id(movement.yarnId));
  return candidates.find((line) => line.destinationType === movement.destinationType
    && id(line.godownId) === id(movement.godownId)
    && id(line.sizingPartyId) === id(movement.sizingPartyId)
    && Math.abs(Number(line.quantity || 0) - Number(movement.quantityKg || 0)) < EPSILON)
    || (candidates.length === 1 ? candidates[0] : null);
};

const yarnLocation = (movement, source = false) => {
  if (source) return movement.sourceGodownId
    ? { locationType: "godown", locationId: movement.sourceGodownId }
    : { locationType: "sizing", locationId: movement.sizingPartyId };
  return movement.destinationType === "direct_sizing"
    ? { locationType: "sizing", locationId: movement.sizingPartyId }
    : { locationType: "godown", locationId: movement.godownId };
};

const replayYarn = ({ openings, movements, purchaseMap, runToken }) => {
  const buckets = new Map(); const snapshots = []; const movementCosts = new Map();
  const bucket = (details) => {
    const key = yarnBucketKey(details);
    if (!buckets.has(key)) buckets.set(key, { key, details, value: createBucket() });
    return buckets.get(key).value;
  };
  const events = [
    ...openings.map((row) => ({ row, kind: "opening", date: dateKey(row.createdAt), createdAt: row.createdAt, rank: 0 })),
    ...movements.filter((row) => !row.isVoided).map((row) => ({ row, kind: "movement", date: row.date, createdAt: row.createdAt, rank: row.movementType === "transfer_in" ? 4 : 2 })),
  ].sort(eventSort);

  events.forEach(({ row, kind }) => {
    if (kind === "opening") {
      const rate = Number(row.rate || 0); const reasons = rate > 0 ? [] : ["missing opening rate"];
      const components = { material: reasons.length ? 0 : money(row.quantity * rate) };
      const details = { yarnId: row.itemId, locationType: "godown", locationId: row.godownId, ownershipType: "own", ownerPartyId: null };
      addToBucket(bucket(details), { kg: row.quantity, components, complete: !reasons.length });
      snapshots.push(makeSnapshot({ entityType: "yarn_opening", entityId: row._id, entityKey: id(row._id), date: row.createdAt, scope: "own", ownershipType: "own", dimensions: details, quantity: { kg: row.quantity }, components, costStatus: statusFrom(reasons), allocationBasis: "actual_source", missingReasons: reasons, sourceRefs: { stockTransactionId: row._id }, runToken }));
      return;
    }

    const own = row.ownershipType !== "party"; const reasons = []; let result;
    const common = { yarnId: row.yarnId, ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId };
    if (["purchase_in", "party_inward"].includes(row.movementType)) {
      let components = emptyComponents(); let complete = true;
      if (own && row.movementType === "purchase_in") {
        const line = findYarnPurchaseLine(row, purchaseMap); const unitCost = normalizePurchaseCostPerKg(line);
        if (unitCost === null) { complete = false; reasons.push("missing purchase cost"); }
        else components.material = money(unitCost * row.quantityKg);
      }
      addToBucket(bucket({ ...common, ...yarnLocation(row) }), { kg: row.quantityKg, components, complete });
      result = { components: normalizeComponents(components), complete, missingReasons: reasons };
    } else if (["sizing_issue", "sale_out", "transfer_out", "weft_consumption"].includes(row.movementType)) {
      result = consumeFromBucket(bucket({ ...common, ...yarnLocation(row, true) }), row.quantityKg);
      if (row.movementType === "sizing_issue") addToBucket(bucket({ ...common, locationType: "sizing", locationId: row.sizingPartyId }), { kg: row.quantityKg, components: result.components, complete: result.complete });
    } else if (row.movementType === "sizing_receipt") {
      result = consumeFromBucket(bucket({ ...common, locationType: "sizing", locationId: row.sizingPartyId }), row.quantityKg);
    } else if (row.movementType === "sizing_return") {
      result = consumeFromBucket(bucket({ ...common, locationType: "sizing", locationId: row.sizingPartyId }), row.quantityKg);
      addToBucket(bucket({ ...common, ...yarnLocation(row) }), { kg: row.quantityKg, components: result.components, complete: result.complete });
    } else if (row.movementType === "transfer_in") {
      const source = movementCosts.get(`${id(row.stockAdjustmentId)}:transfer_out`);
      result = source || { components: normalizeComponents(), complete: !own, missingReasons: own ? ["transfer source cost unavailable"] : [] };
      addToBucket(bucket({ ...common, ...yarnLocation(row) }), { kg: row.quantityKg, components: result.components, complete: result.complete });
    } else if (row.movementType === "rewinder_recovery") {
      result = { components: normalizeComponents(), complete: true, missingReasons: [] };
      addToBucket(bucket({ ...common, ...yarnLocation(row) }), { kg: row.quantityKg, components: result.components, complete: true });
    } else if (["sale_return", "weft_consumption_reversal"].includes(row.movementType)) {
      const original = row.movementType === "sale_return"
        ? movementCosts.get(`sale:${id(row.salesInvoiceId)}`)
        : movementCosts.get(`movement:${id(row.reversalOfMovementId)}`);
      result = original || { components: normalizeComponents(), complete: !own, missingReasons: own ? ["original issue cost unavailable"] : [] };
      addToBucket(bucket({ ...common, ...yarnLocation(row) }), { kg: row.quantityKg, components: result.components, complete: result.complete });
    } else return;

    movementCosts.set(`movement:${id(row._id)}`, result);
    if (row.stockAdjustmentId) movementCosts.set(`${id(row.stockAdjustmentId)}:${row.movementType}`, result);
    if (row.movementType === "sale_out") movementCosts.set(`sale:${id(row.salesInvoiceId)}`, result);
    snapshots.push(makeSnapshot({ entityType: "yarn_movement", entityId: row._id, entityKey: id(row._id), date: row.date, scope: row.contractId ? "combined" : "own", ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId, dimensions: { ...common, ...yarnLocation(row, ["sizing_issue", "sale_out", "transfer_out", "weft_consumption"].includes(row.movementType)), movementType: row.movementType, beamSetId: row.beamSetId, contractId: row.contractId }, quantity: { kg: row.quantityKg }, components: result.components, costStatus: statusFrom(result.missingReasons || []), allocationBasis: own ? "weighted_average" : "not_applicable", missingReasons: result.missingReasons, sourceRefs: { movementId: row._id, purchaseInvoiceId: row.purchaseInvoiceId, salesInvoiceId: row.salesInvoiceId, sizingIssueId: row.sizingIssueId, sizingReceiptId: row.sizingReceiptId, stockAdjustmentId: row.stockAdjustmentId, reversalOfMovementId: row.reversalOfMovementId }, runToken }));
  });

  buckets.forEach(({ key, details, value }) => {
    const own = details.ownershipType !== "party"; const reasons = own && (value.unknownKg > EPSILON || value.kg < -EPSILON) ? [value.kg < -EPSILON ? "physical stock is negative" : "source cost unavailable"] : [];
    snapshots.push(makeSnapshot({ entityType: "yarn_inventory", entityKey: key, scope: "own", ownershipType: details.ownershipType, ownerPartyId: details.ownerPartyId, dimensions: details, quantity: { kg: value.kg }, components: value.components, costStatus: own ? statusFrom(reasons) : "not_applicable", allocationBasis: own ? "weighted_average" : "not_applicable", missingReasons: reasons, inventoryValue: own && !reasons.length ? sumComponents(value.components) : 0, knownInventoryValue: own ? sumComponents(value.components) : 0, runToken }));
  });
  return { snapshots, movementCosts };
};

const buildBeamAndFoldingCosts = ({ beamSets, receipts, bills, knottingJobs, foldings, yarnMovementSnapshots, runToken }) => {
  const snapshots = []; const beamCosts = new Map(); const foldingCosts = new Map();
  const yarnByReceipt = new Map(); const weftBySet = new Map();
  const reversedWeftIds = new Set(yarnMovementSnapshots
    .filter((snapshot) => snapshot.dimensions?.movementType === "weft_consumption_reversal")
    .map((snapshot) => id(snapshot.sourceRefs?.reversalOfMovementId)));
  yarnMovementSnapshots.forEach((snapshot) => {
    const movementType = snapshot.dimensions?.movementType;
    if (movementType === "sizing_receipt") {
      const key = id(snapshot.sourceRefs?.sizingReceiptId); const rows = yarnByReceipt.get(key) || []; rows.push(snapshot); yarnByReceipt.set(key, rows);
    }
    if (movementType === "weft_consumption" && !reversedWeftIds.has(id(snapshot.entityId))) {
      const key = id(snapshot.dimensions?.beamSetId); const rows = weftBySet.get(key) || []; rows.push(snapshot); weftBySet.set(key, rows);
    }
  });
  const receiptMap = new Map(receipts.map((row) => [id(row), row]));
  const billsByReceipt = new Map(); bills.filter((row) => row.status === "posted").forEach((row) => { const key = id(row.receiptId); const list = billsByReceipt.get(key) || []; list.push(row); billsByReceipt.set(key, list); });
  const jobsBySet = new Map(); knottingJobs.filter((row) => row.status === "approved" && ["piece", "bonus"].includes(row.earningKind)).forEach((row) => { const key = id(row.beamSetId); const list = jobsBySet.get(key) || []; list.push(row); jobsBySet.set(key, list); });
  const foldsBySet = new Map(); foldings.filter((row) => row.status === "posted").forEach((row) => { const key = id(row.beamSetId); const list = foldsBySet.get(key) || []; list.push(row); foldsBySet.set(key, list); });

  beamSets.forEach((set) => {
    const receipt = receiptMap.get(id(set.sizingReceiptId)); const warpRows = yarnByReceipt.get(id(set.sizingReceiptId)) || []; const weftRows = weftBySet.get(id(set._id)) || [];
    const sizingRows = billsByReceipt.get(id(set.sizingReceiptId)) || []; const jobs = jobsBySet.get(id(set._id)) || []; const reasons = [];
    const warp = money(warpRows.reduce((sum, row) => sum + Number(row.components?.material || 0), 0));
    const weft = money(weftRows.reduce((sum, row) => sum + Number(row.components?.material || 0), 0));
    const sizing = money(sizingRows.reduce((sum, row) => sum + Number(row.grossAmount || 0), 0));
    const knotting = money(jobs.reduce((sum, row) => sum + Number(row.amount || 0), 0));
    warpRows.concat(weftRows).forEach((row) => reasons.push(...(row.missingReasons || [])));
    if (!receipt || !warpRows.length) reasons.push("missing Warp consumption cost");
    if (!weftRows.length) reasons.push("missing Weft consumption");
    if (!sizingRows.length) reasons.push("Sizing Bill not posted/linked");
    if (set.status !== "completed") reasons.push("incomplete Beam Set");
    const components = { warp, weft, sizing, knotting, processing: money(sizing + knotting), material: money(warp + weft) };
    const snapshot = makeSnapshot({ entityType: "beam_set", entityId: set._id, entityKey: id(set._id), date: receipt?.date || set.createdAt, scope: "combined", dimensions: { beamSetId: set._id, sizingReceiptId: set.sizingReceiptId, contractId: set.contractId, fabricQualityId: set.fabricQualityId, status: set.status }, quantity: { kg: receipt?.netWeightKg || 0, meter: set.length || 0 }, components, costStatus: statusFrom(unique(reasons), set.status !== "completed"), allocationBasis: "actual_source", missingReasons: reasons, sourceRefs: { sizingReceiptId: set.sizingReceiptId, sizingBillIds: sizingRows.map((row) => row._id), knottingJobIds: jobs.map((row) => row._id) }, runToken });
    beamCosts.set(id(set._id), snapshot); snapshots.push(snapshot);
  });

  foldings.filter((row) => row.status === "posted").forEach((row) => {
    const source = beamCosts.get(id(row.beamSetId)); const group = foldsBySet.get(id(row.beamSetId)) || []; const totalKg = group.reduce((sum, item) => sum + Number(item.weightKg || 0), 0); const totalMeter = group.reduce((sum, item) => sum + Number(item.meter || 0), 0);
    const basis = totalKg > EPSILON ? "kg" : "meter_fallback"; const denominator = basis === "kg" ? totalKg : totalMeter; const numerator = basis === "kg" ? Number(row.weightKg || 0) : Number(row.meter || 0); const reasons = [...(source?.missingReasons || [])];
    if (!source) reasons.push("missing historical Beam Set linkage");
    if (basis === "meter_fallback") reasons.push("KG unavailable; Meter fallback used");
    const components = source && denominator > EPSILON ? scaleComponents(source.components, numerator / denominator) : normalizeComponents();
    const snapshot = makeSnapshot({ entityType: "folding", entityId: row._id, entityKey: id(row._id), date: row.date, scope: row.ownershipType === "party" ? "conversion" : "own", ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId, dimensions: { foldingEntryId: row._id, beamSetId: row.beamSetId, contractId: row.contractId, fabricQualityId: row.fabricQualityId, godownId: row.godownId, grade: row.grade }, quantity: { kg: row.weightKg, meter: row.meter, than: 1 }, components, costStatus: statusFrom(unique(reasons), source?.costStatus === "pending_source_cost"), allocationBasis: basis, missingReasons: reasons, sourceRefs: { beamSetId: row.beamSetId, beamId: row.beamId }, runToken });
    foldingCosts.set(id(row._id), snapshot); snapshots.push(snapshot);
  });
  return { snapshots, foldingCosts };
};

const replayFabric = ({ openings, foldings, movements, purchaseMap, foldingCosts, pakkis, kacchis, rejectionReceipts, runToken }) => {
  const snapshots = []; const movementCosts = new Map(); const buckets = new Map();
  const bucket = (details) => { const key = fabricBucketKey(details); if (!buckets.has(key)) buckets.set(key, { key, details, value: createBucket() }); return buckets.get(key).value; };
  const pakkiMap = new Map(pakkis.map((row) => [id(row), row])); const kacchiMap = new Map(kacchis.map((row) => [id(row), row])); const rejectionReceiptMap = new Map(rejectionReceipts.map((row) => [id(row), row]));
  const events = [
    ...openings.map((row) => ({ kind: "opening", row, date: dateKey(row.createdAt), createdAt: row.createdAt, rank: 0 })),
    ...foldings.filter((row) => row.status === "posted").map((row) => ({ kind: "folding", row, date: row.date, createdAt: row.createdAt, rank: 1 })),
    ...movements.filter((row) => !row.isVoided).map((row) => ({ kind: "movement", row, date: row.date, createdAt: row.createdAt, rank: row.movementType.endsWith("_in") ? 4 : 2 })),
  ].sort(eventSort);

  events.forEach(({ kind, row }) => {
    if (kind === "opening") {
      const category = "normal"; const valuationUnit = row.unit === "KG" ? "kg" : "meter"; const details = { fabricQualityId: row.itemId, godownId: row.godownId, category, ownershipType: "own", ownerPartyId: null, valuationUnit }; const reasons = [];
      if (Number(row.rate || 0) <= 0) reasons.push("missing opening rate");
      const openingKg = row.unit === "KG" ? Number(row.quantity || 0) : 0;
      const openingMeter = row.unit === "Yard" ? Number(row.quantity || 0) * 0.9144 : row.unit === "Meter" ? Number(row.quantity || 0) : 0;
      const components = { material: Number(row.rate || 0) > 0 ? money(row.quantity * row.rate) : 0 };
      addToBucket(bucket(details), { kg: openingKg, meter: openingMeter, components, complete: !reasons.length });
      snapshots.push(makeSnapshot({ entityType: "fabric_opening", entityId: row._id, entityKey: id(row._id), date: row.createdAt, scope: "own", ownershipType: "own", dimensions: { ...details, unit: row.unit, sourceQuantity: row.quantity }, quantity: { kg: openingKg, meter: openingMeter }, components, costStatus: statusFrom(reasons), allocationBasis: "actual_source", missingReasons: reasons, sourceRefs: { stockTransactionId: row._id }, runToken })); return;
    }
    if (kind === "folding") {
      const source = foldingCosts.get(id(row._id)); const categories = [{ category: "normal", meter: row.goodMeter }, { category: "b", meter: row.bGradeMeter }, { category: "rejected", meter: row.rejectedMeter }].filter((item) => item.meter > EPSILON);
      categories.forEach((item) => { const ratio = Number(row.meter || 0) > EPSILON ? item.meter / row.meter : 0; const components = scaleComponents(source?.components, ratio); const details = { fabricQualityId: row.fabricQualityId, godownId: row.godownId, category: item.category, ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId }; addToBucket(bucket(details), { meter: item.meter, kg: Number(row.weightKg || 0) * ratio, than: ratio, components, complete: source?.costStatus === "complete" }); }); return;
    }

    const details = { fabricQualityId: row.fabricQualityId, godownId: row.godownId, category: row.category, ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId }; const own = row.ownershipType !== "party"; let result;
    if (row.movementType === "purchase_in") {
      const invoice = purchaseMap.get(id(row.purchaseInvoiceId)); const line = (invoice?.lines || []).find((item) => id(item._id) === id(row.purchaseLineId)); const reasons = line && Number(line.amount) >= 0 ? [] : ["missing purchase cost"]; const components = { material: reasons.length ? 0 : line.amount };
      addToBucket(bucket(details), { meter: row.meter, kg: row.weightKg, than: row.thanCount, pieces: row.pieceCount, components, complete: !reasons.length }); result = { components: normalizeComponents(components), complete: !reasons.length, missingReasons: reasons };
    } else if (["quality_transfer_out", "sale_out", "rejection_reversal"].includes(row.movementType)) {
      result = consumeFromBucket(bucket(details), row.meter, "meter");
    } else if (row.movementType === "kacchi_out") {
      const source = foldingCosts.get(id(row.sourceFoldingEntryId)); const folding = foldings.find((item) => id(item._id) === id(row.sourceFoldingEntryId)); const ratio = Number(folding?.meter || 0) > EPSILON ? Math.min(1, Number(row.meter || 0) / Number(folding.meter)) : 0; const exact = source ? scaleComponents(source.components, ratio) : null;
      result = consumeFromBucket(bucket(details), row.meter, "meter", exact);
      if (source?.missingReasons?.length) {
        result.complete = false;
        result.missingReasons = unique([...result.missingReasons, ...source.missingReasons]);
      }
    } else if (["quality_transfer_in", "kacchi_return", "sale_return", "rejection_recovery"].includes(row.movementType)) {
      let source;
      if (row.movementType === "quality_transfer_in") source = movementCosts.get(`${id(row.stockAdjustmentId)}:quality_transfer_out`);
      if (row.movementType === "sale_return") source = movementCosts.get(`sale:${id(row.salesInvoiceId)}`);
      if (row.movementType === "kacchi_return") source = movementCosts.get(`kacchi:${id(row.kacchiId)}:${id(row.sourceFoldingEntryId)}`);
      if (row.movementType === "rejection_recovery") {
        const receipt = rejectionReceiptMap.get(id(row.rejectionReceiptId)); const pakki = pakkiMap.get(id(row.pakkiId || receipt?.pakkiId)); const kacchi = kacchiMap.get(id(pakki?.sourceKacchiId || pakki?.kacchiId)); const sourceLines = kacchi?.lines || []; const sourceRows = sourceLines.map((line) => movementCosts.get(`kacchi:${id(kacchi._id)}:${id(line.foldingEntryId)}`)).filter(Boolean); const total = addComponents(...sourceRows.map((item) => item.components)); const gross = Number(pakki?.grossMeter || kacchi?.totalMeter || 0); const missingReasons = sourceRows.flatMap((item) => item.missingReasons || []); if (sourceRows.length !== sourceLines.length) missingReasons.push("source Kacchi/Folding cost unavailable"); source = gross > EPSILON ? { components: scaleComponents(total, Number(row.meter || 0) / gross), complete: sourceRows.length === sourceLines.length && sourceRows.every((item) => item.complete), missingReasons } : null;
      }
      result = source || { components: normalizeComponents(), complete: !own, missingReasons: own ? ["source cost unavailable"] : [] };
      addToBucket(bucket(details), { meter: row.meter, kg: row.weightKg, than: row.thanCount, pieces: row.pieceCount, components: result.components, complete: result.complete });
    } else return;
    movementCosts.set(`movement:${id(row._id)}`, result); movementCosts.set(`${id(row.stockAdjustmentId)}:${row.movementType}`, result);
    if (row.movementType === "sale_out") movementCosts.set(`sale:${id(row.salesInvoiceId)}`, result);
    if (row.movementType === "kacchi_out") movementCosts.set(`kacchi:${id(row.kacchiId)}:${id(row.sourceFoldingEntryId)}`, result);
    snapshots.push(makeSnapshot({ entityType: "fabric_movement", entityId: row._id, entityKey: id(row._id), date: row.date, scope: row.ownershipType === "party" ? "conversion" : "own", ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId, dimensions: { ...details, movementType: row.movementType }, quantity: { meter: row.meter, kg: row.weightKg, than: row.thanCount, pieces: row.pieceCount }, components: result.components, costStatus: statusFrom(result.missingReasons || []), allocationBasis: row.sourceFoldingEntryId ? "actual_source" : own ? "weighted_average" : "not_applicable", missingReasons: result.missingReasons, sourceRefs: { movementId: row._id, foldingEntryId: row.sourceFoldingEntryId, kacchiId: row.kacchiId, pakkiId: row.pakkiId, purchaseInvoiceId: row.purchaseInvoiceId, salesInvoiceId: row.salesInvoiceId, rejectionReceiptId: row.rejectionReceiptId, stockAdjustmentId: row.stockAdjustmentId }, runToken }));
  });
  buckets.forEach(({ key, details, value }) => { const own = details.ownershipType !== "party"; const hasNegativeStock = value.meter < -EPSILON || value.kg < -EPSILON; const hasUnknownCost = value.unknownMeter > EPSILON || value.unknownKg > EPSILON; const reasons = own && (hasNegativeStock || hasUnknownCost) ? [hasNegativeStock ? "physical stock is negative" : "source cost unavailable"] : []; snapshots.push(makeSnapshot({ entityType: "fabric_inventory", entityKey: key, scope: "own", ownershipType: details.ownershipType, ownerPartyId: details.ownerPartyId, dimensions: details, quantity: { meter: value.meter, kg: value.kg, than: value.than, pieces: value.pieces }, components: value.components, costStatus: own ? statusFrom(reasons) : "not_applicable", allocationBasis: own ? "weighted_average" : "not_applicable", missingReasons: reasons, inventoryValue: own && !reasons.length ? sumComponents(value.components) : 0, knownInventoryValue: own ? sumComponents(value.components) : 0, runToken })); });
  return { snapshots, movementCosts };
};

const buildSalesCosts = ({ invoices, pakkis, kacchis, yarnMovementCosts, fabricMovementCosts, runToken }) => {
  const pakkiMap = new Map(pakkis.map((row) => [id(row), row])); const kacchiMap = new Map(kacchis.map((row) => [id(row), row]));
  return invoices.filter((row) => row.status === "posted").map((invoice) => {
    const reasons = []; let cost; let allocationBasis = "actual_source";
    if (invoice.saleSource === "direct" && invoice.saleNature === "yarn") cost = yarnMovementCosts.get(`sale:${id(invoice._id)}`);
    else if (invoice.saleSource === "direct" && invoice.fabricQualityId) cost = fabricMovementCosts.get(`sale:${id(invoice._id)}`);
    else if (invoice.saleSource === "pakki") {
      const pakki = pakkiMap.get(id(invoice.sourcePakkiId || invoice.pakkiId)); const kacchi = kacchiMap.get(id(pakki?.sourceKacchiId || pakki?.kacchiId));
      const sourceLines = kacchi?.lines || []; const sourceRows = sourceLines.map((line) => fabricMovementCosts.get(`kacchi:${id(kacchi._id)}:${id(line.foldingEntryId)}`)).filter(Boolean); const source = addComponents(...sourceRows.map((item) => item.components)); const gross = Number(pakki?.grossMeter || kacchi?.totalMeter || 0); const soldMeter = Math.max(0, gross - Number(pakki?.rejectionMeter || 0));
      if (!pakki || !kacchi || !sourceRows.length || sourceRows.length !== sourceLines.length || gross <= EPSILON) reasons.push("source Kacchi/Folding cost unavailable");
      sourceRows.forEach((item) => reasons.push(...(item.missingReasons || [])));
      cost = { components: gross > EPSILON ? scaleComponents(source, soldMeter / gross) : normalizeComponents(), complete: !reasons.length, missingReasons: reasons };
    } else if (invoice.saleNature === "other" && !invoice.fabricQualityId && !invoice.yarnId) {
      cost = { components: normalizeComponents(), complete: true, missingReasons: [] }; allocationBasis = "not_applicable";
    }
    if (!cost) cost = { components: normalizeComponents(), complete: false, missingReasons: ["sales source cost unavailable"] };
    reasons.push(...(cost.missingReasons || [])); const components = normalizeComponents(cost.components); const status = allocationBasis === "not_applicable" ? "not_applicable" : statusFrom(unique(reasons)); const revenue = money(Number(invoice.subtotal || 0) - Number(invoice.discountAmount || 0));
    return makeSnapshot({ entityType: "sales_invoice", entityId: invoice._id, entityKey: id(invoice._id), date: invoice.invoiceDate, scope: invoice.saleNature === "conversion" ? "conversion" : invoice.saleNature === "other" ? "other" : "own", ownershipType: invoice.ownershipType, dimensions: { invoiceId: invoice._id, saleNature: invoice.saleNature, saleSource: invoice.saleSource, partyId: invoice.partyId, fabricQualityId: invoice.fabricQualityId, yarnId: invoice.yarnId, contractId: invoice.contractId, revenue }, quantity: { kg: invoice.weightKg || (invoice.uom === "KG" ? invoice.quantity : 0), meter: invoice.uom === "Meter" ? invoice.quantity : 0, than: invoice.thanCount, pieces: invoice.pieceCount }, components, costStatus: status, allocationBasis, missingReasons: reasons, grossProfit: status === "complete" || status === "not_applicable" ? money(revenue - components.total) : null, sourceRefs: { salesInvoiceId: invoice._id, pakkiId: invoice.sourcePakkiId || invoice.pakkiId, stockMovementId: invoice.stockMovementId }, runToken });
  });
};

const loadSourceData = async (userId) => {
  const [openings, yarnMovements, fabricMovements, purchases, receipts, beamSets, bills, knottingJobs, foldings, kacchis, pakkis, invoices, rejectionReceipts] = await Promise.all([
    WeavingStockTransaction.find({ userId }).lean(), WeavingYarnMovement.find({ userId }).lean(), WeavingFabricMovement.find({ userId }).lean(), WeavingPurchaseInvoice.find({ userId }).lean(), WeavingSizingReceipt.find({ userId }).lean(), WeavingBeamSet.find({ userId }).lean(), WeavingSizingBill.find({ userId }).lean(), WeavingKnottingJob.find({ userId }).lean(), WeavingFoldingEntry.find({ userId }).lean(), WeavingKacchiParchi.find({ userId }).lean(), WeavingPakkiSettlement.find({ userId }).lean(), WeavingSalesInvoice.find({ userId }).lean(), WeavingRejectionReceipt.find({ userId }).lean(),
  ]);
  return { openings, yarnMovements, fabricMovements, purchases, receipts, beamSets, bills, knottingJobs, foldings, kacchis, pakkis, invoices, rejectionReceipts };
};

const rebuildCosting = async (userId) => {
  const source = await loadSourceData(userId); const runToken = crypto.randomUUID(); const purchaseMap = new Map(source.purchases.filter((row) => row.status !== "void").map((row) => [id(row), row]));
  const yarn = replayYarn({ openings: source.openings.filter((row) => row.itemType === "yarn"), movements: source.yarnMovements, purchaseMap, runToken });
  const production = buildBeamAndFoldingCosts({ beamSets: source.beamSets, receipts: source.receipts.filter((row) => row.status === "posted"), bills: source.bills, knottingJobs: source.knottingJobs, foldings: source.foldings, yarnMovementSnapshots: yarn.snapshots.filter((row) => row.entityType === "yarn_movement"), runToken });
  const fabric = replayFabric({ openings: source.openings.filter((row) => row.itemType === "fabric"), foldings: source.foldings, movements: source.fabricMovements, purchaseMap, foldingCosts: production.foldingCosts, pakkis: source.pakkis, kacchis: source.kacchis, rejectionReceipts: source.rejectionReceipts, runToken });
  const sales = buildSalesCosts({ invoices: source.invoices, pakkis: source.pakkis, kacchis: source.kacchis, yarnMovementCosts: yarn.movementCosts, fabricMovementCosts: fabric.movementCosts, runToken });
  const snapshots = [...yarn.snapshots, ...production.snapshots, ...fabric.snapshots, ...sales];
  if (snapshots.length) await WeavingCostSnapshot.bulkWrite(snapshots.map((snapshot) => ({ updateOne: { filter: { userId, entityType: snapshot.entityType, entityKey: snapshot.entityKey, costingVersion: COSTING_VERSION }, update: { $set: { ...snapshot, userId } }, upsert: true } })), { ordered: false });
  const missingReasons = unique(snapshots.flatMap((row) => row.missingReasons || [])); const partialCount = snapshots.filter((row) => ["partial", "pending_source_cost"].includes(row.costStatus)).length;
  const run = makeSnapshot({ entityType: "costing_run", entityKey: "current", costStatus: partialCount ? "partial" : "complete", allocationBasis: "not_applicable", missingReasons, dimensions: { snapshotCount: snapshots.length, partialCount, completedAt: new Date().toISOString(), dirty: false, dirtyAt: null }, sourceRefs: { runToken }, runToken });
  await WeavingCostSnapshot.findOneAndUpdate({ userId, entityType: "costing_run", entityKey: "current", costingVersion: COSTING_VERSION }, { $set: { ...run, userId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await WeavingCostSnapshot.deleteMany({ userId, entityType: { $ne: "costing_run" }, costingVersion: COSTING_VERSION, runToken: { $ne: runToken } });
  return { costingVersion: COSTING_VERSION, runToken, snapshotCount: snapshots.length, partialCount, costCoverage: partialCount ? "partial" : "complete", missingReasons };
};

const currentRun = (userId) => WeavingCostSnapshot.findOne({ userId, entityType: "costing_run", entityKey: "current", costingVersion: COSTING_VERSION }).lean();
const isCostingRunDirty = (run) => Boolean(run?.dimensions?.dirty);
const markWeavingCostingDirty = async (userId, reason = "source_mutation") => {
  if (!userId) return { matchedCount: 0, modifiedCount: 0 };
  return WeavingCostSnapshot.updateOne(
    { userId, entityType: "costing_run", entityKey: "current", costingVersion: COSTING_VERSION },
    { $set: { "dimensions.dirty": true, "dimensions.dirtyAt": new Date(), "dimensions.dirtyReason": reason } },
  );
};
const withCostingInvalidation = (
  mutation,
  reason,
  shouldInvalidate = () => true,
) => async (userId, ...args) => {
  const result = await mutation(userId, ...args);
  if (!shouldInvalidate(result, ...args)) return result;
  try {
    await markWeavingCostingDirty(userId, reason);
  } catch (error) {
    console.error("Failed to mark Weaving costing dirty", error);
  }
  return result;
};
const ensureFreshRun = async (userId) => {
  const run = await currentRun(userId);
  if (!isCostingRunDirty(run)) return run;

  const key = id(userId);
  if (!rebuildPromises.has(key)) {
    const rebuild = rebuildCosting(userId)
      .then(() => currentRun(userId))
      .finally(() => rebuildPromises.delete(key));
    rebuildPromises.set(key, rebuild);
  }
  return rebuildPromises.get(key);
};
const getInventoryValuation = async (userId) => {
  const run = await ensureFreshRun(userId); if (!run) return { costingVersion: COSTING_VERSION, costCoverage: "partial", missingReasons: ["Costing has not been calculated"], yarn: { rows: [], quantityKg: 0, inventoryValue: 0 }, fabric: { rows: [], meter: 0, kg: 0, inventoryValue: 0 } };
  const rows = await WeavingCostSnapshot.find({ userId, runToken: run.runToken, entityType: { $in: ["yarn_inventory", "fabric_inventory"] } }).lean(); const yarnRows = rows.filter((row) => row.entityType === "yarn_inventory"); const fabricRows = rows.filter((row) => row.entityType === "fabric_inventory");
  const inventoryRows = [...yarnRows, ...fabricRows]; const incomplete = inventoryRows.filter((row) => ["partial", "pending_source_cost"].includes(row.costStatus));
  const ownYarnRows = yarnRows.filter((row) => row.ownershipType === "own"); const ownFabricRows = fabricRows.filter((row) => row.ownershipType === "own");
  const yarnIncomplete = ownYarnRows.some((row) => ["partial", "pending_source_cost"].includes(row.costStatus)); const fabricIncomplete = ownFabricRows.some((row) => ["partial", "pending_source_cost"].includes(row.costStatus));
  const yarnQuantityKg = qty(ownYarnRows.reduce((sum, row) => sum + row.quantity.kg, 0)); const yarnKnownValue = money(ownYarnRows.reduce((sum, row) => sum + row.knownInventoryValue, 0)); const yarnInventoryValue = yarnIncomplete ? null : money(ownYarnRows.reduce((sum, row) => sum + row.inventoryValue, 0));
  const fabricMeter = qty(ownFabricRows.reduce((sum, row) => sum + row.quantity.meter, 0)); const fabricKg = qty(ownFabricRows.reduce((sum, row) => sum + row.quantity.kg, 0)); const fabricKnownValue = money(ownFabricRows.reduce((sum, row) => sum + row.knownInventoryValue, 0)); const fabricInventoryValue = fabricIncomplete ? null : money(ownFabricRows.reduce((sum, row) => sum + row.inventoryValue, 0));
  const meterValue = money(ownFabricRows.filter((row) => Number(row.quantity?.meter || 0) > EPSILON).reduce((sum, row) => sum + row.inventoryValue, 0)); const kgValue = money(ownFabricRows.filter((row) => Number(row.quantity?.kg || 0) > EPSILON).reduce((sum, row) => sum + row.inventoryValue, 0));
  return { costingVersion: COSTING_VERSION, calculatedAt: run.calculatedAt, costCoverage: incomplete.length ? "partial" : "complete", missingReasons: unique(incomplete.flatMap((row) => row.missingReasons || [])), yarn: { rows: yarnRows, quantityKg: yarnQuantityKg, partyQuantityKg: qty(yarnRows.filter((row) => row.ownershipType === "party").reduce((sum, row) => sum + row.quantity.kg, 0)), inventoryValue: yarnInventoryValue, knownInventoryValue: yarnKnownValue, averageCostKg: !yarnIncomplete && yarnQuantityKg > EPSILON ? money(yarnInventoryValue / yarnQuantityKg) : null }, fabric: { rows: fabricRows, meter: fabricMeter, kg: fabricKg, partyMeter: qty(fabricRows.filter((row) => row.ownershipType === "party").reduce((sum, row) => sum + row.quantity.meter, 0)), inventoryValue: fabricInventoryValue, knownInventoryValue: fabricKnownValue, averageCostMeter: !fabricIncomplete && fabricMeter > EPSILON ? money(meterValue / fabricMeter) : null, averageCostKg: !fabricIncomplete && fabricKg > EPSILON ? money(kgValue / fabricKg) : null } };
};

const getSalesCosting = async (userId, query = {}) => {
  const run = await ensureFreshRun(userId); if (!run) return { run: null, rows: [] };
  const match = { userId, runToken: run.runToken, entityType: "sales_invoice" };
  if (query.from || query.to) match.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (["own", "conversion"].includes(query.scope)) match.scope = query.scope;
  let rows = await WeavingCostSnapshot.find(match).lean();
  if (query.partyId) rows = rows.filter((row) => id(row.dimensions?.partyId) === id(query.partyId));
  if (query.saleType) rows = rows.filter((row) => row.dimensions?.saleNature === query.saleType);
  if (query.fabricQualityId) rows = rows.filter((row) => id(row.dimensions?.fabricQualityId) === id(query.fabricQualityId));
  return { run, rows };
};

module.exports = {
  COSTING_VERSION, getInventoryValuation, getSalesCosting, markWeavingCostingDirty, rebuildCosting, withCostingInvalidation,
  _test: { addComponents, addToBucket, buildBeamAndFoldingCosts, buildSalesCosts, consumeFromBucket, createBucket, fabricBucketKey, isCostingRunDirty, makeSnapshot, normalizePurchaseCostPerKg, replayFabric, replayYarn, scaleComponents, sumComponents, yarnBucketKey },
};
