const mongoose = require("mongoose");

const Counter = require("../../models/Counter");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingParty = require("../../models/WeavingParty");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingStockAdjustment = require("../../models/WeavingStockAdjustment");
const WeavingStockLock = require("../../models/WeavingStockLock");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const fabricStock = require("./weavingFoldingService");
const yarnStock = require("./weavingYarnStockService");
const costing = require("./weavingCostingService");

const EPSILON = 0.000001;
const round = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const clean = (value = "") => String(value || "").trim();
const id = (value) => String(value?._id || value || "");
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sessionOptions = (session) => (session ? { session } : {});
const setSession = (query, session) => (session ? query.session(session) : query);

const runAtomic = async (work) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    const unsupported = /Transaction numbers are only allowed|replica set member|does not support transactions/i.test(error.message || "");
    if (!unsupported) throw error;
    return work(null);
  } finally {
    await session.endSession();
  }
};

const withStockLock = async (userId, key, work) => {
  await WeavingStockLock.deleteMany({ userId, key, expiresAt: { $lte: new Date() } });
  try {
    await WeavingStockLock.create({ userId, key, expiresAt: new Date(Date.now() + 60000) });
  } catch (error) {
    if (error?.code === 11000) throw fail("This stock is being updated. Please retry.", 409);
    throw error;
  }
  try { return await work(); } finally { await WeavingStockLock.deleteOne({ userId, key }); }
};

const createOne = async (Model, document, session) => {
  if (!session) return Model.create(document);
  const [created] = await Model.create([document], { session });
  return created;
};

const allocateNo = async (userId, type, prefix, session) => {
  const counter = await Counter.findOneAndUpdate(
    { userId, type },
    { $inc: { seq: 1 }, $setOnInsert: { userId, type } },
    { new: true, upsert: true, setDefaultsOnInsert: false, ...sessionOptions(session) },
  );
  return `${prefix}-${String(counter.seq).padStart(5, "0")}`;
};

const requireDate = (value) => {
  const date = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail("Valid date is required");
  return date;
};

const whole = (value, label) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) throw fail(`${label} must be a whole non-negative number`);
  return number;
};

const ownership = async (userId, payload, session) => {
  const ownershipType = payload.ownershipType === "party" ? "party" : "own";
  const ownerPartyId = ownershipType === "party" ? payload.ownerPartyId : null;
  if (ownershipType === "party") {
    const owner = await setSession(WeavingParty.findOne({ _id: ownerPartyId, userId, isActive: true, isHidden: false }), session);
    if (!owner) throw fail("Active Owner Party is required for Party-owned stock");
  }
  return { ownershipType, ownerPartyId: ownerPartyId || null };
};

const fabricGrade = (category) => category === "normal" ? "a" : category;
const fabricLockKey = (bucket) => ["fabric", bucket.fabricQualityId, bucket.godownId, bucket.category, bucket.ownershipType, bucket.ownerPartyId || "own"].map(id).join(":");
const yarnLockKey = (bucket) => ["yarn", bucket.yarnId, bucket.godownId, bucket.ownershipType, bucket.ownerPartyId || "own"].map(id).join(":");
const sameBucket = (left, right, itemField) => [itemField, "godownId", "category", "ownershipType", "ownerPartyId"].every((field) => id(left[field]) === id(right[field]));

const getFabricBucketBalance = async (userId, bucket) => {
  const summary = await fabricStock.stockSummary(userId, { fabricQualityId: bucket.fabricQualityId, godownId: bucket.godownId, grade: fabricGrade(bucket.category) });
  return summary.rows.find((row) => id(row.fabricQualityId) === id(bucket.fabricQualityId)
    && id(row.godownId) === id(bucket.godownId)
    && row.category === bucket.category
    && row.ownershipType === bucket.ownershipType
    && id(row.ownerPartyId) === id(bucket.ownerPartyId)) || { meter: 0, kg: 0, than: 0, pieceCount: 0 };
};

