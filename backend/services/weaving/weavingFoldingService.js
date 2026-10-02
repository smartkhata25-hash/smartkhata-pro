const WeavingContract = require("../../models/WeavingContract");
const mongoose = require("mongoose");
const { completeBeamInSession, reopenBeamInSession } = require("./weavingBeamService");
const { attachLoomRuns, attachProductionContexts, productionIdentity, runningContexts } = require("./weavingProductionContextService");
const Counter = require("../../models/Counter");
const Employee = require("../../models/Employee");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingParty = require("../../models/WeavingParty");
const costing = require("./weavingCostingService");
const { lbsFromKg } = require("./weavingOperationsUtils");
const settingsService = require("./weavingSettingsService");

const FOLDING_THAN_COUNTER_KEY = "weaving_folding_than";
const round = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const clean = (value = "") => String(value || "").trim();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const formatThanNo = (sequence) => `TH-${String(Number(sequence) || 0).padStart(6, "0")}`;
const sequenceFromThanNo = (thanNo = "") => Number(String(thanNo).match(/(\d+)$/)?.[1]) || 0;

const gradeSplit = ({ grade = "a", meter, goodMeter, bGradeMeter, rejectedMeter }) => {
  const total = round(meter);
  if (total <= 0) throw fail("Meter must be greater than zero");
  if (grade === "a") return { grade, goodMeter: total, bGradeMeter: 0, rejectedMeter: 0 };
  if (grade === "b") return { grade, goodMeter: 0, bGradeMeter: total, rejectedMeter: 0 };
  if (grade === "rejected") return { grade, goodMeter: 0, bGradeMeter: 0, rejectedMeter: total };
  const split = { grade: "partial", goodMeter: round(goodMeter), bGradeMeter: round(bGradeMeter), rejectedMeter: round(rejectedMeter) };
  if ([split.goodMeter, split.bGradeMeter, split.rejectedMeter].some((value) => value < 0) || Math.abs(round(split.goodMeter + split.bGradeMeter + split.rejectedMeter) - total) > 0.000001) {
    throw fail("Good, B Grade and Reject Meter must equal Total Meter");
  }
  return split;
};

const splitStockRows = (entry) => [
  { grade: "a", meter: entry.goodMeter },
  { grade: "b", meter: entry.bGradeMeter },
  { grade: "rejected", meter: entry.rejectedMeter },
].filter((row) => row.meter > 0).map((row) => ({
  ...row,
  than: round(row.meter / entry.meter),
  weightKg: round(entry.weightKg * row.meter / entry.meter),
  weightLbs: round(entry.weightLbs * row.meter / entry.meter),
}));

const resolveLoom = async (userId, loomId, historicalBeamId = null, includePrevious = true) => {
  const loom = await WeavingLoom.findOne({ _id: loomId, userId, isActive: true }).lean();
  if (!loom) throw fail("Active Loom not found", 404);
  if (historicalBeamId) {
    const [run] = await runningContexts(userId, { completedLoomNumber: loom.loomNumber, beamId: historicalBeamId });
    if (!run) throw fail("Completed Beam not found on this Loom", 409);
    return { loom, ...run, historical: true };
  }
  const [withRun] = await attachLoomRuns(userId, [loom]);
  const previousRuns = includePrevious ? await runningContexts(userId, { completedLoomNumber: loom.loomNumber }) : [];
  return { loom, previousRuns, beam: null, beamSet: null, contract: null, quality: null, ownershipType: null, ownerPartyId: null, ...withRun.currentRun };
};

const assertQualitySelection = (resolvedQualityId, selectedQualityId) => {
  if (resolvedQualityId && selectedQualityId && String(resolvedQualityId) !== String(selectedQualityId)) {
    throw fail("Selected Fabric Quality does not match the active Beam on this Loom", 409);
  }
  return resolvedQualityId || selectedQualityId || null;
};

const getLegacySequence = async (userId) => {
  const latest = await WeavingFoldingEntry.findOne({ userId }).sort({ thanNo: -1 }).select("thanNo").lean();
  return sequenceFromThanNo(latest?.thanNo);
};

