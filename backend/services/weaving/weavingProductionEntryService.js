const mongoose = require("mongoose");
const WeavingProductionEntry = require("../../models/WeavingProductionEntry");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingLoom = require("../../models/WeavingLoom");
const settingsService = require("./weavingSettingsService");
const { getManualStock, key: stockKey } = require("./weavingManualStockService");
const { lbsFromKg } = require("./weavingOperationsUtils");
const costing = require("./weavingCostingService");

const EPSILON = 0.000001;
const clean = (value = "") => String(value || "").trim();
const round = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sessionOptions = (session) => session ? { session } : undefined;

const withTransaction = async (work) => {
  const session = await mongoose.startSession(); let result;
  try { await session.withTransaction(async () => { result = await work(session); }); return result; }
  catch (error) {
    if (error.code === 11000) throw fail("A daily total already exists for this Date, Quality, ownership and Loom (when applicable). Edit the existing entry instead.", 409);
    if (/Transaction numbers are only allowed|replica set member|does not support transactions/i.test(error.message || "")) throw fail("Safe production posting requires database transaction support. Nothing was saved.", 503);
    throw error;
  } finally { await session.endSession(); }
};

const meta = async (userId) => {
  const [settings, looms, qualities] = await Promise.all([
    settingsService.getSettings(userId),
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code warpCount weftCount width").sort({ name: 1 }).lean(),
  ]);
  return { settings, looms, qualities };
};

const validateCreate = async (userId, body, session) => {
  const mode = await settingsService.requireMode(userId, ["loom_wise", "quality_total"], "Aggregate production is only available in Loom-wise or Total Production mode.");
  if (body.productionMode && body.productionMode !== mode) throw fail(`Use the ${mode === "loom_wise" ? "Loom-wise" : "Total Production"} workflow selected in Weaving Settings.`, 409);
  const settings = await settingsService.getSettings(userId);
  if (settings.simpleProductionOwnershipType === "party" && !settings.simpleProductionOwnerPartyId) throw fail("Configure the production Party in Weaving Settings before posting production.", 409);
  const quality = await WeavingFabricQuality.findOne({ _id: body.fabricQualityId, userId, isActive: true }).session(session);
  if (!quality) throw fail("Select an active Fabric Quality.");
  let loom = null;
  if (mode === "loom_wise") {
    loom = await WeavingLoom.findOne({ _id: body.loomId, userId, isActive: true }).session(session);
    if (!loom) throw fail("Select an active Loom.");
  }
  const meter = round(body.meter); const weightKg = round(body.weightKg);
  if (meter <= 0) throw fail("Meter must be greater than zero.");
  if (weightKg <= 0) throw fail("Weight KG must be greater than zero.");
  const date = clean(body.date); if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail("Date is required.");
  return { productionMode: mode, date, loomId: loom?._id || null, fabricQualityId: quality._id, ownershipType: settings.simpleProductionOwnershipType, ownerPartyId: settings.simpleProductionOwnershipType === "party" ? settings.simpleProductionOwnerPartyId : null, godownId: settings.simpleProductionGodownId || null, meter, weightKg, weightLbs: lbsFromKg(weightKg), category: "normal" };
};

const create = (userId, actorId, body) => withTransaction(async (session) => {
  const payload = await validateCreate(userId, body, session);
  const [entry] = await WeavingProductionEntry.create([{ ...payload, userId, moduleScope: "weaving", createdBy: actorId || userId }], { session });
  const [movement] = await WeavingFabricMovement.create([{ userId, moduleScope: "weaving", date: payload.date, movementType: "production_in", direction: "in", stockIdentity: "untracked", category: "normal", fabricQualityId: payload.fabricQualityId, godownId: payload.godownId, ownershipType: payload.ownershipType, ownerPartyId: payload.ownerPartyId, meter: payload.meter, weightKg: payload.weightKg, thanCount: 0, pieceCount: 0, productionEntryId: entry._id, notes: `${payload.productionMode === "loom_wise" ? "Loom-wise" : "Quality total"} production` }], { session });
  entry.stockMovementId = movement._id; await entry.save({ session });
  return entry;
});

