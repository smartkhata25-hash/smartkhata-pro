const mongoose = require("mongoose");

const WeavingBeam = require("../../models/WeavingBeam");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingParty = require("../../models/WeavingParty");
const WeavingPurchaseInvoice = require("../../models/WeavingPurchaseInvoice");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingStockTransaction = require("../../models/WeavingStockTransaction");
const WeavingStockLock = require("../../models/WeavingStockLock");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const costing = require("./weavingCostingService");

const round = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const id = (value) => String(value?._id || value || "");
const ownershipKey = (type, ownerPartyId) =>
  type === "party" ? `party:${id(ownerPartyId)}` : "own";
const balanceKey = ({ yarnId, godownId, ownershipType, ownerPartyId }) =>
  [id(yarnId), id(godownId), ownershipKey(ownershipType, ownerPartyId)].join("|");

const movementLabel = (type) => ({
  opening: "Opening Stock",
  purchase_in: "Purchase In",
  party_inward: "Party Yarn Received",
  sizing_issue: "Issued to Sizing",
  sizing_return: "Returned from Sizing",
  sizing_receipt: "Consumed at Sizing",
  sale_out: "Yarn Sale",
  sale_return: "Yarn Sale Return",
  transfer_out: "Yarn Transfer Out",
  transfer_in: "Yarn Transfer In",
  rewinder_recovery: "Rewinder Recovery",
  weft_consumption: "Weft Yarn Consumption",
  weft_consumption_reversal: "Weft Consumption Reversal",
}[type] || type);

const toGodownEffect = (row) => {
  if (row.itemType === "yarn" && row.transactionType === "opening") {
    return { yarnId: row.itemId, godownId: row.godownId, ownershipType: "own", ownerPartyId: null, quantityKg: round(row.quantity), packageQty: Number(row.packageQty || 0), smallCones: Number(row.smallCones || 0), largeCones: Number(row.largeCones || 0), sign: 1, type: "opening", date: row.createdAt };
  }
  if (row.isVoided) return null;
  if (["purchase_in", "party_inward"].includes(row.movementType) && row.destinationType === "godown" && row.godownId) {
    return { ...row, sign: 1, type: row.movementType };
  }
  if (row.movementType === "sizing_issue" && row.sourceGodownId) {
    return { ...row, godownId: row.sourceGodownId, sign: -1, type: row.movementType };
  }
  if (row.movementType === "sizing_return" && row.godownId) {
    return { ...row, sign: 1, type: row.movementType };
  }
  if (row.movementType === "sale_out" && row.sourceGodownId) {
    return { ...row, godownId: row.sourceGodownId, sign: -1, type: row.movementType };
  }
  if (row.movementType === "sale_return" && row.godownId) {
    return { ...row, sign: 1, type: row.movementType };
  }
  if (row.movementType === "transfer_out" && row.sourceGodownId) {
    return { ...row, godownId: row.sourceGodownId, sign: -1, type: row.movementType };
  }
  if (["transfer_in", "rewinder_recovery"].includes(row.movementType) && row.godownId) {
    return { ...row, sign: 1, type: row.movementType };
  }
  if (row.movementType === "weft_consumption" && row.sourceGodownId) {
    return { ...row, godownId: row.sourceGodownId, sign: -1, type: row.movementType };
  }
  if (row.movementType === "weft_consumption_reversal" && row.godownId) {
    return { ...row, sign: 1, type: row.movementType };
  }
  return null;
};

const accumulateEffects = (rows) => {
  const balances = new Map();
  rows.map(toGodownEffect).filter(Boolean).forEach((row) => {
    const key = balanceKey(row);
    const current = balances.get(key) || { yarnId: id(row.yarnId), godownId: id(row.godownId), ownershipType: row.ownershipType === "party" ? "party" : "own", ownerPartyId: row.ownershipType === "party" ? id(row.ownerPartyId) : "", kg: 0, packages: 0, smallCones: 0, largeCones: 0 };
    current.kg = round(current.kg + row.sign * Number(row.quantityKg || 0));
    current.packages = round(current.packages + row.sign * Number(row.packageQty || 0));
    current.smallCones = round(current.smallCones + row.sign * Number(row.smallCones || 0));
    current.largeCones = round(current.largeCones + row.sign * Number(row.largeCones || 0));
    balances.set(key, current);
  });
  return balances;
};