const seedThanCounter = async (userId) => {
  const legacySequence = await getLegacySequence(userId);
  try {
    await Counter.findOneAndUpdate(
      { userId, type: FOLDING_THAN_COUNTER_KEY },
      { $max: { seq: legacySequence }, $setOnInsert: { userId, type: FOLDING_THAN_COUNTER_KEY } },
      { upsert: true, setDefaultsOnInsert: false },
    );
  } catch (error) {
    // A simultaneous first allocation may win the unique-key upsert race.
    if (error?.code !== 11000) throw error;
  }
};

const nextThanNo = async (userId) => {
  await seedThanCounter(userId);
  const counter = await Counter.findOneAndUpdate(
    { userId, type: FOLDING_THAN_COUNTER_KEY },
    { $inc: { seq: 1 } },
    { new: true },
  );
  return formatThanNo(counter.seq);
};

const previewNextThanNo = async (userId) => {
  const [counter, legacySequence] = await Promise.all([
    Counter.findOne({ userId, type: FOLDING_THAN_COUNTER_KEY }).select("seq").lean(),
    getLegacySequence(userId),
  ]);
  return formatThanNo(Math.max(Number(counter?.seq) || 0, legacySequence) + 1);
};

const meta = async (userId) => {
  const [looms, employees, godowns, fabrics, nextPreview, parties, contracts, productionTrackingMode] = await Promise.all([
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
    Employee.find({ userId, moduleScope: "weaving", isDeleted: false, status: "active" }).select("name employeeNo").sort({ name: 1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code warpCount weftCount construction width brand cadReference").sort({ name: 1 }).lean(),
    previewNextThanNo(userId),
    WeavingParty.find({ userId, isActive: true, isHidden: { $ne: true } }).select("name").sort({ name: 1 }).lean(),
    WeavingContract.find({ userId, type: "sales" }).select("type contractType contractNo partyId partyName itemId quantity unit status expiryDate").sort({ contractDate: -1 }).lean(),
    settingsService.getMode(userId),
  ]);
  return { looms: await attachLoomRuns(userId, looms), employees, godowns, fabrics, parties, contracts: attachProductionContexts(contracts).contracts, nextThanNo: nextPreview, productionTrackingMode };
};

const buildPayload = async (userId, body, existing = null) => {
  // Editing an old Than on the same Loom must not move it to the next run.
  const keepRun = existing && String(existing.loomId) === String(body.loomId);
  const resolved = keepRun ? {
    loom: { _id: existing.loomId, loomNumber: existing.loomNumberSnapshot },
    beam: existing.beamId ? { _id: existing.beamId, beamNo: existing.beamNoSnapshot } : null,
    beamSet: existing.beamSetId ? { _id: existing.beamSetId, setNo: existing.setNoSnapshot } : null,
    contract: existing.contractId ? { _id: existing.contractId, contractNo: existing.contractNoSnapshot } : null,
    quality: await WeavingFabricQuality.findOne({ _id: existing.fabricQualityId, userId }).lean(),
    ownershipType: existing.ownershipType || null, ownerPartyId: existing.ownerPartyId,
  } : await resolveLoom(userId, body.loomId, body.historicalBeamId || null, false);
  if (!existing && !resolved.beam) throw fail("No valid current or historical Beam run is available on this Loom. Load a Beam first or change the Production Tracking Method in Weaving Settings.", 409);
  if (Object.prototype.hasOwnProperty.call(body, "expectedBeamId") && String(body.expectedBeamId || "") !== String(resolved.beam?._id || "")) {
    throw fail("The Loom run has changed. Select the Loom again before saving.", 409);
  }
  const knownContractId = resolved.contract?._id || null;
  if ((keepRun || resolved.contract || resolved.beam && resolved.quality && resolved.ownershipType) && Object.prototype.hasOwnProperty.call(body, "contractId") && String(body.contractId || "") !== String(knownContractId || "")) throw fail("Production Contract must match this Loom / Than run", 409);
  let manual = null;
  if (!keepRun && !knownContractId && body.contractId) {
    manual = await productionIdentity(userId, body);
    resolved.contract = await WeavingContract.findOne({ _id: manual.contractId, userId }).lean();
  }
  const ownershipType = body.ownershipType || resolved.ownershipType || manual?.ownershipType;
  const ownerPartyId = ownershipType === "party" ? body.ownerPartyId || resolved.ownerPartyId || manual?.ownerPartyId : null;
  if (!["own", "party"].includes(ownershipType)) throw fail("Select Own Production or a production Party");
  if (resolved.ownershipType && (ownershipType !== resolved.ownershipType ||
    (ownershipType === "party" && String(ownerPartyId || "") !== String(resolved.ownerPartyId || "")))) {
    throw fail("Selected production Party does not match the active Beam on this Loom", 409);
  }
  if (ownershipType === "party" && (!ownerPartyId || !await WeavingParty.exists({ _id: ownerPartyId, userId }))) {
    throw fail("Select a valid production Party");
  }
  const selectedQualityId = assertQualitySelection(resolved.quality?._id || manual?.fabricQualityId, body.fabricQualityId);
  if (!selectedQualityId) throw fail("Fabric Quality is required");
  const quality = resolved.quality || await WeavingFabricQuality.findOne({ _id: selectedQualityId, userId, isActive: true }).lean();
  if (!quality) throw fail("Active Fabric Quality not found", 404);
  const meter = round(body.meter);
  const weightKg = round(body.weightKg);
  if (weightKg <= 0) throw fail("Weight KG must be greater than zero");
  const split = gradeSplit({ ...body, meter });
  let checker = null;
  let godown = null;
  if (body.checkedByEmployeeId) {
    checker = await Employee.findOne({ _id: body.checkedByEmployeeId, userId, moduleScope: "weaving", isDeleted: false, status: "active" });
    if (!checker) throw fail("Active checker not found");
  }
  if (body.godownId) {
    godown = await WeavingGodown.findOne({ _id: body.godownId, userId, isActive: true });
    if (!godown) throw fail("Active Godown not found");
  }
  const { loom, beam, beamSet, contract } = resolved;
  return {
    date: clean(body.date), loomId: loom._id, beamId: beam?._id || null,
    beamSetId: beamSet?._id || null, contractId: contract?._id || null,
    fabricQualityId: quality._id, godownId: godown?._id || null,
    ownershipType, ownerPartyId,
    checkedByEmployeeId: checker?._id || null,
    qualitySnapshot: { name: quality.name, code: quality.code, warpCount: quality.warpCount, weftCount: quality.weftCount, construction: quality.construction, width: quality.width, brand: quality.brand, cadReference: quality.cadReference },
    loomNumberSnapshot: loom.loomNumber, beamNoSnapshot: beam?.beamNo || "",
    setNoSnapshot: beamSet?.setNo || "", contractNoSnapshot: contract?.contractNo || "",
    meter, weightKg, weightLbs: lbsFromKg(weightKg), ...split,
    defectReason: clean(body.defectReason), notes: clean(body.notes),
  };
};

const create = async (userId, body) => {
  await settingsService.requireMode(userId, ["detailed"], "Detailed Than-wise Folding is only available when Production Tracking Method is Detailed.");
  const payload = await buildPayload(userId, body);
  if (!payload.date) throw fail("Date is required");
  if (body.beamCompletionTriggered === true) {
    if (!payload.beamId) throw fail("Select the currently loaded Beam before completing it.", 409);
    const thanNo = await nextThanNo(userId);
    return withCompletionTransaction(async (session) => {
      await completeBeamInSession({ userId, beamId: payload.beamId, loomId: payload.loomId, session });
      const [entry] = await WeavingFoldingEntry.create([{ ...payload, userId, moduleScope: "weaving", thanNo, beamCompletionTriggered: true }], { session });
      return entry;
    });
  }
  return WeavingFoldingEntry.create({ ...payload, userId, moduleScope: "weaving", thanNo: await nextThanNo(userId) });
};

const withCompletionTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    if (error.code === 11000 && (error.keyPattern?.activeLoomId || error.keyPattern?.loomNumber)) throw fail("The original Loom now has another Beam loaded. Complete or unload it before reopening this Beam.", 409);
    if (/Transaction numbers are only allowed|replica set member|does not support transactions/i.test(error.message || "")) throw fail("Beam completion changes require database transaction support. No Folding or Beam changes were saved.", 503);
    throw error;
  } finally { await session.endSession(); }
};