const assertAvailable = (available, requested, fields) => {
  for (const [requestedField, availableField, label] of fields) {
    if (requested[requestedField] > Number(available[availableField] || 0) + EPSILON) {
      throw fail(`Insufficient ${label}. Available ${round(available[availableField])}`, 409);
    }
  }
};

const existingByRequest = (userId, requestKey) => WeavingStockAdjustment.findOne({ userId, requestKey });

const createFabricTransfer = async (userId, payload, actorId) => {
  const requestKey = clean(payload.requestKey);
  if (!requestKey) throw fail("Request key is required");
  const existing = await existingByRequest(userId, requestKey);
  if (existing) return existing;
  const category = ["normal", "b", "rejected", "cut_piece", "waste", "other"].includes(payload.category) ? payload.category : "normal";
  const owner = await ownership(userId, payload);
  const source = { fabricQualityId: payload.sourceFabricQualityId, godownId: payload.sourceGodownId, category, ...owner };
  const destination = { fabricQualityId: payload.targetFabricQualityId, godownId: payload.targetGodownId || payload.sourceGodownId, category, ...owner };
  if (sameBucket(source, destination, "fabricQualityId")) throw fail("Source and destination Fabric buckets must be different");
  const values = { meter: round(payload.meter), weightKg: round(payload.weightKg), thanCount: whole(payload.thanCount, "Than Count"), pieceCount: whole(payload.pieceCount, "Piece Count") };
  if (values.meter <= 0 || values.weightKg < 0) throw fail("Transfer Meter must be greater than zero and KG cannot be negative");

  return withStockLock(userId, fabricLockKey(source), async () => {
    const retried = await existingByRequest(userId, requestKey); if (retried) return retried;
    try {
      return await runAtomic(async (session) => {
        const [sourceQuality, targetQuality, sourceGodown, targetGodown] = await Promise.all([
          setSession(WeavingFabricQuality.findOne({ _id: source.fabricQualityId, userId, isActive: true }), session),
          setSession(WeavingFabricQuality.findOne({ _id: destination.fabricQualityId, userId, isActive: true }), session),
          setSession(WeavingGodown.findOne({ _id: source.godownId, userId, isActive: true }), session),
          setSession(WeavingGodown.findOne({ _id: destination.godownId, userId, isActive: true }), session),
        ]);
        if (!sourceQuality || !targetQuality || !sourceGodown || !targetGodown) throw fail("Active source/target Quality and Godown are required");
        const available = await getFabricBucketBalance(userId, source);
        assertAvailable(available, values, [["meter", "meter", "Meter"], ["weightKg", "kg", "KG"], ["thanCount", "than", "Than Count"], ["pieceCount", "pieceCount", "Piece Count"]]);
        const adjustment = await createOne(WeavingStockAdjustment, { userId, kind: "fabric_transfer", adjustmentNo: await allocateNo(userId, "weaving_fabric_transfer", "FT", session), requestKey, date: requireDate(payload.date), source, destination, ...values, reason: clean(payload.reason), createdBy: actorId || userId }, session);
        const movements = await WeavingFabricMovement.insertMany([
          { userId, date: adjustment.date, movementType: "quality_transfer_out", category, direction: "out", fabricQualityId: source.fabricQualityId, godownId: source.godownId, ...owner, ...values, stockAdjustmentId: adjustment._id, stockAdjustmentNo: adjustment.adjustmentNo, notes: adjustment.reason },
          { userId, date: adjustment.date, movementType: "quality_transfer_in", category, direction: "in", fabricQualityId: destination.fabricQualityId, godownId: destination.godownId, ...owner, ...values, stockAdjustmentId: adjustment._id, stockAdjustmentNo: adjustment.adjustmentNo, notes: adjustment.reason },
        ], sessionOptions(session));
        adjustment.movementIds = movements.map((row) => row._id); await adjustment.save(sessionOptions(session));
        return adjustment;
      });
    } catch (error) {
      if (error?.code === 11000) { const duplicate = await existingByRequest(userId, requestKey); if (duplicate) return duplicate; }
      throw error;
    }
  });
};

