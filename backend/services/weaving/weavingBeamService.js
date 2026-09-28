const { runningContexts, runForLoom, contextFromSources } = require("./weavingProductionContextService");
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
    { $set: { receiptNo: receipt.receiptNo, setNo: receipt.setNo, sizingPartyId: receipt.sizingPartyId, contractId: receipt.contractId, fabricQualityId: receipt.fabricQualityId, ownershipType: receipt.ownershipType, ownerPartyId: receipt.ownerPartyId, count: receipt.count, loomSize: receipt.loomSize, ends: receipt.ends, length: receipt.length, beamCount }, $setOnInsert: { moduleScope: WEAVING_SCOPE, status: "available" } },
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
  const rows = await WeavingBeamSet.find(filter).populate("sizingPartyId", "name").populate("contractId", "type contractNo contractType partyId partyName itemId quantity unit").populate("ownerPartyId", "name").populate("fabricQualityId", "name qualityName").sort({ createdAt: -1 }).lean();
  const beams = await WeavingBeam.find({ userId, beamSetId: { $in: rows.map((row) => row._id) } }).select("beamSetId status").lean();
  const counts = new Map();
  for (const beam of beams) {
    const key = String(beam.beamSetId);
    const count = counts.get(key) || { total: 0, available: 0, knotting: 0, loaded: 0, completed: 0 };
    count.total += 1;
    if (Object.prototype.hasOwnProperty.call(count, beam.status)) count[beam.status] += 1;
    counts.set(key, count);
  }
  return rows.map((row) => ({ ...row, beamCounts: counts.get(String(row._id)) || { total: 0, available: 0, knotting: 0, loaded: 0, completed: 0 }, productionContext: { ...contextFromSources(row.contractId, row), qualityName: row.fabricQualityId?.name, ownerName: row.ownerPartyId?.name } }));
};

const getSet = async (userId, id) => {
  const set = await WeavingBeamSet.findOne({ _id: id, userId }).populate("sizingPartyId", "name").populate("contractId", "type contractNo contractType partyId partyName itemId quantity unit").populate("ownerPartyId", "name").populate("fabricQualityId", "name qualityName").lean();
  if (!set) throw createHttpError("Beam Set not found.", 404);
  const receipt = await WeavingSizingReceipt.findOne({ _id: set.sizingReceiptId, userId, status: "posted" }).select("_id").lean();
  if (!receipt) throw createHttpError("This Beam Set belongs to a void Sizing Receipt.", 409);
  const [beams, jobs] = await Promise.all([
    WeavingBeam.find({ userId, beamSetId: set._id }).populate("activeLoomId", "name loomNumber").sort({ beamIndex: 1 }).lean(),
    WeavingKnottingJob.find({ userId, beamSetId: set._id }).populate("employeeId", "name employeeNo designationName").populate("loomId", "name loomNumber").sort({ workDate: -1, createdAt: -1 }).lean(),
  ]);
  return { ...set, beams, jobs, productionContext: { ...contextFromSources(set.contractId, set), qualityName: set.fabricQualityId?.name, ownerName: set.ownerPartyId?.name } };
};

const getMeta = async (userId) => {
  const [employees, looms] = await Promise.all([
    Employee.find({ userId, moduleScope: WEAVING_SCOPE, isDeleted: false, status: "active", designationName: "Beam Knotting Worker" }).select("name employeeNo designationName knottingPaymentMethod knottingDefaultRate").sort({ name: 1 }).lean(),
    WeavingLoom.find({ userId, isActive: true }).select("name loomNumber").sort({ loomNumber: 1 }).lean(),
  ]);
  const currentRuns = await runningContexts(userId);
  return { employees, looms: looms.map((loom) => ({ ...loom, currentRun: runForLoom(currentRuns, loom) })), currentRuns };
};

