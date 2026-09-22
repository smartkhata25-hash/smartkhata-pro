const mongoose = require("mongoose");
const Employee = require("../../models/Employee");
const WeavingBeam = require("../../models/WeavingBeam");
const WeavingBeamSet = require("../../models/WeavingBeamSet");
const WeavingKnottingJob = require("../../models/WeavingKnottingJob");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const costing = require("./weavingCostingService");
const {
  collectAccountIdsFromJournal,
  createEmployeeJournal,
  createHttpError,
  ensureEmployeeAccount,
  ensureSalaryExpenseAccount,
  getSessionQuery,
  recalculateTouchedAccounts,
  reverseJournals,
  roundMoney,
} = require("../employee/employeeAccountingService");

const WEAVING_SCOPE = "weaving";
const clean = (value = "") => String(value || "").trim();
const sessionOptions = (session) => (session ? { session } : undefined);

const calculateKnottingEarning = ({ paymentMethod, completedBeams, rate }) => {
  const quantity = Math.max(0, Number(completedBeams) || 0);
  const normalizedRate = Math.max(0, roundMoney(rate));
  const perBeam = ["per_beam", "monthly_per_beam"].includes(paymentMethod);
  const perSet = ["per_set", "monthly_per_set"].includes(paymentMethod);
  return {
    amount: perBeam ? roundMoney(quantity * normalizedRate) : perSet ? normalizedRate : 0,
    earningKind: paymentMethod === "monthly" ? "none" : paymentMethod.startsWith("monthly_") ? "bonus" : "piece",
  };
};

const refreshSetStatus = async (beamSetId, session) => {
  const rows = await getSessionQuery(WeavingBeam.find({ beamSetId }).select("status").lean(), session);
  const statuses = new Set(rows.map((row) => row.status));
  const status = statuses.size === 1 && statuses.has("completed") ? "completed"
    : statuses.has("loaded") ? "loaded"
      : statuses.has("knotting") ? "knotting" : "available";
  await WeavingBeamSet.updateOne({ _id: beamSetId }, { $set: { status } }, sessionOptions(session));
  return status;
};

const syncReceiptBeams = async ({ userId, receiptId, session }) => {
  const receipt = await getSessionQuery(WeavingSizingReceipt.findOne({ _id: receiptId, userId, status: "posted" }), session);
  if (!receipt) throw createHttpError("Posted Sizing Receipt not found.", 404);
  const beamCount = Number(receipt.beamCount) || 0;
  if (beamCount < 1) throw createHttpError("Sizing Receipt has no beams.", 400);

  const set = await WeavingBeamSet.findOneAndUpdate(
    { userId, sizingReceiptId: receipt._id },
    { $set: { receiptNo: receipt.receiptNo, setNo: receipt.setNo, sizingPartyId: receipt.sizingPartyId, contractId: receipt.contractId, fabricQualityId: receipt.fabricQualityId, count: receipt.count, loomSize: receipt.loomSize, ends: receipt.ends, length: receipt.length, beamCount }, $setOnInsert: { moduleScope: WEAVING_SCOPE, status: "available" } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) },
  );
  const baseNo = clean(receipt.setNo) || clean(receipt.receiptNo);
  await Promise.all(Array.from({ length: beamCount }, (_, index) => WeavingBeam.findOneAndUpdate(
    { userId, sizingReceiptId: receipt._id, beamIndex: index + 1 },
    { $setOnInsert: { userId, moduleScope: WEAVING_SCOPE, beamSetId: set._id, sizingReceiptId: receipt._id, beamIndex: index + 1, beamNo: `${baseNo}-B${String(index + 1).padStart(2, "0")}`, status: "available" } },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) },
  )));
  return set;
};

const syncPostedReceipts = async (userId) => {
  const receipts = await WeavingSizingReceipt.find({ userId, status: "posted" }).select("_id").lean();
  for (const receipt of receipts) await syncReceiptBeams({ userId, receiptId: receipt._id });
  return receipts.length;
};