const loadStockRows = async (userId, filters = {}, session = null) => {
  const openingQuery = { userId, itemType: "yarn", transactionType: "opening" };
  const movementQuery = { userId, isVoided: { $ne: true } };
  if (filters.yarnId) { openingQuery.itemId = filters.yarnId; movementQuery.yarnId = filters.yarnId; }
  const [openings, movements] = await Promise.all([
    WeavingStockTransaction.find(openingQuery).session(session || null).lean(),
    WeavingYarnMovement.find(movementQuery).session(session || null).lean(),
  ]);
  return [...openings, ...movements];
};

const getGodownBalance = async ({ userId, yarnId, godownId, ownershipType = "own", ownerPartyId = null, session = null }) => {
  const balances = accumulateEffects(await loadStockRows(userId, { yarnId }, session));
  return balances.get(balanceKey({ yarnId, godownId, ownershipType, ownerPartyId })) || { kg: 0, packages: 0, smallCones: 0, largeCones: 0 };
};

const getSummary = async (userId, filters = {}) => {
  const [rows, yarns, godowns, parties] = await Promise.all([
    loadStockRows(userId, filters),
    WeavingYarn.find({ userId, ...(filters.yarnId ? { _id: filters.yarnId } : {}) }).lean(),
    WeavingGodown.find({ userId }).select("name").lean(),
    WeavingParty.find({ userId }).select("name").lean(),
  ]);
  const godownMap = new Map(godowns.map((row) => [id(row), row.name]));
  const partyMap = new Map(parties.map((row) => [id(row), row.name]));
  let balances = [...accumulateEffects(rows).values()];
  if (filters.godownId) balances = balances.filter((row) => row.godownId === id(filters.godownId));
  if (filters.ownershipType) balances = balances.filter((row) => row.ownershipType === filters.ownershipType);
  const grouped = new Map();
  yarns.forEach((yarn) => grouped.set(id(yarn), { yarn, ownKg: 0, partyKg: 0, totalKg: 0, packages: 0, smallCones: 0, largeCones: 0, godowns: new Set(), godownBreakdown: new Map(), ownershipBreakdown: new Map() }));
  balances.forEach((row) => {
    const target = grouped.get(row.yarnId); if (!target) return;
    target[row.ownershipType === "party" ? "partyKg" : "ownKg"] = round(target[row.ownershipType === "party" ? "partyKg" : "ownKg"] + row.kg);
    target.totalKg = round(target.totalKg + row.kg); target.packages = round(target.packages + row.packages); target.smallCones = round(target.smallCones + row.smallCones); target.largeCones = round(target.largeCones + row.largeCones);
    if (Math.abs(row.kg) > 0.000001) target.godowns.add(row.godownId);
    const godown = target.godownBreakdown.get(row.godownId) || { godownId: row.godownId, godownName: godownMap.get(row.godownId) || "Godown", ownKg: 0, partyKg: 0, totalKg: 0 };
    godown[row.ownershipType === "party" ? "partyKg" : "ownKg"] = round(godown[row.ownershipType === "party" ? "partyKg" : "ownKg"] + row.kg); godown.totalKg = round(godown.totalKg + row.kg); target.godownBreakdown.set(row.godownId, godown);
    const ownerKey = row.ownershipType === "party" ? row.ownerPartyId : "own"; const owner = target.ownershipBreakdown.get(ownerKey) || { ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId, ownerName: row.ownershipType === "party" ? partyMap.get(row.ownerPartyId) || "Party" : "Own Yarn", kg: 0 }; owner.kg = round(owner.kg + row.kg); target.ownershipBreakdown.set(ownerKey, owner);
  });
  const search = String(filters.search || "").trim().toLowerCase();
  const items = [...grouped.values()].map((row) => ({ ...row, godownCount: row.godowns.size, godowns: undefined, godownBreakdown: [...row.godownBreakdown.values()], ownershipBreakdown: [...row.ownershipBreakdown.values()] })).filter((row) => !search || [row.yarn.name, row.yarn.count, row.yarn.quality, row.yarn.millBrand].some((value) => String(value || "").toLowerCase().includes(search)));
  const yarnMap = new Map(yarns.map((row) => [id(row), row]));
  const stockRows = balances.map((row) => ({ ...row, yarn: yarnMap.get(row.yarnId), godownName: godownMap.get(row.godownId) || "Godown", ownerName: row.ownershipType === "party" ? partyMap.get(row.ownerPartyId) || "Party" : "Own Yarn" })).filter((row) => row.kg > 0 || row.packages > 0 || row.smallCones > 0 || row.largeCones > 0);
  return { items, stockRows, totals: items.reduce((sum, row) => ({ ownKg: round(sum.ownKg + row.ownKg), partyKg: round(sum.partyKg + row.partyKg), totalKg: round(sum.totalKg + row.totalKg) }), { ownKg: 0, partyKg: 0, totalKg: 0 }), filters: { godowns, parties } };
};