const availableFor = async (userId, entry, session) => {
  const rows = await getManualStock(userId, session);
  return rows.find((row) => stockKey(row) === stockKey({ fabricQualityId: entry.fabricQualityId, godownId: entry.godownId, category: "normal", ownershipType: entry.ownershipType, ownerPartyId: entry.ownerPartyId })) || { meter: 0, weightKg: 0 };
};

const update = (userId, actorId, entryId, body) => withTransaction(async (session) => {
  const entry = await WeavingProductionEntry.findOne({ _id: entryId, userId, status: "posted" }).session(session);
  if (!entry) throw fail("Production entry not found.", 404);
  const meter = round(body.meter); const weightKg = round(body.weightKg);
  if (meter <= 0 || weightKg <= 0) throw fail("Meter and Weight KG must be greater than zero.");
  const reductionMeter = Math.max(0, entry.meter - meter); const reductionKg = Math.max(0, entry.weightKg - weightKg);
  if (reductionMeter > EPSILON || reductionKg > EPSILON) {
    const available = await availableFor(userId, entry, session);
    if (reductionMeter > Number(available.meter || 0) + EPSILON || reductionKg > Number(available.weightKg || 0) + EPSILON) throw fail("This production cannot be reduced because some of its aggregate stock has already been consumed, transferred or sold.", 409);
  }
  const movement = await WeavingFabricMovement.findOne({ _id: entry.stockMovementId, userId, movementType: "production_in", isVoided: { $ne: true } }).session(session);
  if (!movement) throw fail("Linked production stock movement is missing. No changes were saved.", 409);
  entry.meter = meter; entry.weightKg = weightKg; entry.weightLbs = lbsFromKg(weightKg); entry.updatedBy = actorId || userId;
  movement.meter = meter; movement.weightKg = weightKg;
  await movement.save({ session }); await entry.save({ session }); return entry;
});

const voidEntry = (userId, actorId, entryId, reason) => withTransaction(async (session) => {
  const entry = await WeavingProductionEntry.findOne({ _id: entryId, userId, status: "posted" }).session(session);
  if (!entry) throw fail("Production entry not found.", 404);
  const available = await availableFor(userId, entry, session);
  if (entry.meter > Number(available.meter || 0) + EPSILON || entry.weightKg > Number(available.weightKg || 0) + EPSILON) throw fail("This production cannot be voided because some of its aggregate stock has already been consumed, transferred or sold.", 409);
  const movement = await WeavingFabricMovement.findOne({ _id: entry.stockMovementId, userId, movementType: "production_in", isVoided: { $ne: true } }).session(session);
  if (!movement) throw fail("Linked production stock movement is missing. No changes were saved.", 409);
  movement.isVoided = true; await movement.save({ session });
  entry.status = "void"; entry.voidedAt = new Date(); entry.voidedBy = actorId || userId; entry.voidReason = clean(reason); await entry.save({ session }); return entry;
});

const list = (userId, query = {}) => {
  const filter = { userId, status: query.includeVoid === "true" ? { $in: ["posted", "void"] } : "posted" };
  if (query.productionMode) filter.productionMode = query.productionMode;
  if (query.date) filter.date = query.date;
  if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  return WeavingProductionEntry.find(filter).populate("loomId", "name loomNumber").populate("fabricQualityId", "name code warpCount weftCount width").populate("godownId", "name").populate("ownerPartyId", "name").sort({ date: -1, createdAt: -1 }).limit(500).lean();
};

module.exports = { create: costing.withCostingInvalidation(create, "aggregate_production"), list, meta, update: costing.withCostingInvalidation(update, "aggregate_production"), voidEntry: costing.withCostingInvalidation(voidEntry, "aggregate_production") };