const createYarnTransfer = async (userId, payload, actorId) => {
  const requestKey = clean(payload.requestKey); if (!requestKey) throw fail("Request key is required");
  const existing = await existingByRequest(userId, requestKey); if (existing) return existing;
  const owner = await ownership(userId, payload);
  const source = { yarnId: payload.sourceYarnId, godownId: payload.sourceGodownId, category: "", ...owner };
  const destination = { yarnId: payload.targetYarnId, godownId: payload.targetGodownId || payload.sourceGodownId, category: "", ...owner };
  if (sameBucket(source, destination, "yarnId")) throw fail("Source and destination Yarn buckets must be different");
  const values = { quantityKg: round(payload.quantityKg), packageQty: whole(payload.packageQty, "Packages"), smallCones: whole(payload.smallCones, "Small Cones"), largeCones: whole(payload.largeCones, "Large Cones") };
  if (values.quantityKg <= 0) throw fail("Transfer KG must be greater than zero");

  return withStockLock(userId, yarnLockKey(source), async () => {
    const retried = await existingByRequest(userId, requestKey); if (retried) return retried;
    try {
      return await runAtomic(async (session) => {
        const [sourceYarn, targetYarn, sourceGodown, targetGodown] = await Promise.all([
          setSession(WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }), session),
          setSession(WeavingYarn.findOne({ _id: destination.yarnId, userId, isActive: true }), session),
          setSession(WeavingGodown.findOne({ _id: source.godownId, userId, isActive: true }), session),
          setSession(WeavingGodown.findOne({ _id: destination.godownId, userId, isActive: true }), session),
        ]);
        if (!sourceYarn || !targetYarn || !sourceGodown || !targetGodown) throw fail("Active source/target Yarn and Godown are required");
        const available = await yarnStock.getGodownBalance({ userId, yarnId: source.yarnId, godownId: source.godownId, ...owner });
        assertAvailable(available, values, [["quantityKg", "kg", "KG"], ["packageQty", "packages", "Packages"], ["smallCones", "smallCones", "Small Cones"], ["largeCones", "largeCones", "Large Cones"]]);
        const adjustment = await createOne(WeavingStockAdjustment, { userId, kind: "yarn_transfer", adjustmentNo: await allocateNo(userId, "weaving_yarn_transfer", "YT", session), requestKey, date: requireDate(payload.date), source, destination, ...values, reason: clean(payload.reason), createdBy: actorId || userId }, session);
        const common = { userId, date: adjustment.date, ownershipType: owner.ownershipType, ownerPartyId: owner.ownerPartyId, quantityKg: values.quantityKg, packageQty: values.packageQty, smallCones: values.smallCones, largeCones: values.largeCones, totalCones: values.smallCones + values.largeCones, stockAdjustmentId: adjustment._id, stockAdjustmentNo: adjustment.adjustmentNo, lotReference: adjustment.adjustmentNo, notes: adjustment.reason };
        const movements = await WeavingYarnMovement.insertMany([
          { ...common, yarnId: source.yarnId, movementType: "transfer_out", sourceGodownId: source.godownId, destinationType: "godown" },
          { ...common, yarnId: destination.yarnId, movementType: "transfer_in", godownId: destination.godownId, destinationType: "godown" },
        ], sessionOptions(session));
        adjustment.movementIds = movements.map((row) => row._id); await adjustment.save(sessionOptions(session));
        return adjustment;
      });
    } catch (error) {
      if (error?.code === 11000) { const duplicate = await existingByRequest(userId, requestKey); if (duplicate) return duplicate; }
      throw error;
    }
  });
};

const sizingReturnExists = async (userId, yarnId, reference) => {
  const sourceReference = clean(reference);
  if (!sourceReference) return false;
  const choices = [{ returnNo: sourceReference }, { lotReference: sourceReference }];
  if (mongoose.isValidObjectId(sourceReference)) choices.push({ _id: sourceReference }, { sizingIssueId: sourceReference }, { sizingReceiptId: sourceReference });
  return Boolean(await WeavingYarnMovement.exists({ userId, yarnId, movementType: "sizing_return", isVoided: { $ne: true }, $or: choices }));
};

