const Counter = require("../../models/Counter");
const Employee = require("../../models/Employee");
const WeavingBeam = require("../../models/WeavingBeam");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingParty = require("../../models/WeavingParty");
const costing = require("./weavingCostingService");
const { lbsFromKg } = require("./weavingOperationsUtils");

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

const resolveLoom = async (userId, loomId) => {
  const loom = await WeavingLoom.findOne({ _id: loomId, userId, isActive: true }).lean();
  if (!loom) throw fail("Active Loom not found", 404);
  const beam = await WeavingBeam.findOne({ userId, activeLoomId: loom._id, status: "loaded" }).populate("beamSetId").lean();
  const beamSet = beam?.beamSetId || null;
  if (!beamSet) return { loom, beam: null, beamSet: null, contract: null, quality: null };
  const [contract, quality] = await Promise.all([
    beamSet.contractId ? WeavingContract.findOne({ _id: beamSet.contractId, userId }).select("contractNo itemId contractType partyId").lean() : null,
    beamSet.fabricQualityId ? WeavingFabricQuality.findOne({ _id: beamSet.fabricQualityId, userId, isActive: true }).lean() : null,
  ]);
  return { loom, beam, beamSet, contract, quality };
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
  const [looms, employees, godowns, fabrics, nextPreview] = await Promise.all([
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
    Employee.find({ userId, moduleScope: "weaving", isDeleted: false, status: "active" }).select("name employeeNo").sort({ name: 1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code warpCount weftCount construction width brand cadReference").sort({ name: 1 }).lean(),
    previewNextThanNo(userId),
  ]);
  return { looms, employees, godowns, fabrics, nextThanNo: nextPreview };
};

const buildPayload = async (userId, body) => {
  const resolved = await resolveLoom(userId, body.loomId);
  const selectedQualityId = assertQualitySelection(resolved.quality?._id, body.fabricQualityId);
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
    ownershipType: contract?.contractType === "conversion" ? "party" : "own",
    ownerPartyId: contract?.contractType === "conversion" ? contract.partyId : null,
    checkedByEmployeeId: checker?._id || null,
    qualitySnapshot: { name: quality.name, code: quality.code, warpCount: quality.warpCount, weftCount: quality.weftCount, construction: quality.construction, width: quality.width, brand: quality.brand, cadReference: quality.cadReference },
    loomNumberSnapshot: loom.loomNumber, beamNoSnapshot: beam?.beamNo || "",
    setNoSnapshot: beamSet?.setNo || "", contractNoSnapshot: contract?.contractNo || "",
    meter, weightKg, weightLbs: lbsFromKg(weightKg), ...split,
    defectReason: clean(body.defectReason), notes: clean(body.notes),
  };
};

const create = async (userId, body) => {
  const payload = await buildPayload(userId, body);
  if (!payload.date) throw fail("Date is required");
  return WeavingFoldingEntry.create({ ...payload, userId, moduleScope: "weaving", thanNo: await nextThanNo(userId) });
};

const update = async (userId, entryId, body) => {
  const existing = await WeavingFoldingEntry.findOne({ _id: entryId, userId, status: "posted", activeKacchiId: null });
  if (!existing) throw fail("Folding Entry not found", 404);
  Object.assign(existing, await buildPayload(userId, body));
  return existing.save();
};

const voidEntry = async (userId, actorId, entryId, reason) => {
  const entry = await WeavingFoldingEntry.findOne({ _id: entryId, userId, status: "posted", activeKacchiId: null });
  if (!entry) throw fail("Folding Entry not found", 404);
  entry.status = "void"; entry.voidedAt = new Date(); entry.voidedBy = actorId; entry.voidReason = clean(reason);
  return entry.save();
};

const list = (userId, query = {}) => {
  const filter = { userId, status: { $ne: "void" } };
  if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  if (query.loomId) filter.loomId = query.loomId;
  return WeavingFoldingEntry.find(filter).populate("loomId", "name loomNumber").populate("fabricQualityId", "name code").populate("godownId", "name").populate("checkedByEmployeeId", "name employeeNo").sort({ date: -1, createdAt: -1 }).limit(250).lean();
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
    const key = [entry.fabricQualityId, entry.godownId || "unassigned", row.grade, entry.ownershipType || "own", entry.ownerPartyId || ""].map(String).join("|");
    const current = groups.get(key) || { fabricQualityId: entry.fabricQualityId, quality: entry.qualitySnapshot, godownId: entry.godownId, grade: row.grade, category: row.grade === "a" ? "normal" : row.grade, ownershipType: entry.ownershipType || "own", ownerPartyId: entry.ownerPartyId || null, than: 0, pieceCount: 0, meter: 0, kg: 0, lbs: 0 };
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
  result.forEach((row) => { row.quality = qualityMap.get(String(row.fabricQualityId)) || row.quality; row.godownName = godownMap.get(String(row.godownId)) || "Folding / Unassigned"; row.ownerName = row.ownershipType === "party" ? ownerPartyMap.get(String(row.ownerPartyId)) || "Party" : "Own"; });
  return { rows: result, totals: {
    than: round(result.reduce((sum, row) => sum + row.than, 0)), pieceCount: round(result.reduce((sum, row) => sum + row.pieceCount, 0)), meter: round(result.reduce((sum, row) => sum + row.meter, 0)),
    kg: round(result.reduce((sum, row) => sum + row.kg, 0)), lbs: round(result.reduce((sum, row) => sum + row.lbs, 0)),
    goodMeter: round(result.filter((row) => row.grade === "a").reduce((sum, row) => sum + row.meter, 0)), bGradeMeter: round(result.filter((row) => row.grade === "b").reduce((sum, row) => sum + row.meter, 0)),
    rejectedMeter: round(result.filter((row) => row.grade === "rejected").reduce((sum, row) => sum + row.meter, 0)),
  } };
};

module.exports = { create: costing.withCostingInvalidation(create, "folding"), gradeSplit, list, meta, nextThanNo, previewNextThanNo, resolveLoom, splitStockRows, stockSummary, update: costing.withCostingInvalidation(update, "folding"), voidEntry: costing.withCostingInvalidation(voidEntry, "folding"),
  _test: { FOLDING_THAN_COUNTER_KEY, assertQualitySelection, formatThanNo, gradeSplit, sequenceFromThanNo, splitStockRows },
};