const getLedger = async (userId, yarnId, filters = {}) => {
  const rows = await loadStockRows(userId, { yarnId });
  const effects = rows.map(toGodownEffect).filter(Boolean).filter((row) => !filters.godownId || id(row.godownId) === id(filters.godownId)).filter((row) => !filters.ownershipType || row.ownershipType === filters.ownershipType).filter((row) => !filters.ownerPartyId || id(row.ownerPartyId) === id(filters.ownerPartyId)).sort((a, b) => String(a.date || a.createdAt).localeCompare(String(b.date || b.createdAt)) || String(a.createdAt).localeCompare(String(b.createdAt)));
  const ids = (field) => [...new Set(effects.map((row) => id(row[field])).filter(Boolean))];
  const [yarn, godowns, parties, contracts, purchases, issues, receipts] = await Promise.all([
    WeavingYarn.findOne({ _id: yarnId, userId }).lean(), WeavingGodown.find({ _id: { $in: ids("godownId") }, userId }).select("name").lean(), WeavingParty.find({ _id: { $in: [...ids("ownerPartyId"), ...ids("sizingPartyId")] }, userId }).select("name").lean(), WeavingContract.find({ _id: { $in: ids("contractId") }, userId }).select("contractNo").lean(), WeavingPurchaseInvoice.find({ _id: { $in: ids("purchaseInvoiceId") }, userId }).select("purchaseNo").lean(), WeavingSizingIssue.find({ _id: { $in: ids("sizingIssueId") }, userId }).select("issueNo").lean(), WeavingSizingReceipt.find({ _id: { $in: ids("sizingReceiptId") }, userId }).select("receiptNo").lean(),
  ]);
  if (!yarn) { const error = new Error("Yarn not found"); error.statusCode = 404; throw error; }
  const map = (list, field) => new Map(list.map((row) => [id(row), row[field]])); const godownMap = map(godowns, "name"), partyMap = map(parties, "name"), contractMap = map(contracts, "contractNo"), purchaseMap = map(purchases, "purchaseNo"), issueMap = map(issues, "issueNo"), receiptMap = map(receipts, "receiptNo");
  let running = 0;
  return { yarn, rows: effects.map((row) => { const quantity = round(row.quantityKg || 0); const inward = row.sign > 0 ? quantity : 0, outward = row.sign < 0 ? quantity : 0; running = round(running + inward - outward); return { _id: row._id, date: row.date || row.createdAt, type: row.type, typeLabel: movementLabel(row.type), reference: purchaseMap.get(id(row.purchaseInvoiceId)) || issueMap.get(id(row.sizingIssueId)) || receiptMap.get(id(row.sizingReceiptId)) || row.stockAdjustmentNo || row.lotReference || "Opening", ownerName: row.ownershipType === "party" ? partyMap.get(id(row.ownerPartyId)) || "Party" : "Own Yarn", godownName: godownMap.get(id(row.godownId)) || "", sizingPartyName: partyMap.get(id(row.sizingPartyId)) || "", contractNo: contractMap.get(id(row.contractId)) || "", inKg: inward, outKg: outward, runningBalance: running, packageType: row.packageType || "", packageQty: Number(row.packageQty || 0), smallCones: Number(row.smallCones || 0), largeCones: Number(row.largeCones || 0), notes: row.notes || "" }; }), closingKg: running };
};

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const clean = (value = "") => String(value || "").trim();
const sessionOptions = (session) => (session ? { session } : {});
const setSession = (query, session) => (session ? query.session(session) : query);
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
const yarnLockKey = (line) => ["weft", line.yarnId, line.godownId, line.ownershipType, line.ownerPartyId || "own"].map(id).join(":");