const resolveSizingLeftover = async ({ userId, yarnId, reference, owner, quantityKg }) => {
  const sourceReference = clean(reference);
  const match = mongoose.isValidObjectId(sourceReference)
    ? { userId, $or: [{ _id: sourceReference }, { issueNo: sourceReference }] }
    : { userId, issueNo: sourceReference };
  const issue = await WeavingSizingIssue.findOne(match).lean();
  if (!issue) return null;
  const issuedKg = round((issue.lines || []).filter((line) => id(line.yarnId) === id(yarnId)
    && line.ownershipType === owner.ownershipType
    && id(line.ownerPartyId) === id(owner.ownerPartyId)).reduce((sum, line) => sum + Number(line.quantityKg || 0), 0));
  const consumed = await WeavingYarnMovement.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), sizingIssueId: issue._id, yarnId: new mongoose.Types.ObjectId(yarnId), ownershipType: owner.ownershipType, ownerPartyId: owner.ownerPartyId ? new mongoose.Types.ObjectId(owner.ownerPartyId) : null, movementType: { $in: ["sizing_receipt", "sizing_return"] }, isVoided: { $ne: true } } },
    { $group: { _id: null, quantityKg: { $sum: "$quantityKg" } } },
  ]);
  const availableKg = round(issuedKg - Number(consumed[0]?.quantityKg || 0));
  if (issuedKg <= 0 || quantityKg > availableKg + EPSILON) throw fail(`Only ${Math.max(0, availableKg)} KG matching Sizing leftover is available`, 409);
  return issue;
};

