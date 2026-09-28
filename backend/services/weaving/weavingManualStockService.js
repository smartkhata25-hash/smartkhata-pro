const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const id = (value) => String(value?._id || value || "");
const key = (row) => [row.fabricQualityId, row.godownId, row.category, row.ownershipType, row.ownerPartyId].map(id).join(":");
const fields = ["meter", "weightKg", "thanCount", "pieceCount"];
const qty = (n) => Math.round(n * 1000000) / 1000000;

// Only ledger-backed aggregate origins enter this pool. Ambiguous legacy
// transfers never manufacture untracked stock at their destination.
const calculateManualStock = (movements) => {
  const buckets = new Map();
  const balance = (row) => {
    if (!buckets.has(key(row))) buckets.set(key(row), { fabricQualityId: row.fabricQualityId, godownId: row.godownId || null, category: row.category, ownershipType: row.ownershipType, ownerPartyId: row.ownerPartyId || null, meter: 0, weightKg: 0, thanCount: 0, pieceCount: 0 });
    return buckets.get(key(row));
  };
  const active = movements.filter((row) => !row.isVoided);
  const incoming = new Map(active.filter((r) => r.movementType === "quality_transfer_in").map((r) => [id(r.stockAdjustmentId), r]));
  const provenTransfers = new Set();
  const events = [...active].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0) || (a.movementType === "quality_transfer_out" ? -1 : b.movementType === "quality_transfer_out" ? 1 : id(a).localeCompare(id(b))));
  for (const row of events) {
    const pool = balance(row);
    const exact = row.sourceFoldingEntryId || row.foldingEntryIds?.length;
    if (row.direction === "out" && !exact) {
      if (row.movementType === "quality_transfer_out") {
        const target = incoming.get(id(row.stockAdjustmentId));
        if (target && fields.every((field) => Number(row[field] || 0) <= pool[field] + 0.000001 && Math.abs(Number(row[field] || 0) - Number(target[field] || 0)) < 0.000001) && row.ownershipType === target.ownershipType && id(row.ownerPartyId) === id(target.ownerPartyId)) provenTransfers.add(id(row.stockAdjustmentId));
      }
      for (const field of fields) pool[field] = qty(Math.max(0, pool[field] - Number(row[field] || 0)));
    } else if (row.direction === "in" && !exact) {
      const proven = ["purchase_in", "rejection_recovery"].includes(row.movementType) || (row.movementType === "quality_transfer_in" && provenTransfers.has(id(row.stockAdjustmentId))) || (["sale_return", "kacchi_return"].includes(row.movementType) && row.stockIdentity === "untracked");
      if (proven) for (const field of fields) pool[field] = qty(pool[field] + Number(row[field] || 0));
    }
  }
  return [...buckets.values()];
};
const getManualStock = async (userId, session = null) => {
  const query = WeavingFabricMovement.find({ userId, isVoided: { $ne: true } }).lean();
  return calculateManualStock(await (session ? query.session(session) : query));
};
module.exports = { calculateManualStock, getManualStock, key };