const runAtomic = async (work) => {
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    if (!/Transaction numbers are only allowed|replica set member|does not support transactions/i.test(error.message || "")) throw error;
    return work(null);
  } finally { await session.endSession(); }
};

const withLocks = async (userId, keys, work) => {
  const acquired = [];
  try {
    for (const key of [...new Set(keys)].sort()) {
      await WeavingStockLock.deleteMany({ userId, key, expiresAt: { $lte: new Date() } });
      try { await WeavingStockLock.create({ userId, key, expiresAt: new Date(Date.now() + 60000) }); acquired.push(key); }
      catch (error) { if (error?.code === 11000) throw fail("This Yarn stock is being updated. Please retry.", 409); throw error; }
    }
    return await work();
  } finally {
    if (acquired.length) await WeavingStockLock.deleteMany({ userId, key: { $in: acquired } });
  }
};

const getWeftConsumptionMeta = async (userId) => {
  const [looms, summary] = await Promise.all([
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
    getSummary(userId),
  ]);
  const loaded = await WeavingBeam.find({ userId, status: "loaded", activeLoomId: { $in: looms.map((row) => row._id) } })
    .populate("beamSetId", "setNo contractId fabricQualityId")
    .select("beamNo beamSetId activeLoomId")
    .lean();
  const contractIds = loaded.map((row) => row.beamSetId?.contractId).filter(Boolean);
  const qualityIds = loaded.map((row) => row.beamSetId?.fabricQualityId).filter(Boolean);
  const [contracts, qualities] = await Promise.all([
    WeavingContract.find({ _id: { $in: contractIds }, userId }).select("contractNo contractType partyId").lean(),
    WeavingFabricQuality.find({ _id: { $in: qualityIds }, userId }).select("name code warpCount weftCount width").lean(),
  ]);
  const contractMap = new Map(contracts.map((row) => [id(row), row]));
  const qualityMap = new Map(qualities.map((row) => [id(row), row]));
  const activeProduction = loaded.map((beam) => ({
    loomId: beam.activeLoomId, beamId: beam._id, beamNo: beam.beamNo,
    beamSetId: beam.beamSetId?._id, setNo: beam.beamSetId?.setNo || "",
    contract: contractMap.get(id(beam.beamSetId?.contractId)) || null,
    quality: qualityMap.get(id(beam.beamSetId?.fabricQualityId)) || null,
  }));
  return { looms, activeProduction, stockRows: summary.stockRows };
};