const validateJobEntities = async ({ userId, payload, session }) => {
  const set = await getSessionQuery(WeavingBeamSet.findOne({ _id: payload.beamSetId, userId }), session);
  if (!set) throw createHttpError("Beam Set not found.", 404);
  const receipt = await getSessionQuery(WeavingSizingReceipt.findOne({ _id: set.sizingReceiptId, userId, status: "posted" }), session);
  if (!receipt) throw createHttpError("Void Sizing Receipt beams cannot be used.", 409);
  const beamIds = [...new Set((payload.beamIds || []).map(String))];
  const beams = await getSessionQuery(WeavingBeam.find({ _id: { $in: beamIds }, userId, beamSetId: set._id }), session);
  if (!beams.length || beams.length !== beamIds.length) throw createHttpError("Select valid beams from this set.", 400);
  const newBeams = beams.filter((beam) => beam.status === "available" && !beam.knottingJobId);
  const legacyKnottingBeams = beams.filter((beam) => beam.status === "knotting" && beam.knottingJobId);
  if (newBeams.length + legacyKnottingBeams.length !== beams.length) {
    throw createHttpError("One or more selected beams are already loaded or completed.", 409);
  }
  const employee = newBeams.length
    ? await getSessionQuery(Employee.findOne({ _id: payload.employeeId, userId, moduleScope: WEAVING_SCOPE, isDeleted: false, status: "active" }), session)
    : null;
  if (newBeams.length && (!employee || employee.designationName !== "Beam Knotting Worker")) throw createHttpError("Select an active Beam Knotting Worker.", 400);
  const load = payload.load === true;
  if (!load) throw createHttpError("Selected beams must be loaded to a Loom.", 400);
  if (payload.loomId && beams.length > 1) throw createHttpError("Assign a Loom to each beam separately.", 400);
  const supplied = payload.beamAssignments || [];
  if (!Array.isArray(supplied) || supplied.some((row) => !beamIds.includes(String(row.beamId))) || new Set(supplied.map((row) => String(row.beamId))).size !== supplied.length) {
    throw createHttpError("Invalid beam Loom assignments.", 400);
  }
  const assignments = [];
  const previousBeams = [];
  const confirmed = new Set((Array.isArray(payload.completeBeamIds) ? payload.completeBeamIds : []).map(String));
  const usedLooms = new Set();
  for (const beam of beams) {
    const input = supplied.find((row) => String(row.beamId) === String(beam._id)) || {};
    let loomNumber = clean(input.loomNumber);
    const loomId = input.loomId || payload.loomId;
    const loom = loomId || loomNumber
      ? await getSessionQuery(WeavingLoom.findOne({ userId, ...(loomId ? { _id: loomId } : { loomNumber }) }), session)
      : null;
    if (!loomNumber && !loomId) throw createHttpError("Assign an active Loom to every selected Beam.", 400);
    if ((loomId && !loom) || (loom && !loom.isActive)) throw createHttpError("Active Loom not found.", 400);
    if (loom) loomNumber = loom.loomNumber;
    if (usedLooms.has(loomNumber)) throw createHttpError("Only one beam can be loaded on a Loom.", 400);
    usedLooms.add(loomNumber);
    const occupied = await getSessionQuery(WeavingBeam.findOne({ userId, status: "loaded", $or: [{ loomNumber }, ...(loom ? [{ activeLoomId: loom._id }] : [])] }), session);
    if (occupied) {
      if (!confirmed.has(String(occupied._id))) throw createHttpError("This Loom has an active beam. Refresh and confirm completing its current run before loading a new beam.", 409);
      previousBeams.push(occupied);
    }
    assignments.push({ beamId: beam._id, loomId: loom?._id || null, loomNumber });
  }
  return { set, employee, beams, newBeams, legacyKnottingBeams, assignments, previousBeams };
};

const createJob = async ({ userId, actorId, payload }) => {
  const session = await mongoose.startSession(); let result; let touched = [];
  try {
    await session.withTransaction(async () => {
      touched = [];
      const { set, employee, beams, newBeams, assignments, previousBeams } = await validateJobEntities({ userId, payload, session });
      let job = null;
      if (newBeams.length) {
        const paymentMethod = employee.knottingPaymentMethod || "monthly";
        const completedBeams = newBeams.length;
        const rate = paymentMethod === "monthly" ? 0 : Number(payload.rate === undefined || payload.rate === "" ? employee.knottingDefaultRate || 0 : payload.rate);
        if (!Number.isFinite(rate) || rate < 0) throw createHttpError("Knotting rate must be zero or greater.", 400);
        const earning = calculateKnottingEarning({ paymentMethod, completedBeams, rate });
        job = new WeavingKnottingJob({ userId, moduleScope: WEAVING_SCOPE, beamSetId: set._id, sizingReceiptId: set.sizingReceiptId, employeeId: employee._id, loomId: newBeams.length === 1 ? assignments.find((entry) => String(entry.beamId) === String(newBeams[0]._id))?.loomId || null : null, beamAssignments: assignments.filter((entry) => newBeams.some((beam) => String(beam._id) === String(entry.beamId))), beamIds: newBeams.map((beam) => beam._id), workDate: clean(payload.workDate), paymentMethod, completedBeams, rate: roundMoney(rate), ...earning, notes: clean(payload.notes), status: payload.approve ? "approved" : "draft", approvedAt: payload.approve ? new Date() : null, approvedBy: payload.approve ? actorId : null });
        if (!job.workDate) throw createHttpError("Work Date is required.", 400);
        await job.save({ session });
        if (payload.approve && earning.amount > 0) {
        const [employeeAccount, expenseAccount] = await Promise.all([ensureEmployeeAccount({ userId, moduleScope: WEAVING_SCOPE, employee, session }), ensureSalaryExpenseAccount({ userId, moduleScope: WEAVING_SCOPE, session })]);
        const journal = await createEmployeeJournal({ userId, moduleScope: WEAVING_SCOPE, employee, date: job.workDate, description: `Beam knotting ${set.setNo || set.receiptNo} - ${employee.name}`, sourceType: "expense", originModule: "weaving.knotting", referenceId: job._id, lines: [{ account: expenseAccount._id, type: "debit", amount: earning.amount }, { account: employeeAccount._id, type: "credit", amount: earning.amount }], session });
          job.journalEntryId = journal._id; await job.save({ session }); touched.push(...collectAccountIdsFromJournal(journal));
        }
      }
      // Complete only the exact runs confirmed by the operator, in the same
      // transaction as the new job/load. Folding and job history stay intact.
      for (const previous of previousBeams) {
        await WeavingBeam.updateOne({ _id: previous._id, userId, status: "loaded" }, { $set: { status: "completed", completedAt: new Date(), activeLoomId: null } }, sessionOptions(session));
        await refreshSetStatus(previous.beamSetId, session);
      }
      for (const assignment of assignments) {
        const beam = beams.find((row) => String(row._id) === String(assignment.beamId));
        await WeavingBeam.updateOne({ _id: assignment.beamId, userId }, { $set: { status: "loaded", knottingJobId: beam.knottingJobId || job?._id || null, activeLoomId: assignment.loomId, loomNumber: assignment.loomNumber, loadedAt: new Date() } }, sessionOptions(session));
      }
      await refreshSetStatus(set._id, session); result = { job, loadedBeamIds: assignments.map((entry) => entry.beamId) };
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
      await WeavingBeam.updateMany({ userId, knottingJobId: job._id, status: { $ne: "completed" } }, { $set: { status: "available", knottingJobId: null, activeLoomId: null, loomNumber: "", loadedAt: null } }, sessionOptions(session));
      await refreshSetStatus(job.beamSetId, session); result = job;
    });
  } finally { await session.endSession(); }
  await recalculateTouchedAccounts(touched); return result;
};