const update = async (userId, entryId, body) => {
  if (Object.prototype.hasOwnProperty.call(body, "beamCompletionTriggered")) {
    return withCompletionTransaction(async (session) => {
      const existing = await WeavingFoldingEntry.findOne({ _id: entryId, userId, status: "posted", activeKacchiId: null }).session(session);
      if (!existing) throw fail("Folding Entry not found", 404);
      if (String(existing.loomId) !== String(body.loomId)) throw fail("Keep the original Loom when editing Beam completion.", 409);
      const completing = body.beamCompletionTriggered === true;
      const payload = await buildPayload(userId, body, existing);
      if (completing !== Boolean(existing.beamCompletionTriggered)) {
        if (!existing.beamId) throw fail("This Than has no Beam to complete.", 409);
        const change = completing ? completeBeamInSession : reopenBeamInSession;
        await change({ userId, beamId: existing.beamId, loomId: existing.loomId, session });
      }
      Object.assign(existing, payload, { beamCompletionTriggered: completing });
      return existing.save({ session });
    });
  }
  const existing = await WeavingFoldingEntry.findOne({ _id: entryId, userId, status: "posted", activeKacchiId: null });
  if (!existing) throw fail("Folding Entry not found", 404);
  if (existing.beamCompletionTriggered && String(existing.loomId) !== String(body.loomId)) throw fail("Keep the original Loom on the Beam completion entry.", 409);
  Object.assign(existing, await buildPayload(userId, body, existing));
  return existing.save();
};

