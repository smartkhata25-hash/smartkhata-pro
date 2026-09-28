const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingStockAdjustment = require("../../models/WeavingStockAdjustment");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingGodown = require("../../models/WeavingGodown");

const id = (value) => String(value?._id || value || "");
const fail = (message) => Object.assign(new Error(message), { statusCode: 409 });
const query = (value, session) => session ? value.session(session) : value;
const equal = (left, right) => Math.abs(Number(left || 0) - Number(right || 0)) <= 0.000001;
const bucketKey = (row) => [row.fabricQualityId, row.godownId, row.category, row.ownershipType, row.ownerPartyId].map(id).join(":");
const matchesBucket = (row, bucket) => bucketKey(row) === bucketKey(bucket);
const revisionFilter = (row) => row.stockRevision ? { stockRevision: row.stockRevision } : { $or: [{ stockRevision: 0 }, { stockRevision: { $exists: false } }] };
const timestamp = (row) => row.createdAt ? new Date(row.createdAt).getTime() : row._id?.getTimestamp?.().getTime() || 0;

// Replay the existing movement ledger, never changing the original Folding location
// or production classification. Exact references are authoritative. Old aggregate
// transfers can identify Thans only when they exhaust one wholly identified bucket.
const resolveCurrentThans = async (userId, { session = null, includeDispatched = false } = {}) => {
  const entries = await query(WeavingFoldingEntry.find({ userId, status: "posted" }).lean(), session);
  const movements = await query(WeavingFabricMovement.find({ userId, isVoided: { $ne: true } }).lean(), session);
  const adjustments = await query(WeavingStockAdjustment.find({ userId, kind: "fabric_transfer", status: "posted" }).lean(), session);
  const adjustmentsById = new Map(adjustments.map((row) => [id(row), row]));
  const inwardByAdjustment = new Map(movements.filter((row) => row.movementType === "quality_transfer_in").map((row) => [id(row.stockAdjustmentId), row]));
  const states = new Map(); const balances = new Map();
  const balance = (bucket) => {
    const key = bucketKey(bucket);
    if (!balances.has(key)) balances.set(key, { meter: 0, weightKg: 0, thanCount: 0, pieceCount: 0 });
    return balances.get(key);
  };
  const moveBalance = (bucket, values, sign) => {
    const total = balance(bucket);
    for (const field of ["meter", "weightKg", "thanCount", "pieceCount"]) total[field] += sign * Number(values[field] || 0);
  };
  const unknown = (rows, reference) => rows.forEach((row) => {
    row.locationState = "unknown";
    row.locationReason = `Exact whole-Than location requires reconciliation after ${reference || "an aggregate stock movement"}.`;
  });
  const events = [...entries.map((row) => ({ row, folding: true })), ...movements.map((row) => ({ row, folding: false }))]
    .sort((a, b) => timestamp(a.row) - timestamp(b.row) || Number(b.folding) - Number(a.folding) || id(a.row).localeCompare(id(b.row)));
  for (const event of events) {
    const row = event.row;
    if (event.folding) {
      const category = row.grade === "a" ? "normal" : row.grade;
      states.set(id(row), { ...row, category, locationState: row.grade === "partial" ? "unknown" : "known", locationReason: row.grade === "partial" ? "This Than has split grades and cannot move as a whole Than." : "", lastAdjustmentId: null, dispatched: false });
      for (const [field, stockCategory] of [["goodMeter", "normal"], ["bGradeMeter", "b"], ["rejectedMeter", "rejected"]]) {
        const meter = Number(row[field] || 0);
        if (meter > 0) moveBalance({ ...row, category: stockCategory }, { meter, weightKg: Number(row.weightKg) * meter / Number(row.meter), thanCount: meter / Number(row.meter) }, 1);
      }
      continue;
    }
    if (row.direction === "out") {
      const candidates = [...states.values()].filter((than) => !than.dispatched && matchesBucket(than, row));
      if (row.movementType === "quality_transfer_out") {
        const adjustment = adjustmentsById.get(id(row.stockAdjustmentId));
        const incoming = inwardByAdjustment.get(id(row.stockAdjustmentId));
        const refs = adjustment?.thanDetails?.map((line) => id(line.foldingEntryId)) || [];
        const namedRefs = refs.length ? refs : (row.foldingEntryIds || []).map(id);
        const chosen = namedRefs.length ? namedRefs.map((key) => states.get(key)).filter(Boolean) : candidates;
        const requested = adjustment || row;
        const sums = chosen.reduce((total, than) => ({ meter: total.meter + Number(than.meter), weightKg: total.weightKg + Number(than.weightKg) }), { meter: 0, weightKg: 0 });
        const exactPair = incoming && ["meter", "weightKg", "thanCount", "pieceCount"].every((field) => equal(row[field], incoming[field])) && incoming.ownershipType === row.ownershipType && id(incoming.ownerPartyId) === id(row.ownerPartyId);
        const exactThans = chosen.length > 0 && chosen.every((than) => than.locationState === "known" && !than.dispatched && matchesBucket(than, row)) && equal(chosen.length, requested.thanCount) && equal(sums.meter, requested.meter) && equal(sums.weightKg, requested.weightKg) && !Number(requested.pieceCount);
        const sourceBalance = balance(row);
        const wholeLegacyBucket = !namedRefs.length && ["meter", "weightKg", "thanCount", "pieceCount"].every((field) => equal(sourceBalance[field], requested[field]));
        if (exactPair && exactThans && (namedRefs.length ? chosen.length === new Set(namedRefs).size && namedRefs.length === chosen.length : wholeLegacyBucket)) {
          for (const than of chosen) {
            than.godownId = incoming.godownId || null;
            than.fabricQualityId = incoming.fabricQualityId;
            than.category = incoming.category;
            than.grade = incoming.category === "normal" ? "a" : incoming.category;
            than.lastAdjustmentId = row.stockAdjustmentId;
          }
        } else {
          unknown([...new Set([...candidates, ...chosen])], row.stockAdjustmentNo);
        }
      } else if (row.sourceFoldingEntryId && ["kacchi_out", "sale_out"].includes(row.movementType)) {
        const than = states.get(id(row.sourceFoldingEntryId));
        if (than) than.dispatched = true;
      } else if (row.stockIdentity !== "untracked") {
        // An unreferenced partial sale/transfer cannot identify a complete Than.
        unknown(candidates, row.stockAdjustmentNo || row.movementType);
      }
    } else if (["kacchi_return", "sale_return"].includes(row.movementType) && row.sourceFoldingEntryId) {
      const than = states.get(id(row.sourceFoldingEntryId));
      if (than) than.dispatched = false;
    }
    moveBalance(row, row, row.direction === "in" ? 1 : -1);
  }
  const [qualities, godowns] = await Promise.all([
    query(WeavingFabricQuality.find({ userId, _id: { $in: [...new Set([...states.values()].map((row) => id(row.fabricQualityId)))] } }).lean(), session),
    query(WeavingGodown.find({ userId }).select("name").lean(), session),
  ]);
  const qualityMap = new Map(qualities.map((row) => [id(row), row]));
  const godownMap = new Map(godowns.map((row) => [id(row), row.name]));
  return [...states.values()].filter((row) => includeDispatched || (!row.activeKacchiId && !row.activeSalesInvoiceId && !row.dispatched)).map((row) => ({
    ...row,
    godownName: row.godownId ? godownMap.get(id(row.godownId)) || "Unknown location" : "Folding / Unassigned",
    qualitySnapshot: qualityMap.get(id(row.fabricQualityId)) || row.qualitySnapshot,
  }));
};

const writeCurrentState = async (userId, row, state, session) => {
  const result = await WeavingFoldingEntry.updateOne({ _id: row._id, userId, status: "posted", activeKacchiId: null, activeSalesInvoiceId: null, ...revisionFilter(row) }, {
    $set: { currentStock: state }, $inc: { stockRevision: 1 },
  }, { session });
  if (result.modifiedCount !== 1) throw fail(`Than ${row.thanNo} changed or was dispatched. Refresh the available Thans.`);
};

const stateFor = (row) => ({ state: row.locationState, fabricQualityId: row.fabricQualityId, godownId: row.godownId || null, category: row.category, lastAdjustmentId: row.lastAdjustmentId || null, reason: row.locationReason || "" });
module.exports = { resolveCurrentThans, matchesBucket, writeCurrentState, stateFor, revisionFilter };
