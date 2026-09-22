const KG_TO_LBS = 2.2046226218;
const LBS_TO_KG = 0.45359237;
const roundQuantity = (value) => Math.round(Number(value) * 1000000) / 1000000;

const kgFromInput = ({ kg, lbs, sourceEntryUnit } = {}) => {
  const value = sourceEntryUnit === "LBS" ? Number(lbs) * LBS_TO_KG : Number(kg);
  return Number.isFinite(value) ? roundQuantity(value) : 0;
};

const lbsFromKg = (kg) => roundQuantity(Number(kg) * KG_TO_LBS);

const assertUniqueGodowns = (rows = []) => {
  const ids = rows.filter((row) => Number(row.quantity || 0) > 0).map((row) => String(row.godownId || ""));
  return ids.length === new Set(ids).size;
};

module.exports = { KG_TO_LBS, LBS_TO_KG, roundQuantity, kgFromInput, lbsFromKg, assertUniqueGodowns };