const createRewinderRecovery = async (userId, payload, actorId) => {
  const requestKey = clean(payload.requestKey); if (!requestKey) throw fail("Request key is required");
  const existing = await existingByRequest(userId, requestKey); if (existing) return existing;
  const recoverySource = ["sizing_leftover", "partial_loose", "other"].includes(payload.recoverySource) ? payload.recoverySource : "other";
  const sourceReference = clean(payload.sourceReference);
  if (recoverySource === "sizing_leftover" && !sourceReference) throw fail("Sizing source reference is required");
  const owner = await ownership(userId, payload);
  const destination = { yarnId: payload.yarnId, godownId: payload.godownId, category: "", ...owner };
  const quantityKg = round(payload.quantityKg); if (quantityKg <= 0) throw fail("Recovered KG must be greater than zero");
  const packageQty = whole(payload.packageQty, "Packages");
  const recoveredCones = whole(payload.recoveredCones, "Recovered Cones");
  const coneType = ["small", "large", "mixed"].includes(payload.coneType) ? payload.coneType : "";
  const smallCones = coneType === "small" ? recoveredCones : 0;
  const largeCones = coneType === "large" ? recoveredCones : 0;
  const referenceRate = round(payload.referenceRate); if (referenceRate < 0) throw fail("Reference Rate cannot be negative");
  const recoverySourceKey = sourceReference ? [id(payload.yarnId), recoverySource, sourceReference.toLowerCase()].join("|") : null;
  const sizingIssue = recoverySource === "sizing_leftover" ? await resolveSizingLeftover({ userId, yarnId: payload.yarnId, reference: sourceReference, owner, quantityKg }) : null;
  if (recoverySource === "sizing_leftover" && !sizingIssue && await sizingReturnExists(userId, payload.yarnId, sourceReference)) throw fail("This Sizing Yarn has already been returned to stock", 409);

  return withStockLock(userId, yarnLockKey(destination), async () => {
    const retried = await existingByRequest(userId, requestKey); if (retried) return retried;
    try {
      return await runAtomic(async (session) => {
        const [yarn, godown, vendor] = await Promise.all([
          setSession(WeavingYarn.findOne({ _id: destination.yarnId, userId, isActive: true }), session),
          setSession(WeavingGodown.findOne({ _id: destination.godownId, userId, isActive: true }), session),
          payload.vendorPartyId ? setSession(WeavingParty.findOne({ _id: payload.vendorPartyId, userId, isActive: true, isHidden: false, role: { $in: ["supplier", "both"] } }), session) : null,
        ]);
        if (!yarn || !godown) throw fail("Active Recovered Yarn and Godown are required");
        if (payload.vendorPartyId && !vendor) throw fail("Active Rewinder/Supplier is required");
        const confirmedSizingIssue = recoverySource === "sizing_leftover" ? await resolveSizingLeftover({ userId, yarnId: yarn._id, reference: sourceReference, owner, quantityKg }) : null;
        if (recoverySource === "sizing_leftover" && !confirmedSizingIssue && await sizingReturnExists(userId, yarn._id, sourceReference)) throw fail("This Sizing Yarn has already been returned to stock", 409);
        const adjustment = await createOne(WeavingStockAdjustment, { userId, kind: "rewinder_recovery", adjustmentNo: await allocateNo(userId, "weaving_rewinder_recovery", "RRW", session), requestKey, date: requireDate(payload.date), destination, quantityKg, packageQty, smallCones, largeCones, recoveredCones, coneType, recoverySource, sourceReference, recoverySourceKey, vendorPartyId: vendor?._id || null, referenceRate, referenceValue: round(quantityKg * referenceRate), reason: clean(payload.reason || payload.notes), createdBy: actorId || userId }, session);
        const movement = await createOne(WeavingYarnMovement, { userId, yarnId: yarn._id, date: adjustment.date, movementType: "rewinder_recovery", ownershipType: owner.ownershipType, ownerPartyId: owner.ownerPartyId, quantityKg, packageQty, smallCones, largeCones, totalCones: recoveredCones, coneSize: coneType === "small" || coneType === "large" ? coneType : "", destinationType: "godown", godownId: godown._id, sizingIssueId: confirmedSizingIssue?._id || sizingIssue?._id || null, stockAdjustmentId: adjustment._id, stockAdjustmentNo: adjustment.adjustmentNo, lotReference: sourceReference || adjustment.adjustmentNo, notes: adjustment.reason }, session);
        adjustment.movementIds = [movement._id]; await adjustment.save(sessionOptions(session));
        return adjustment;
      });
    } catch (error) {
      if (error?.code === 11000) {
        const duplicate = await existingByRequest(userId, requestKey); if (duplicate) return duplicate;
        if (recoverySourceKey && await WeavingStockAdjustment.exists({ userId, recoverySourceKey })) throw fail("This Recovery source has already been posted", 409);
      }
      throw error;
    }
  });
};

const hasFabricDownstream = (adjustment) => WeavingFabricMovement.exists({
  userId: adjustment.userId, createdAt: { $gt: adjustment.createdAt }, isVoided: { $ne: true }, direction: "out",
  fabricQualityId: adjustment.destination.fabricQualityId, godownId: adjustment.destination.godownId,
  category: adjustment.destination.category, ownershipType: adjustment.destination.ownershipType,
  ownerPartyId: adjustment.destination.ownerPartyId || null,
});

const hasYarnDownstream = (adjustment) => WeavingYarnMovement.exists({
  userId: adjustment.userId, createdAt: { $gt: adjustment.createdAt }, isVoided: { $ne: true },
  movementType: { $in: ["sizing_issue", "sale_out", "transfer_out", "weft_consumption"] }, yarnId: adjustment.destination.yarnId,
  sourceGodownId: adjustment.destination.godownId, ownershipType: adjustment.destination.ownershipType,
  ownerPartyId: adjustment.destination.ownerPartyId || null,
});