const normalizeConsumptionLines = async (userId, payload, production) => {
  if (!Array.isArray(payload.lines) || !payload.lines.length) throw fail("Add at least one Weft Yarn line");
  const normalized = []; const reserved = new Map();
  for (let index = 0; index < payload.lines.length; index += 1) {
    const source = payload.lines[index]; const quantityKg = round(source.quantityKg);
    if (quantityKg <= 0) throw fail("Actual Consumed KG must be greater than zero");
    const ownershipType = source.ownershipType === "party" ? "party" : "own";
    const ownerPartyId = ownershipType === "party" ? source.ownerPartyId : null;
    const [yarn, godown, owner] = await Promise.all([
      WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }).select("_id"),
      WeavingGodown.findOne({ _id: source.godownId, userId, isActive: true }).select("_id"),
      ownerPartyId ? WeavingParty.findOne({ _id: ownerPartyId, userId, isActive: true, isHidden: false }).select("_id") : null,
    ]);
    if (!yarn || !godown || (ownerPartyId && !owner)) throw fail("Select valid active Yarn stock");
    const line = { yarnId: yarn._id, godownId: godown._id, ownershipType, ownerPartyId: ownerPartyId || null, quantityKg };
    const key = yarnLockKey(line); const available = await getGodownBalance({ userId, ...line }); const remaining = round(available.kg - (reserved.get(key) || 0));
    if (quantityKg > remaining + 0.000001) throw fail(`Only ${Math.max(0, remaining)} KG matching Yarn is available`, 409);
    reserved.set(key, round((reserved.get(key) || 0) + quantityKg));
    normalized.push({ ...line, requestLineKey: `${index + 1}:${id(yarn._id)}:${id(godown._id)}:${ownershipType}:${id(ownerPartyId) || "own"}` });
  }
  if (production?.contract?.contractType === "conversion") {
    const wrongParty = normalized.some((line) => line.ownershipType === "party" && id(line.ownerPartyId) !== id(production.contract.partyId));
    if (wrongParty) throw fail("Party Yarn must belong to the Conversion Contract party", 409);
  }
  return normalized;
};

const createWeftConsumption = async (userId, payload, actorId) => {
  const requestKey = clean(payload.requestKey); if (!requestKey) throw fail("Request key is required");
  if (!validDate(payload.date)) throw fail("Valid consumption date is required");
  const existing = await WeavingYarnMovement.find({ userId, requestKey, movementType: "weft_consumption" }).sort({ requestLineKey: 1 });
  if (existing.length) return { batchId: existing[0].consumptionBatchId, movements: existing };
  const beam = await WeavingBeam.findOne({ _id: payload.beamId, userId, activeLoomId: payload.loomId, status: "loaded" }).populate("beamSetId");
  if (!beam?.beamSetId || id(beam.beamSetId._id) !== id(payload.beamSetId)) throw fail("Select the active Beam Set on this Loom", 409);
  const [contract, quality] = await Promise.all([
    beam.beamSetId.contractId ? WeavingContract.findOne({ _id: beam.beamSetId.contractId, userId }).lean() : null,
    beam.beamSetId.fabricQualityId ? WeavingFabricQuality.findOne({ _id: beam.beamSetId.fabricQualityId, userId }).lean() : null,
  ]);
  const production = { contract, quality }; const lines = await normalizeConsumptionLines(userId, payload, production);
  return withLocks(userId, lines.map(yarnLockKey), async () => {
    const duplicate = await WeavingYarnMovement.find({ userId, requestKey, movementType: "weft_consumption" }).sort({ requestLineKey: 1 });
    if (duplicate.length) return { batchId: duplicate[0].consumptionBatchId, movements: duplicate };
    try {
      return await runAtomic(async (session) => {
        const confirmed = new Map();
        for (const line of lines) {
          const available = await getGodownBalance({ userId, ...line, session });
          const key = yarnLockKey(line); const remaining = round(Number(available.kg || 0) - (confirmed.get(key) || 0));
          if (line.quantityKg > remaining + 0.000001) throw fail(`Only ${Math.max(0, remaining)} KG matching Yarn is available`, 409);
          confirmed.set(key, round((confirmed.get(key) || 0) + line.quantityKg));
        }
        const batchId = new mongoose.Types.ObjectId();
        const movements = await WeavingYarnMovement.insertMany(lines.map((line) => ({
          userId, moduleScope: "weaving", yarnId: line.yarnId, date: payload.date,
          movementType: "weft_consumption", ownershipType: line.ownershipType,
          ownerPartyId: line.ownerPartyId, quantityKg: line.quantityKg,
          sourceGodownId: line.godownId, destinationType: "godown",
          requestKey, requestLineKey: line.requestLineKey, consumptionBatchId: batchId,
          loomId: beam.activeLoomId, beamId: beam._id, beamSetId: beam.beamSetId._id,
          contractId: contract?._id || null, fabricQualityId: quality?._id || null,
          notes: clean(payload.notes),
        })), sessionOptions(session));
        return { batchId, movements, createdBy: actorId || userId };
      });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await WeavingYarnMovement.find({ userId, requestKey, movementType: "weft_consumption" }).sort({ requestLineKey: 1 });
        if (duplicate.length) return { batchId: duplicate[0].consumptionBatchId, movements: duplicate };
      }
      throw error;
    }
  });
};