const completeBeamInSession = async ({ userId, beamId, loomId, session }) => {
  const beam = await getSessionQuery(WeavingBeam.findOne({ _id: beamId, userId }), session);
  if (!beam) throw createHttpError("Beam not found.", 404);
  // Manual completion stays idempotent; Folding must identify a loaded run.
  if (beam.status === "completed" && !loomId) return beam;
  if (beam.status !== "loaded") throw createHttpError("Only a loaded Beam can be completed / unloaded.", 409);
  if (loomId) {
    const loom = await getSessionQuery(WeavingLoom.findOne({ _id: loomId, userId, isActive: true }), session);
    if (!loom || (beam.activeLoomId ? String(beam.activeLoomId) !== String(loomId) : beam.loomNumber !== loom.loomNumber)) {
      throw createHttpError("Selected Beam is not currently loaded on this Loom.", 409);
    }
  }
  beam.status = "completed";
  beam.completedAt = new Date();
  beam.activeLoomId = null;
  await beam.save({ session });
  await refreshSetStatus(beam.beamSetId, session);
  return beam;
};

const reopenBeamInSession = async ({ userId, beamId, loomId, session }) => {
  const beam = await getSessionQuery(WeavingBeam.findOne({ _id: beamId, userId }), session);
  const loom = await getSessionQuery(WeavingLoom.findOne({ _id: loomId, userId, isActive: true }), session);
  if (!beam || beam.status !== "completed" || !loom) throw createHttpError("Only a completed Beam can be reopened on its original active Loom.", 409);
  const occupied = await getSessionQuery(WeavingBeam.findOne({ userId, status: "loaded", $or: [{ activeLoomId: loom._id }, { loomNumber: loom.loomNumber }] }), session);
  if (occupied) throw createHttpError(`Loom ${loom.loomNumber} currently has Beam ${occupied.beamNo} loaded. Complete or unload that Beam before reopening ${beam.beamNo}.`, 409);
  beam.status = "loaded";
  beam.activeLoomId = loom._id;
  beam.loomNumber = loom.loomNumber;
  beam.completedAt = null;
  await beam.save({ session });
  await refreshSetStatus(beam.beamSetId, session);
  return beam;
};

const completeBeam = async ({ userId, beamId }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await completeBeamInSession({ userId, beamId, session });
    });
  } finally { await session.endSession(); }
  return result;
};

const hasCostingKnottingEarning = (job) => ["piece", "bonus"].includes(job?.earningKind);

module.exports = { completeBeam, completeBeamInSession, reopenBeamInSession, calculateKnottingEarning, createJob: costing.withCostingInvalidation(createJob, "knotting", hasCostingKnottingEarning), getMeta, getSet, listSets, syncPostedReceipts, syncReceiptBeams, voidJob: costing.withCostingInvalidation(voidJob, "knotting", hasCostingKnottingEarning), _test: { calculateKnottingEarning } };