const reverseAdjustment = async (userId, adjustmentId, actorId, reason) => {
  const reversalReason = clean(reason); if (!reversalReason) throw fail("Reversal reason is required");
  const adjustment = await WeavingStockAdjustment.findOne({ _id: adjustmentId, userId, status: "posted" });
  if (!adjustment) throw fail("Posted stock adjustment not found", 404);
  const lockKey = adjustment.kind === "fabric_transfer" ? fabricLockKey(adjustment.destination) : yarnLockKey(adjustment.destination);
  return withStockLock(userId, lockKey, async () => {
    const current = await WeavingStockAdjustment.findOne({ _id: adjustmentId, userId, status: "posted" });
    if (!current) { const reversed = await WeavingStockAdjustment.findOne({ _id: adjustmentId, userId, status: "reversed" }); if (reversed) return reversed; throw fail("Posted stock adjustment not found", 404); }
    if (current.kind === "fabric_transfer") {
      if (await hasFabricDownstream(current)) throw fail("Destination Fabric stock has downstream use and cannot be reversed", 409);
      const available = await getFabricBucketBalance(userId, current.destination);
      assertAvailable(available, current, [["meter", "meter", "Meter"], ["weightKg", "kg", "KG"], ["thanCount", "than", "Than Count"], ["pieceCount", "pieceCount", "Piece Count"]]);
    } else {
      if (await hasYarnDownstream(current)) throw fail("Destination Yarn stock has downstream use and cannot be reversed", 409);
      const available = await yarnStock.getGodownBalance({ userId, yarnId: current.destination.yarnId, godownId: current.destination.godownId, ownershipType: current.destination.ownershipType, ownerPartyId: current.destination.ownerPartyId });
      assertAvailable(available, current, [["quantityKg", "kg", "KG"], ["packageQty", "packages", "Packages"], ["smallCones", "smallCones", "Small Cones"], ["largeCones", "largeCones", "Large Cones"]]);
    }
    return runAtomic(async (session) => {
      const locked = await setSession(WeavingStockAdjustment.findOne({ _id: current._id, userId, status: "posted" }), session);
      if (!locked) throw fail("Stock adjustment was already reversed", 409);
      const Movement = locked.kind === "fabric_transfer" ? WeavingFabricMovement : WeavingYarnMovement;
      await Movement.updateMany({ userId, stockAdjustmentId: locked._id, isVoided: { $ne: true } }, { $set: { isVoided: true } }, sessionOptions(session));
      locked.status = "reversed"; locked.reversedAt = new Date(); locked.reversedBy = actorId || userId; locked.reversalReason = reversalReason;
      return locked.save(sessionOptions(session));
    });
  });
};

const getMeta = async (userId) => {
  const [qualities, yarns, godowns, parties] = await Promise.all([
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code warpCount weftCount width").sort({ name: 1 }).lean(),
    WeavingYarn.find({ userId, isActive: true }).select("name count quality millBrand").sort({ name: 1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    WeavingParty.find({ userId, isActive: true, isHidden: false }).select("name role").sort({ name: 1 }).lean(),
  ]);
  return { qualities, yarns, godowns, parties, suppliers: parties.filter((party) => ["supplier", "both"].includes(party.role)) };
};

const getHistory = (userId, query = {}) => {
  const filter = { userId };
  if (query.kind === "fabric") filter.kind = "fabric_transfer";
  if (query.kind === "yarn") filter.kind = { $in: ["yarn_transfer", "rewinder_recovery"] };
  return WeavingStockAdjustment.find(filter)
    .populate("source.fabricQualityId destination.fabricQualityId", "name code")
    .populate("source.yarnId destination.yarnId", "name count quality")
    .populate("source.godownId destination.godownId", "name")
    .populate("source.ownerPartyId destination.ownerPartyId vendorPartyId", "name")
    .populate("createdBy reversedBy", "name email")
    .sort({ date: -1, createdAt: -1 }).limit(250).lean();
};

module.exports = {
  createFabricTransfer: costing.withCostingInvalidation(createFabricTransfer, "stock_adjustment"),
  createRewinderRecovery: costing.withCostingInvalidation(createRewinderRecovery, "stock_adjustment"),
  createYarnTransfer: costing.withCostingInvalidation(createYarnTransfer, "stock_adjustment"),
  getHistory,
  getMeta,
  reverseAdjustment: costing.withCostingInvalidation(reverseAdjustment, "stock_adjustment"),
  _test: { assertAvailable, fabricGrade, sameBucket, sizingReturnExists },
};