const reverseWeftConsumption = async (userId, batchId, reason, actorId) => {
  const reversalReason = clean(reason); if (!reversalReason) throw fail("Reversal reason is required");
  const originals = await WeavingYarnMovement.find({ userId, consumptionBatchId: batchId, movementType: "weft_consumption", isVoided: false });
  if (!originals.length) throw fail("Weft Consumption batch not found", 404);
  const existing = await WeavingYarnMovement.find({ userId, reversalOfMovementId: { $in: originals.map((row) => row._id) }, movementType: "weft_consumption_reversal" });
  if (existing.length === originals.length) return { batchId, movements: existing, reversed: true };
  const downstream = await WeavingFoldingEntry.exists({ userId, beamSetId: { $in: originals.map((row) => row.beamSetId) }, status: "posted", dispatchStatus: "kacchi_out" });
  if (downstream) throw fail("Dispatched Fabric already depends on this consumption. Reverse the downstream sale flow first.", 409);
  const reversalBatchId = new mongoose.Types.ObjectId();
  const reversalDate = new Date().toISOString().slice(0, 10);
  try {
    await WeavingYarnMovement.bulkWrite(originals.map((row) => ({ updateOne: {
      filter: { userId, reversalOfMovementId: row._id },
      update: { $setOnInsert: {
        userId, moduleScope: "weaving", yarnId: row.yarnId,
        date: reversalDate, movementType: "weft_consumption_reversal",
        ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId,
        quantityKg: row.quantityKg, destinationType: "godown", godownId: row.sourceGodownId,
        requestKey: `reverse:${id(batchId)}`, requestLineKey: id(row._id),
        consumptionBatchId: reversalBatchId, reversalOfMovementId: row._id,
        loomId: row.loomId, beamId: row.beamId, beamSetId: row.beamSetId,
        contractId: row.contractId, fabricQualityId: row.fabricQualityId,
        notes: `${reversalReason} (${id(actorId || userId)})`,
      } },
      upsert: true,
    } })), { ordered: false });
    const movements = await WeavingYarnMovement.find({ userId, reversalOfMovementId: { $in: originals.map((row) => row._id) }, movementType: "weft_consumption_reversal" });
    if (movements.length !== originals.length) throw fail("Weft Consumption reversal is incomplete. Please retry.", 409);
    return { batchId, reversalBatchId, movements, reversed: true };
  } catch (error) {
    if (error?.code === 11000) {
      const duplicate = await WeavingYarnMovement.find({ userId, reversalOfMovementId: { $in: originals.map((row) => row._id) }, movementType: "weft_consumption_reversal" });
      if (duplicate.length === originals.length) return { batchId, movements: duplicate, reversed: true };
    }
    throw error;
  }
};

module.exports = { createWeftConsumption: costing.withCostingInvalidation(createWeftConsumption, "weft_consumption"), getGodownBalance, getLedger, getSummary, getWeftConsumptionMeta, reverseWeftConsumption: costing.withCostingInvalidation(reverseWeftConsumption, "weft_consumption"), _test: { accumulateEffects, balanceKey, movementLabel, toGodownEffect } };