const listSets = async (userId, query = {}) => {
  await syncPostedReceipts(userId);
  const filter = { userId };
  if (query.status) filter.status = query.status;
  return WeavingBeamSet.find(filter).populate("sizingPartyId", "name").populate("contractId", "contractNo").populate("fabricQualityId", "name qualityName").sort({ createdAt: -1 }).lean();
};

const getSet = async (userId, id) => {
  const set = await WeavingBeamSet.findOne({ _id: id, userId }).populate("sizingPartyId", "name").populate("contractId", "contractNo").populate("fabricQualityId", "name qualityName").lean();
  if (!set) throw createHttpError("Beam Set not found.", 404);
  const receipt = await WeavingSizingReceipt.findOne({ _id: set.sizingReceiptId, userId, status: "posted" }).select("_id").lean();
  if (!receipt) throw createHttpError("This Beam Set belongs to a void Sizing Receipt.", 409);
  const [beams, jobs] = await Promise.all([
    WeavingBeam.find({ userId, beamSetId: set._id }).populate("activeLoomId", "name loomNumber").sort({ beamIndex: 1 }).lean(),
    WeavingKnottingJob.find({ userId, beamSetId: set._id }).populate("employeeId", "name employeeNo designationName").populate("loomId", "name loomNumber").sort({ workDate: -1, createdAt: -1 }).lean(),
  ]);
  return { ...set, beams, jobs };
};

const getMeta = async (userId) => {
  const [employees, looms] = await Promise.all([
    Employee.find({ userId, moduleScope: WEAVING_SCOPE, isDeleted: false, status: "active", designationName: "Beam Knotting Worker" }).select("name employeeNo designationName knottingPaymentMethod").sort({ name: 1 }).lean(),
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
  ]);
  return { employees, looms };
};

const validateJobEntities = async ({ userId, payload, session }) => {
  const [set, employee] = await Promise.all([
    getSessionQuery(WeavingBeamSet.findOne({ _id: payload.beamSetId, userId }), session),
    getSessionQuery(Employee.findOne({ _id: payload.employeeId, userId, moduleScope: WEAVING_SCOPE, isDeleted: false, status: "active" }), session),
  ]);
  if (!set) throw createHttpError("Beam Set not found.", 404);
  if (!employee || employee.designationName !== "Beam Knotting Worker") throw createHttpError("Select an active Beam Knotting Worker.", 400);
  const receipt = await getSessionQuery(WeavingSizingReceipt.findOne({ _id: set.sizingReceiptId, userId, status: "posted" }), session);
  if (!receipt) throw createHttpError("Void Sizing Receipt beams cannot be used.", 409);
  const beamIds = [...new Set((payload.beamIds || []).map(String))];
  const beams = await getSessionQuery(WeavingBeam.find({ _id: { $in: beamIds }, userId, beamSetId: set._id }), session);
  if (!beams.length || beams.length !== beamIds.length) throw createHttpError("Select valid beams from this set.", 400);
  if (beams.some((beam) => beam.status !== "available" || beam.knottingJobId)) {
    throw createHttpError("One or more selected beams already have an active knotting or loading job.", 409);
  }
  let loom = null;
  if (payload.loomId) {
    loom = await getSessionQuery(WeavingLoom.findOne({ _id: payload.loomId, userId, isActive: true }), session);
    if (!loom) throw createHttpError("Active Loom not found.", 400);
    const occupied = await getSessionQuery(WeavingBeam.findOne({ userId, activeLoomId: loom._id, status: "loaded", _id: { $nin: beams.map((beam) => beam._id) } }), session);
    if (occupied) throw createHttpError("This Loom already has an active beam.", 409);
    if (beams.length > 1) throw createHttpError("Only one beam can be loaded on a Loom.", 400);
  }
  return { set, employee, beams, loom };
};