const voidEntry = async (userId, actorId, entryId, reason) => {
  const entry = await WeavingFoldingEntry.findOne({ _id: entryId, userId, status: "posted", activeKacchiId: null });
  if (!entry) throw fail("Folding Entry not found", 404);
  if (entry.beamCompletionTriggered) throw fail("Undo Last Than / Complete Beam from Edit before voiding this entry.", 409);
  entry.status = "void"; entry.voidedAt = new Date(); entry.voidedBy = actorId; entry.voidReason = clean(reason);
  return entry.save();
};

const list = (userId, query = {}) => {
  const filter = { userId, status: { $ne: "void" } };
  if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (query.loomId) filter.loomId = query.loomId;
  return WeavingFoldingEntry.find(filter).populate("loomId", "name loomNumber").populate("fabricQualityId", "name code").populate("godownId", "name").populate("checkedByEmployeeId", "name employeeNo").populate("ownerPartyId", "name").populate("contractId", "type contractNo contractType partyId partyName").sort({ date: -1, createdAt: -1 }).limit(250).lean();
};

const stockSummary = async (userId, query = {}) => {
  const match = { userId, status: "posted" };
  if (query.from || query.to) match.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  ["fabricQualityId", "godownId", "loomId", "contractId"].forEach((field) => { if (query[field]) match[field] = query[field]; });
  const entries = await WeavingFoldingEntry.find(match).lean();
  const movementMatch = { userId, isVoided: false };
  if (query.from || query.to) movementMatch.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  ["fabricQualityId", "godownId"].forEach((field) => { if (query[field]) movementMatch[field] = query[field]; });
  const movements = await WeavingFabricMovement.find(movementMatch).lean();
  let rows = entries.flatMap((entry) => splitStockRows(entry).map((split) => ({ entry, ...split })));
  rows.push(...movements.map((movement) => { const sign = movement.direction === "in" ? 1 : -1; return { entry: { fabricQualityId: movement.fabricQualityId, godownId: movement.godownId, qualitySnapshot: {}, ownershipType: movement.ownershipType, ownerPartyId: movement.ownerPartyId }, grade: movement.category === "normal" ? "a" : movement.category, meter: sign * movement.meter, than: sign * Number(movement.thanCount || 0), pieceCount: sign * Number(movement.pieceCount || 0), weightKg: sign * Number(movement.weightKg || 0), weightLbs: sign * Number(movement.weightKg || 0) * 2.2046226218 }; }));
  if (query.grade) rows = rows.filter((row) => row.grade === query.grade);
  const groups = new Map();
  rows.forEach((row) => {
    const entry = row.entry;
    const key = [entry.fabricQualityId, entry.godownId || "unassigned", row.grade, entry.ownershipType || "unknown", entry.ownerPartyId || ""].map(String).join("|");
    const current = groups.get(key) || { fabricQualityId: entry.fabricQualityId, quality: entry.qualitySnapshot, godownId: entry.godownId, grade: row.grade, category: row.grade === "a" ? "normal" : row.grade, ownershipType: entry.ownershipType || "unknown", ownerPartyId: entry.ownerPartyId || null, than: 0, pieceCount: 0, meter: 0, kg: 0, lbs: 0 };
    current.than += row.than; current.pieceCount += Number(row.pieceCount || 0); current.meter = round(current.meter + row.meter); current.kg = round(current.kg + row.weightKg); current.lbs = round(current.lbs + row.weightLbs); groups.set(key, current);
  });
  const result = [...groups.values()];
  const qualityIds = [...new Set(result.map((row) => String(row.fabricQualityId)))];
  const godownIds = [...new Set(result.map((row) => String(row.godownId || "")).filter(Boolean))];
  const ownerPartyIds = [...new Set(result.map((row) => String(row.ownerPartyId || "")).filter(Boolean))];
  const [qualities, godowns, ownerParties] = await Promise.all([
    WeavingFabricQuality.find({ _id: { $in: qualityIds }, userId }).select("name code warpCount weftCount width brand").lean(),
    WeavingGodown.find({ _id: { $in: godownIds }, userId }).select("name").lean(),
    WeavingParty.find({ _id: { $in: ownerPartyIds }, userId }).select("name").lean(),
  ]);
  const qualityMap = new Map(qualities.map((row) => [String(row._id), row]));
  const godownMap = new Map(godowns.map((row) => [String(row._id), row.name]));
  const ownerPartyMap = new Map(ownerParties.map((row) => [String(row._id), row.name]));
  result.forEach((row) => { row.quality = qualityMap.get(String(row.fabricQualityId)) || row.quality; row.godownName = godownMap.get(String(row.godownId)) || "Folding / Unassigned"; row.ownerName = row.ownershipType === "party" ? ownerPartyMap.get(String(row.ownerPartyId)) || "Party" : row.ownershipType === "own" ? "Own" : "Unknown"; });
  return { rows: result, totals: {
    than: round(result.reduce((sum, row) => sum + row.than, 0)), pieceCount: round(result.reduce((sum, row) => sum + row.pieceCount, 0)), meter: round(result.reduce((sum, row) => sum + row.meter, 0)),
    kg: round(result.reduce((sum, row) => sum + row.kg, 0)), lbs: round(result.reduce((sum, row) => sum + row.lbs, 0)),
    goodMeter: round(result.filter((row) => row.grade === "a").reduce((sum, row) => sum + row.meter, 0)), bGradeMeter: round(result.filter((row) => row.grade === "b").reduce((sum, row) => sum + row.meter, 0)),
    rejectedMeter: round(result.filter((row) => row.grade === "rejected").reduce((sum, row) => sum + row.meter, 0)),
  } };
};

module.exports = { create: costing.withCostingInvalidation(create, "folding"), gradeSplit, list, meta, nextThanNo, previewNextThanNo, resolveLoom, splitStockRows, stockSummary, update: costing.withCostingInvalidation(update, "folding"), voidEntry: costing.withCostingInvalidation(voidEntry, "folding"),
  _test: { buildPayload, FOLDING_THAN_COUNTER_KEY, assertQualitySelection, formatThanNo, gradeSplit, sequenceFromThanNo, splitStockRows },
};