const createJob = async ({ userId, actorId, payload }) => {
  const session = await mongoose.startSession(); let result; let touched = [];
  try {
    await session.withTransaction(async () => {
      const { set, employee, beams, loom } = await validateJobEntities({ userId, payload, session });
      const paymentMethod = employee.knottingPaymentMethod || "monthly";
      const completedBeams = Number(payload.completedBeams) || beams.length;
      const earning = calculateKnottingEarning({ paymentMethod, completedBeams, rate: payload.rate });
      const job = new WeavingKnottingJob({ userId, moduleScope: WEAVING_SCOPE, beamSetId: set._id, sizingReceiptId: set.sizingReceiptId, employeeId: employee._id, loomId: loom?._id || null, beamIds: beams.map((beam) => beam._id), workDate: clean(payload.workDate), paymentMethod, completedBeams, rate: roundMoney(payload.rate), ...earning, notes: clean(payload.notes), status: payload.approve ? "approved" : "draft", approvedAt: payload.approve ? new Date() : null, approvedBy: payload.approve ? actorId : null });
      if (!job.workDate) throw createHttpError("Work Date is required.", 400);
      await job.save({ session });
      if (payload.approve && earning.amount > 0) {
        const [employeeAccount, expenseAccount] = await Promise.all([ensureEmployeeAccount({ userId, moduleScope: WEAVING_SCOPE, employee, session }), ensureSalaryExpenseAccount({ userId, moduleScope: WEAVING_SCOPE, session })]);
        const journal = await createEmployeeJournal({ userId, moduleScope: WEAVING_SCOPE, employee, date: job.workDate, description: `Beam knotting ${set.setNo || set.receiptNo} - ${employee.name}`, sourceType: "expense", originModule: "weaving.knotting", referenceId: job._id, lines: [{ account: expenseAccount._id, type: "debit", amount: earning.amount }, { account: employeeAccount._id, type: "credit", amount: earning.amount }], session });
        job.journalEntryId = journal._id; await job.save({ session }); touched.push(...collectAccountIdsFromJournal(journal));
      }
      await WeavingBeam.updateMany({ _id: { $in: beams.map((beam) => beam._id) } }, { $set: { status: loom ? "loaded" : "knotting", knottingJobId: job._id, activeLoomId: loom?._id || null, loadedAt: loom ? new Date() : null } }, sessionOptions(session));
      await refreshSetStatus(set._id, session); result = job;
    });
  } finally { await session.endSession(); }
  await recalculateTouchedAccounts(touched); return result;
};

const voidJob = async ({ userId, actorId, jobId, reason }) => {
  const session = await mongoose.startSession(); let result; let touched = [];
  try {
    await session.withTransaction(async () => {
      const job = await getSessionQuery(WeavingKnottingJob.findOne({ _id: jobId, userId, status: { $ne: "void" } }), session);
      if (!job) throw createHttpError("Knotting Job not found.", 404);
      if (job.journalEntryId) { const reversal = await reverseJournals({ journalIds: [job.journalEntryId], userId, date: new Date(), session }); job.reversalJournalEntryIds.push(...reversal.reversalIds); touched.push(...reversal.accountIds); }
      job.status = "void"; job.voidedAt = new Date(); job.voidedBy = actorId; job.voidReason = clean(reason); await job.save({ session });
      await WeavingBeam.updateMany({ userId, knottingJobId: job._id, status: { $ne: "completed" } }, { $set: { status: "available", knottingJobId: null, activeLoomId: null, loadedAt: null } }, sessionOptions(session));
      await refreshSetStatus(job.beamSetId, session); result = job;
    });
  } finally { await session.endSession(); }
  await recalculateTouchedAccounts(touched); return result;
};

const hasCostingKnottingEarning = (job) => ["piece", "bonus"].includes(job?.earningKind);

module.exports = { calculateKnottingEarning, createJob: costing.withCostingInvalidation(createJob, "knotting", hasCostingKnottingEarning), getMeta, getSet, listSets, syncPostedReceipts, syncReceiptBeams, voidJob: costing.withCostingInvalidation(voidJob, "knotting", hasCostingKnottingEarning), _test: { calculateKnottingEarning } };
