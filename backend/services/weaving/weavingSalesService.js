const mongoose = require("mongoose");
const Counter = require("../../models/Counter");
const JournalEntry = require("../../models/JournalEntry");
const Account = require("../../models/Account");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingKacchiParchi = require("../../models/WeavingKacchiParchi");
const WeavingMoneyTransaction = require("../../models/WeavingMoneyTransaction");
const WeavingPakkiSettlement = require("../../models/WeavingPakkiSettlement");
const WeavingParty = require("../../models/WeavingParty");
const WeavingRejectionDue = require("../../models/WeavingRejectionDue");
const WeavingRejectionReceipt = require("../../models/WeavingRejectionReceipt");
const WeavingSalesInvoice = require("../../models/WeavingSalesInvoice");
const WeavingStockLock = require("../../models/WeavingStockLock");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const commercial = require("./weavingCommercialService");
const foldingStock = require("./weavingFoldingService");
const yarnStock = require("./weavingYarnStockService");
const costing = require("./weavingCostingService");
const thanLocation = require("./weavingThanLocationService");
const manualStock = require("./weavingManualStockService");
const { recalculateAccountBalances } = require("../../utils/accountHelper");

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const qty = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const clean = (value = "") => String(value || "").trim();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const id = (value) => String(value?._id || value || "");
const sessionOptions = (session) => (session ? { session } : {});
const setSession = (query, session) => (session ? query.session(session) : query);

const runAtomic = async (work, requireTransaction = false) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (error) {
    const unsupported = /Transaction numbers are only allowed|replica set member|does not support transactions/i.test(error.message || "");
    if (!unsupported) throw error;
    if (requireTransaction) throw fail("Sales changes require database transaction support. No changes were saved.", 503);
    return work(null);
  } finally {
    await session.endSession();
  }
};

const createOne = async (Model, document, session) => {
  if (!session) return Model.create(document);
  const [created] = await Model.create([document], { session });
  return created;
};

const calculateSettlement = (source = {}) => {
  const grossMeter = qty(source.grossMeter);
  const oilKamiMeter = qty(source.oilKamiMeter);
  const shortageMeter = qty(source.shortageMeter);
  const rejectionMeter = qty(source.rejectionMeter);
  const otherMeterDeduction = qty(source.otherMeterDeduction);
  const deductions = [oilKamiMeter, shortageMeter, rejectionMeter, otherMeterDeduction];
  if (grossMeter <= 0) throw fail("Gross Meter must be greater than zero");
  if (deductions.some((value) => value < 0)) throw fail("Meter deductions cannot be negative");
  if (qty(deductions.reduce((sum, value) => sum + value, 0)) > grossMeter) throw fail("Combined meter deductions cannot exceed Gross Meter");
  return {
    grossMeter,
    oilKamiMeter,
    shortageMeter,
    rejectionMeter,
    otherMeterDeduction,
    netMeter: qty(grossMeter - oilKamiMeter),
    billableMeter: qty(grossMeter - deductions.reduce((sum, value) => sum + value, 0)),
  };
};

const dueDateFromCreditDays = (date, days) => {
  if (!date) return "";
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.getTime())) throw fail("Valid date is required");
  value.setUTCDate(value.getUTCDate() + Math.max(0, Math.trunc(Number(days) || 0)));
  return value.toISOString().slice(0, 10);
};

const calculateInvoiceTotals = ({ quantity, rate, discountAmount = 0, taxAmount = 0 }) => {
  const subtotal = round(qty(quantity) * round(rate));
  const discount = round(discountAmount);
  const tax = round(taxAmount);
  if (discount < 0 || tax < 0 || discount > subtotal) throw fail("Invalid discount or tax amount");
  return { subtotal, discountAmount: discount, taxAmount: tax, grandTotal: round(subtotal - discount + tax) };
};

const validateReceiptClassification = (source = {}) => {
  const receivedMeter = qty(source.receivedMeter);
  const meters = { normalMeter: qty(source.normalMeter), rejectedMeter: qty(source.rejectedMeter), cutPieceMeter: qty(source.cutPieceMeter), wasteMeter: qty(source.wasteMeter) };
  if (receivedMeter <= 0 || Object.values(meters).some((value) => value < 0) || qty(Object.values(meters).reduce((sum, value) => sum + value, 0)) !== receivedMeter) throw fail("Rejection classification must equal Received Now");
  const receivedKg = qty(source.receivedKg);
  const kgs = { normalKg: qty(source.normalKg), rejectedKg: qty(source.rejectedKg), cutPieceKg: qty(source.cutPieceKg), wasteKg: qty(source.wasteKg) };
  if (Object.values(kgs).some((value) => value < 0) || (receivedKg > 0 && qty(Object.values(kgs).reduce((sum, value) => sum + value, 0)) !== receivedKg)) throw fail("Category KG must equal Received KG");
  const pieceCount = qty(source.pieceCount);
  const pieces = { normalPieces: qty(source.normalPieces), rejectedPieces: qty(source.rejectedPieces), cutPiecePieces: qty(source.cutPiecePieces), wastePieces: qty(source.wastePieces) };
  if (Object.values(pieces).some((value) => value < 0) || (pieceCount > 0 && qty(Object.values(pieces).reduce((sum, value) => sum + value, 0)) !== pieceCount)) throw fail("Category Pieces must equal Piece Count");
  return { receivedMeter, receivedKg, pieceCount, ...meters, ...kgs, ...pieces };
};

const allocateNo = async (userId, type, prefix, width = 5, session = null) => {
  const sequences = {
    weaving_sales_invoice: [WeavingSalesInvoice, "invoiceNo", "WS"],
    weaving_kacchi: [WeavingKacchiParchi, "kacchiNo", "KC"],
    weaving_pakki: [WeavingPakkiSettlement, "pakkiNo", "PK"],
    weaving_rejection_receipt: [WeavingRejectionReceipt, "receiptNo", "RR"],
    weaving_receive_payment: [WeavingMoneyTransaction, "transactionNo", "RCV"],
  };
  const [Model, field, expectedPrefix] = sequences[type] || [];
  if (!Model || prefix !== expectedPrefix) throw fail("Invalid Sales numbering sequence.");
  // Include void/legacy records: their numbers must never be reused. Compare
  // numeric suffixes, since string sorting fails when the padded width grows.
  const rows = await setSession(Model.find({ userId, [field]: { $regex: `^${prefix}-[0-9]+$` } }).select(field).lean(), session);
  let highest = 0;
  for (const row of rows) {
    const value = Number(row[field].slice(prefix.length + 1));
    if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw fail("Sales numbering sequence exceeds the supported range.");
    highest = Math.max(highest, value);
  }
  // Reconcile and increment in ONE atomic counter write, using the same
  // transaction as the document. Never lower a healthy or concurrently advanced counter.
  const counter = await Counter.findOneAndUpdate(
    { userId, type },
    [{ $set: { seq: { $add: [{ $max: [{ $ifNull: ["$seq", 0] }, highest] }, 1] } } }],
    { new: true, upsert: true, setDefaultsOnInsert: false, ...sessionOptions(session) },
  );
  return `${prefix}-${String(counter.seq).padStart(width, "0")}`;
};

const previewNo = async (userId, type, prefix, width = 5) => {
  const counter = await Counter.findOne({ userId, type }).select("seq").lean();
  return `${prefix}-${String((Number(counter?.seq) || 0) + 1).padStart(width, "0")}`;
};

const qualitySnapshot = (quality) => ({ name: quality.name, code: quality.code, warpCount: quality.warpCount, weftCount: quality.weftCount, construction: quality.construction, width: quality.width, brand: quality.brand });

const getFabricBalances = async ({ userId, fabricQualityId, godownId, category = "normal", ownershipType = "own", ownerPartyId = null, session = null, exactSource = false }) => {
  const match = { userId, fabricQualityId, status: "posted", ...(godownId || exactSource ? { godownId: godownId || null } : {}), ownershipType };
  if (ownershipType === "party") match.ownerPartyId = ownerPartyId;
  const entries = await setSession(WeavingFoldingEntry.find(match).select("meter weightKg goodMeter bGradeMeter rejectedMeter").lean(), session);
  const gradeField = category === "normal" ? "goodMeter" : category === "b" ? "bGradeMeter" : category === "rejected" ? "rejectedMeter" : null;
  const opening = entries.reduce((total, entry) => {
    const meter = gradeField ? Number(entry[gradeField] || 0) : 0;
    const ratio = Number(entry.meter || 0) > 0 ? meter / Number(entry.meter) : 0;
    total.meter += meter;
    total.weightKg += Number(entry.weightKg || 0) * ratio;
    total.thanCount += ratio;
    return total;
  }, { meter: 0, weightKg: 0, thanCount: 0, pieceCount: 0 });
  const movementMatch = { userId, fabricQualityId, category, isVoided: false, ...(godownId || exactSource ? { godownId: godownId || null } : {}), ownershipType };
  if (ownershipType === "party") movementMatch.ownerPartyId = ownerPartyId;
  const movements = await setSession(WeavingFabricMovement.find(movementMatch).select("direction meter weightKg thanCount pieceCount").lean(), session);
  movements.forEach((movement) => {
    const sign = movement.direction === "in" ? 1 : -1;
    opening.meter += sign * Number(movement.meter || 0);
    opening.weightKg += sign * Number(movement.weightKg || 0);
    opening.thanCount += sign * Number(movement.thanCount || 0);
    opening.pieceCount += sign * Number(movement.pieceCount || 0);
  });
  return Object.fromEntries(Object.entries(opening).map(([key, value]) => [key, qty(value)]));
};

const getFabricBalance = async (filter) => (await getFabricBalances(filter)).meter;

const withStockLock = async (userId, key, work) => {
  await WeavingStockLock.deleteMany({ userId, key, expiresAt: { $lte: new Date() } });
  try { await WeavingStockLock.create({ userId, key, expiresAt: new Date(Date.now() + 60000) }); }
  catch (error) { if (error?.code === 11000) throw fail("This stock is being updated. Please retry.", 409); throw error; }
  try { return await work(); } finally { await WeavingStockLock.deleteOne({ userId, key }); }
};

const fabricLockKey = (row) => ["fabric", row.fabricQualityId, row.godownId, row.category || "normal", row.ownershipType || "own", row.ownerPartyId || "own"].map(id).join(":");
const withFabricLocks = async (userId, buckets, work) => {
  const keys = [...new Set(buckets.map(fabricLockKey))].sort();
  const acquire = (index) => index === keys.length ? work() : withStockLock(userId, keys[index], () => acquire(index + 1));
  return acquire(0);
};
const validateSource = async (userId, godownId, session) => {
  if (godownId === null) return null;
  if (!mongoose.isValidObjectId(godownId)) throw fail("Select a valid Source Location for the selected stock.");
  const godown = await setSession(WeavingGodown.findOne({ _id: godownId, userId, isActive: true }), session);
  if (!godown) throw fail("Select a valid Source Location for the selected stock.");
  return godown;
};
const assertManualStock = async (userId, bucket, values, session) => {
  const rows = await manualStock.getManualStock(userId, session);
  const pool = rows.find((row) => manualStock.key(row) === manualStock.key(bucket)) || {};
  const aggregate = await getFabricBalances({ userId, ...bucket, session, exactSource: true });
  const tracked = (await thanLocation.resolveCurrentThans(userId, { session })).filter((row) => row.locationState === "known" && thanLocation.matchesBucket(row, bucket));
  const reserved = tracked.reduce((total, row) => ({ meter: qty(total.meter + row.meter), weightKg: qty(total.weightKg + row.weightKg), thanCount: total.thanCount + 1 }), { meter: 0, weightKg: 0, thanCount: 0 });
  const available = Object.fromEntries(["meter", "weightKg", "thanCount", "pieceCount"].map((field) => [field, Math.max(0, qty(Math.min(Number(pool[field] || 0), aggregate[field] - Number(reserved[field] || 0))))]));
  if (values.meter <= 0 || Object.values(values).some((value) => !Number.isFinite(Number(value)) || Number(value) < 0)) throw fail("Enter a valid Meter quantity and non-negative KG / Than count.");
  if (Object.keys(available).some((field) => Number(values[field] || 0) > available[field] + 0.000001)) throw fail(`Only ${available.meter} M meter-based Fabric Stock is available (KG: ${available.weightKg}, Than: ${available.thanCount}). Use Than Wise for tracked Thans.`, 409);
  return available;
};
const kacchiBucket = async (userId, payload) => {
  if (!mongoose.isValidObjectId(payload.contractId)) throw fail("Select a valid Contract.");
  const contract = await WeavingContract.findOne({ _id: payload.contractId, userId });
  return { fabricQualityId: payload.fabricQualityId, godownId: payload.godownId, category: "normal", ownershipType: contract?.contractType === "conversion" ? "party" : "own", ownerPartyId: contract?.contractType === "conversion" ? contract.partyId : null };
};
const saveManualKacchi = async (userId, payload, session, current = null) => {
  if (!mongoose.isValidObjectId(payload.contractId) || !mongoose.isValidObjectId(payload.partyId) || !mongoose.isValidObjectId(payload.fabricQualityId)) throw fail("Select a valid Contract, Party and Quality.");
  const contract = await setSession(WeavingContract.findOne({ _id: payload.contractId, userId, type: "sales", status: "active" }), session);
  const party = await setSession(WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: ["customer", "both"] } }), session);
  const quality = await setSession(WeavingFabricQuality.findOne({ _id: payload.fabricQualityId, userId, isActive: true }), session);
  await validateSource(userId, payload.godownId, session);
  if (!contract || !party || !quality || id(contract.partyId) !== id(party) || id(contract.itemId) !== id(quality)) throw fail("Kacchi details do not match the selected Contract.");
  const bucket = { fabricQualityId: quality._id, godownId: payload.godownId, category: "normal", ownershipType: contract.contractType === "conversion" ? "party" : "own", ownerPartyId: contract.contractType === "conversion" ? party._id : null };
  if (current) await WeavingFabricMovement.updateMany({ userId, kacchiId: current._id, isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
  const values = { meter: qty(payload.totalMeter), weightKg: qty(payload.totalKg), thanCount: qty(payload.totalThan) };
  await assertManualStock(userId, bucket, values, session);
  const document = { ...bucket, entryMode: "manual", dispatchDate: clean(payload.dispatchDate), partyId: party._id, contractId: contract._id, qualitySnapshot: qualitySnapshot(quality), lines: [], totalMeter: values.meter, totalKg: values.weightKg, totalThan: values.thanCount, totalLbs: qty(values.weightKg * 2.2046226218), notes: clean(payload.notes) };
  let kacchi = current;
  if (kacchi) { Object.assign(kacchi, document); await kacchi.save(sessionOptions(session)); }
  else kacchi = await createOne(WeavingKacchiParchi, { userId, requestKey: clean(payload.requestKey), kacchiNo: await allocateNo(userId, "weaving_kacchi", "KC", 5, session), ...document }, session);
  await createOne(WeavingFabricMovement, { userId, ...bucket, ...values, date: kacchi.dispatchDate, movementType: "kacchi_out", direction: "out", stockIdentity: "untracked", kacchiId: kacchi._id, notes: kacchi.kacchiNo }, session);
  return kacchi;
};

const buildKacchiContext = async (userId, payload, session, currentKacchiId = null) => {
  const sourceMessage = "Select a valid Source Location for the selected Thans.";
  if (!mongoose.isValidObjectId(payload.contractId)) throw fail("Select a valid Contract.");
  if (!mongoose.isValidObjectId(payload.partyId) || !mongoose.isValidObjectId(payload.fabricQualityId)) throw fail("Select a valid Party and Fabric Quality for the Contract.");
  // Null explicitly selects Folding / Unassigned; an omitted or empty source is not a selection.
  const godownId = payload.godownId;
  if (godownId !== null && (typeof godownId !== "string" || !mongoose.isValidObjectId(godownId))) throw fail(sourceMessage);
  const suppliedIds = payload.foldingEntryIds || payload.selectedThanIds || [];
  if (!Array.isArray(suppliedIds) || suppliedIds.some((value) => !mongoose.isValidObjectId(value))) throw fail("Select valid available Thans.");
  const sourceIds = [...new Set(suppliedIds.map(id).filter(Boolean))];
  if (!sourceIds.length) throw fail("Select at least one available Than");
  const [contract, party, quality, godown] = await Promise.all([
    setSession(WeavingContract.findOne({ _id: payload.contractId, userId, type: "sales", status: "active" }), session),
    setSession(WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: ["customer", "both"] } }), session),
    setSession(WeavingFabricQuality.findOne({ _id: payload.fabricQualityId, userId, isActive: true }), session),
    godownId === null ? null : setSession(WeavingGodown.findOne({ _id: godownId, userId, isActive: true }), session),
  ]);
  if (godownId !== null && !godown) throw fail(sourceMessage);
  if (!contract || !party || !quality) throw fail("Valid Contract, Party and Fabric Quality are required");
  if (id(contract.partyId) !== id(party._id) || id(contract.itemId) !== id(quality._id)) throw fail("Kacchi details do not match the selected Contract", 409);
  const ownershipType = contract.contractType === "conversion" ? "party" : "own";
  const originals = await setSession(WeavingFoldingEntry.find({ _id: { $in: sourceIds }, userId, status: "posted", grade: "a", activeSalesInvoiceId: null, activeKacchiId: { $in: [null, currentKacchiId] } }), session);
  const locations = await thanLocation.resolveCurrentThans(userId, { session, includeDispatched: true });
  const entries = originals.map((entry) => locations.find((row) => id(row) === id(entry))).filter(Boolean);
  if (entries.length !== sourceIds.length) throw fail("One or more selected Thans are unavailable or already dispatched", 409);
  entries.forEach((entry) => {
    if (entry.activeSalesInvoiceId || (entry.dispatched && id(entry.activeKacchiId) !== id(currentKacchiId))) throw fail("Selected Than is no longer available at this location.", 409);
    if (entry.locationState !== "known") throw fail(`Than ${entry.thanNo}: ${entry.locationReason}`, 409);
    if (id(entry.godownId) !== id(godownId)) throw fail(`Than ${entry.thanNo} is currently available at ${entry.godownName}. Select that Source Location.`, 409);
    if (id(entry.fabricQualityId) !== id(quality._id) || entry.ownershipType !== ownershipType || (ownershipType === "party" && id(entry.ownerPartyId) !== id(party._id)) || (entry.contractId && id(entry.contractId) !== id(contract._id))) throw fail(`Than ${entry.thanNo} does not match the selected Party, Contract or Quality`, 409);
  });
  const lines = entries.map((entry) => ({ foldingEntryId: entry._id, thanNo: entry.thanNo, fabricQualityId: quality._id, qualitySnapshot: qualitySnapshot(quality), grade: "a", category: "normal", meter: qty(entry.meter), weightKg: qty(entry.weightKg), weightLbs: qty(entry.weightLbs), thanCount: 1, godownId: godown?._id || null, ownershipType, ownerPartyId: ownershipType === "party" ? party._id : null, contractId: contract._id }));
  const selectedTotals = { meter: qty(lines.reduce((sum, line) => sum + line.meter, 0)), weightKg: qty(lines.reduce((sum, line) => sum + line.weightKg, 0)), thanCount: qty(lines.reduce((sum, line) => sum + line.thanCount, 0)) };
  const available = await getFabricBalances({ userId, fabricQualityId: quality._id, godownId: godown?._id || null, category: "normal", ownershipType, ownerPartyId: ownershipType === "party" ? party._id : null, session, exactSource: true });
  if (currentKacchiId) {
    const currentMovements = await setSession(WeavingFabricMovement.find({ userId, kacchiId: currentKacchiId, movementType: "kacchi_out", isVoided: false, fabricQualityId: quality._id, godownId: godown?._id || null, ownershipType, ownerPartyId: ownershipType === "party" ? party._id : null }).select("meter weightKg thanCount").lean(), session);
    currentMovements.forEach((movement) => { available.meter = qty(available.meter + movement.meter); available.weightKg = qty(available.weightKg + movement.weightKg); available.thanCount = qty(available.thanCount + movement.thanCount); });
  }
  if (selectedTotals.meter > available.meter || selectedTotals.weightKg > available.weightKg || selectedTotals.thanCount > available.thanCount) throw fail("Selected Thans exceed currently available Fabric Stock", 409);
  return { contract, party, quality, godown, ownershipType, entries, lines, totals: {
    totalThan: qty(lines.reduce((sum, line) => sum + line.thanCount, 0)), totalMeter: qty(lines.reduce((sum, line) => sum + line.meter, 0)), totalKg: qty(lines.reduce((sum, line) => sum + line.weightKg, 0)), totalLbs: qty(lines.reduce((sum, line) => sum + line.weightLbs, 0)),
  } };
};

const createKacchi = async (userId, payload) => {
  const requestKey = clean(payload.requestKey);
  if (!requestKey) throw fail("Request key is required");
  const existing = await WeavingKacchiParchi.findOne({ userId, requestKey });
  if (existing) return existing;
  return withFabricLocks(userId, [await kacchiBucket(userId, payload)], () => runAtomic(async (session) => {
    const duplicate = await setSession(WeavingKacchiParchi.findOne({ userId, requestKey }), session);
    if (duplicate) return duplicate;
    if (payload.entryMode === "manual") return saveManualKacchi(userId, payload, session);
    const context = await buildKacchiContext(userId, payload, session);
    const kacchi = await createOne(WeavingKacchiParchi, { userId, requestKey, kacchiNo: await allocateNo(userId, "weaving_kacchi", "KC", 5, session), dispatchDate: clean(payload.dispatchDate), partyId: context.party._id, contractId: context.contract._id, fabricQualityId: context.quality._id, qualitySnapshot: qualitySnapshot(context.quality), godownId: context.godown?._id || null, ownershipType: context.ownershipType, ownerPartyId: context.ownershipType === "party" ? context.party._id : null, lines: context.lines, ...context.totals, notes: clean(payload.notes) }, session);
    for (const entry of context.entries) {
      const claimed = await WeavingFoldingEntry.findOneAndUpdate({ _id: entry._id, userId, status: "posted", grade: "a", activeKacchiId: null, activeSalesInvoiceId: null, ...thanLocation.revisionFilter(entry) }, { $set: { activeKacchiId: kacchi._id, dispatchStatus: "kacchi_out" }, $inc: { stockRevision: 1 } }, { new: true, ...sessionOptions(session) });
      if (!claimed) throw fail(`Than ${entry.thanNo} was dispatched by another request`, 409);
    }
    await WeavingFabricMovement.insertMany(context.lines.map((line) => ({ userId, date: kacchi.dispatchDate, movementType: "kacchi_out", category: line.category, direction: "out", fabricQualityId: line.fabricQualityId, godownId: line.godownId, ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, meter: line.meter, weightKg: line.weightKg, thanCount: line.thanCount, kacchiId: kacchi._id, sourceFoldingEntryId: line.foldingEntryId, notes: `Kacchi ${kacchi.kacchiNo} / ${line.thanNo}` })), sessionOptions(session));
    return kacchi;
  }, true));
};

const updateKacchi = async (userId, kacchiId, payload) => {
  const current = await WeavingKacchiParchi.findOne({ _id: kacchiId, userId });
  return withFabricLocks(userId, [await kacchiBucket(userId, payload), ...(current ? [current] : [])], () => runAtomic(async (session) => {
  const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: kacchiId, userId, status: "confirmed", pakkiId: null }), session);
  if (!kacchi) throw fail("Only an unfinalized Kacchi can be edited", 409);
  if ((payload.entryMode || "than") !== (kacchi.entryMode || "than")) throw fail("Keep the existing entry mode when editing. Void and create a new dispatch to change modes.");
  if (kacchi.entryMode === "manual") return saveManualKacchi(userId, payload, session, kacchi);
  const context = await buildKacchiContext(userId, payload, session, kacchi._id);
  const oldIds = new Set(kacchi.lines.map((line) => id(line.foldingEntryId)));
  const newIds = new Set(context.lines.map((line) => id(line.foldingEntryId)));
  const removed = kacchi.lines.filter((line) => !newIds.has(id(line.foldingEntryId)));
  const added = context.lines.filter((line) => !oldIds.has(id(line.foldingEntryId)));
  for (const line of added) {
    const entry = context.entries.find((row) => id(row) === id(line.foldingEntryId));
    const claimed = await WeavingFoldingEntry.findOneAndUpdate({ _id: line.foldingEntryId, userId, status: "posted", activeKacchiId: null, activeSalesInvoiceId: null, ...thanLocation.revisionFilter(entry) }, { $set: { activeKacchiId: kacchi._id, dispatchStatus: "kacchi_out" }, $inc: { stockRevision: 1 } }, { new: true, ...sessionOptions(session) });
    if (!claimed) throw fail(`Than ${line.thanNo} is no longer available`, 409);
  }
  if (removed.length) {
    const removedIds = removed.map((line) => line.foldingEntryId);
    await WeavingFabricMovement.updateMany({ userId, kacchiId: kacchi._id, sourceFoldingEntryId: { $in: removedIds }, movementType: "kacchi_out", isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
    await WeavingFoldingEntry.updateMany({ userId, _id: { $in: removedIds }, activeKacchiId: kacchi._id }, { $set: { activeKacchiId: null, dispatchStatus: "available" } }, sessionOptions(session));
  }
  if (added.length) await WeavingFabricMovement.insertMany(added.map((line) => ({ userId, date: clean(payload.dispatchDate), movementType: "kacchi_out", category: line.category, direction: "out", fabricQualityId: line.fabricQualityId, godownId: line.godownId, ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, meter: line.meter, weightKg: line.weightKg, thanCount: line.thanCount, kacchiId: kacchi._id, sourceFoldingEntryId: line.foldingEntryId, notes: `Kacchi ${kacchi.kacchiNo} / ${line.thanNo}` })), sessionOptions(session));
  Object.assign(kacchi, { dispatchDate: clean(payload.dispatchDate), partyId: context.party._id, contractId: context.contract._id, fabricQualityId: context.quality._id, qualitySnapshot: qualitySnapshot(context.quality), godownId: context.godown?._id || null, ownershipType: context.ownershipType, ownerPartyId: context.ownershipType === "party" ? context.party._id : null, lines: context.lines, ...context.totals, notes: clean(payload.notes) });
  await kacchi.save(sessionOptions(session));
  return kacchi;
}, true));
};

const voidKacchi = async (userId, kacchiId, actorId, reason) => runAtomic(async (session) => {
  const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: kacchiId, userId, status: "confirmed", pakkiId: null }), session);
  if (!kacchi) throw fail("Only an unfinalized Kacchi can be voided", 409);
  await WeavingFabricMovement.updateMany({ userId, kacchiId: kacchi._id, movementType: "kacchi_out", isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
  await WeavingFoldingEntry.updateMany({ userId, activeKacchiId: kacchi._id }, { $set: { activeKacchiId: null, dispatchStatus: "available" } }, sessionOptions(session));
  kacchi.status = "void"; kacchi.voidedAt = new Date(); kacchi.voidedBy = actorId; kacchi.voidReason = clean(reason);
  await kacchi.save(sessionOptions(session));
  return kacchi;
}, true);

const createPakkiInSession = async (userId, payload, session) => {
  const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: payload.kacchiId, userId, status: "confirmed", pakkiId: null }), session);
  if (!kacchi) {
    const existing = await setSession(WeavingPakkiSettlement.findOne({ userId, kacchiId: payload.kacchiId }), session);
    if (existing) return existing;
    throw fail("Confirmed Kacchi not found or already finalized", 409);
  }
  const contract = await setSession(WeavingContract.findOne({ _id: kacchi.contractId, userId }), session);
  if (!contract) throw fail("Kacchi Contract is unavailable");
  const settlement = calculateSettlement({ ...payload, grossMeter: kacchi.totalMeter });
  const rate = round(contract.rate); if (rate <= 0) throw fail("Contract Rate must be greater than zero");
  const amountDeduction = round(payload.amountDeduction); const subtotal = round(settlement.billableMeter * rate);
  if (amountDeduction < 0 || amountDeduction > subtotal) throw fail("Invalid Amount Deduction");
  const creditDays = Math.max(0, Math.trunc(Number(payload.creditDays ?? contract.creditDays) || 0)); const pakkiDate = clean(payload.pakkiDate);
  const pakki = await createOne(WeavingPakkiSettlement, { userId, pakkiNo: await allocateNo(userId, "weaving_pakki", "PK", 5, session), pakkiDate, dispatchDate: kacchi.dispatchDate, kacchiId: kacchi._id, sourceKacchiId: kacchi._id, kacchiReference: kacchi.kacchiNo, partyId: kacchi.partyId, contractId: kacchi.contractId, fabricQualityId: kacchi.fabricQualityId, godownId: kacchi.godownId, contractType: contract.contractType, ownershipType: kacchi.ownershipType, qualitySnapshot: kacchi.qualitySnapshot, ...settlement, grossKg: kacchi.totalKg, thanCount: kacchi.totalThan, rate, amountDeduction, subtotal, settlementAmount: round(subtotal - amountDeduction), creditDays, dueDate: clean(payload.dueDate) || dueDateFromCreditDays(pakkiDate, creditDays), commercialRemarks: clean(payload.commercialRemarks) }, session);
  if (settlement.rejectionMeter > 0) await createOne(WeavingRejectionDue, { userId, pakkiId: pakki._id, partyId: kacchi.partyId, contractId: kacchi.contractId, fabricQualityId: kacchi.fabricQualityId, qualitySnapshot: kacchi.qualitySnapshot, ownershipType: kacchi.ownershipType, ownerPartyId: kacchi.ownerPartyId, godownId: kacchi.godownId, pakkiDate, originalRejectionMeter: settlement.rejectionMeter, pendingMeter: settlement.rejectionMeter, notes: clean(payload.commercialRemarks) }, session);
  kacchi.pakkiId = pakki._id; kacchi.status = "pakki_finalized"; await kacchi.save(sessionOptions(session));
  return pakki;
};
const createPakki = (userId, payload) => runAtomic((session) => createPakkiInSession(userId, payload, session), true);

const voidPakki = async (userId, pakkiId, actorId, reason) => runAtomic(async (session) => {
  const voidReason = clean(reason);
  if (!voidReason) throw fail("Void reason is required");
  const pakki = await setSession(WeavingPakkiSettlement.findOne({ _id: pakkiId, userId, status: "finalized", invoiceId: null }), session);
  if (!pakki) throw fail("Only an uninvoiced finalized Pakki can be voided", 409);
  const linkedInvoice = await setSession(WeavingSalesInvoice.findOne({ userId, $or: [{ pakkiId: pakki._id }, { sourcePakkiId: pakki._id }] }).select("_id status"), session);
  if (linkedInvoice) throw fail("Correct or reverse the linked Sales Invoice before voiding Pakki", 409);
  const rejectionDue = await setSession(WeavingRejectionDue.findOne({ userId, pakkiId: pakki._id }), session);
  const activeReceipt = await setSession(WeavingRejectionReceipt.findOne({ userId, pakkiId: pakki._id, status: "posted" }).select("_id"), session);
  if (activeReceipt || rejectionDue?.receivedMeter > 0) throw fail("Rejection receipts exist; reverse received Rejection stock before voiding Pakki", 409);
  const sourceKacchiId = pakki.sourceKacchiId || pakki.kacchiId;
  const kacchi = sourceKacchiId ? await setSession(WeavingKacchiParchi.findOne({ _id: sourceKacchiId, userId, pakkiId: pakki._id }), session) : null;
  if (!kacchi) throw fail("Source Kacchi linkage is unavailable", 409);
  if (rejectionDue) { rejectionDue.status = "closed"; rejectionDue.closeReason = `Pakki void: ${voidReason}`; await rejectionDue.save(sessionOptions(session)); }
  if (kacchi) { kacchi.status = "confirmed"; kacchi.pakkiId = null; await kacchi.save(sessionOptions(session)); }
  pakki.sourceKacchiId = sourceKacchiId; pakki.kacchiId = null; pakki.status = "void"; pakki.invoiceId = null; pakki.voidedAt = new Date(); pakki.voidedBy = actorId; pakki.voidReason = voidReason; await pakki.save(sessionOptions(session));
  return pakki;
});

const draftFromPakki = async (userId, pakkiId, session = null) => {
  const pakki = await setSession(WeavingPakkiSettlement.findOne({ _id: pakkiId, userId, status: "finalized" }), session);
  if (!pakki) throw fail("Finalized Pakki not found", 404);
  const existing = await setSession(WeavingSalesInvoice.findOne({ userId, activeForPakki: true, status: { $ne: "void" }, $or: [{ sourcePakkiId: pakki._id }, { pakkiId: pakki._id }] }), session);
  if (existing) return existing;
  const historical = await setSession(WeavingSalesInvoice.findOne({ userId, $or: [{ sourcePakkiId: pakki._id }, { pakkiId: pakki._id }] }).sort({ createdAt: -1 }), session);
  const [party, contract] = await Promise.all([setSession(WeavingParty.findOne({ _id: pakki.partyId, userId, isActive: true, isHidden: false }), session), setSession(WeavingContract.findOne({ _id: pakki.contractId, userId }), session)]);
  if (!party || !contract) throw fail("Pakki Party or Contract is unavailable");
  const totals = calculateInvoiceTotals({ quantity: pakki.billableMeter, rate: pakki.rate, discountAmount: pakki.amountDeduction });
  const invoice = await createOne(WeavingSalesInvoice, { userId, invoiceNo: await allocateNo(userId, "weaving_sales_invoice", "WS", 5, session), invoiceDate: pakki.pakkiDate, partyId: party._id, partyName: party.name, saleSource: "pakki", saleNature: pakki.contractType === "conversion" ? "conversion" : "fabric", pakkiId: historical ? null : pakki._id, sourcePakkiId: pakki._id, replacesInvoiceId: historical?._id || null, activeForPakki: true, contractId: contract._id, fabricQualityId: pakki.fabricQualityId, godownId: pakki.godownId, ownershipType: pakki.ownershipType, description: pakki.contractType === "conversion" ? "Conversion / Job Work" : pakki.qualitySnapshot?.name || "Fabric Sale", qualitySnapshot: pakki.qualitySnapshot, quantity: pakki.billableMeter, weightKg: pakki.grossKg, thanCount: pakki.thanCount, uom: "Meter", originalRate: pakki.rate, finalRate: pakki.rate, ...totals, creditDays: pakki.creditDays, dueDate: pakki.dueDate, balanceDue: totals.grandTotal, notes: pakki.commercialRemarks }, session);
  pakki.invoiceId = invoice._id; await pakki.save(sessionOptions(session)); return invoice;
};

const chequeDetails = (method, payload) => {
  if (method !== "cheque") return {};
  if (!clean(payload.chequeNo) || !clean(payload.chequeBank) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.chequeDate || "") || !/^\d{4}-\d{2}-\d{2}$/.test(payload.chequeDueDate || "")) throw fail("Enter Cheque No., Bank, Cheque Date and Due Date.");
  return { chequeNo: clean(payload.chequeNo), chequeBank: clean(payload.chequeBank), chequeDate: payload.chequeDate, chequeDueDate: payload.chequeDueDate, chequeStatus: "pending" };
};

const paymentAmounts = (total, received) => {
  const paidAmount = round(Math.min(total, received));
  return { paidAmount, balanceDue: round(Math.max(0, total - paidAmount)), paymentStatus: paidAmount <= 0 ? "unpaid" : paidAmount >= total ? "paid" : "partial" };
};
const normalizeSaleTerms = (payload, grandTotal) => {
  // Explicit received amount is authoritative. Terms remain only for legacy callers.
  const raw = payload.receivedNow !== undefined ? payload.receivedNow : payload.saleTerms === "paid" ? grandTotal : 0;
  const receivedNowRequested = round(raw);
  if (!Number.isFinite(Number(raw || 0)) || Number(raw || 0) < 0) throw fail("Enter a valid non-negative Received Amount.");
  if (receivedNowRequested > 0 && !payload.paymentAccountId) throw fail("Payment Account is required");
  if (receivedNowRequested > 0 && !["cash", "bank", "online", "cheque"].includes(payload.paymentMethod)) throw fail("Select a Payment Method.");
  return { saleTerms: receivedNowRequested <= 0 ? "credit" : receivedNowRequested >= grandTotal ? "paid" : "partial", receivedNowRequested };
};

// Run outside the sale transaction; retain Pakki protection before removing the
// legacy index that incorrectly treats every Direct Sale as the same null Pakki.
let salesInvoiceIndexReady;
const ensureSalesInvoiceIndex = () => {
  if (!salesInvoiceIndexReady) salesInvoiceIndexReady = (async () => {
    const collection = WeavingSalesInvoice.collection;
    await collection.createIndex({ userId: 1, sourcePakkiId: 1, activeForPakki: 1 }, { unique: true, partialFilterExpression: { sourcePakkiId: { $type: "objectId" }, activeForPakki: true } });
    const indexes = await collection.indexes();
    const obsolete = indexes.find((index) => index.name === "userId_1_pakkiId_1" && index.unique && JSON.stringify(index.key) === JSON.stringify({ userId: 1, pakkiId: 1 }));
    if (obsolete) {
      try { await collection.dropIndex(obsolete.name); } catch (error) { if (error.code !== 27) throw error; }
    }
  })().catch((error) => { salesInvoiceIndexReady = null; throw error; });
  return salesInvoiceIndexReady;
};
// Replace only the old one-movement-per-invoice index, after its stricter
// per-source replacement exists. No documents or unrelated indexes are changed.
let salesSourceIndexReady;
const ensureSalesSourceIndex = () => {
  if (!salesSourceIndexReady) salesSourceIndexReady = (async () => {
    const collection = WeavingFabricMovement.collection;
    await collection.createIndex({ userId: 1, salesInvoiceId: 1, sourceFoldingEntryId: 1, movementType: 1, editRevision: 1 }, { name: "sales_invoice_source_revision_unique", unique: true, partialFilterExpression: { salesInvoiceId: { $type: "objectId" } } });
    const indexes = await collection.indexes();
    for (const index of indexes) {
      if (index.name === "sales_invoice_source_unique" && index.unique && JSON.stringify(index.key) === JSON.stringify({ userId: 1, salesInvoiceId: 1, sourceFoldingEntryId: 1, movementType: 1 })) {
        try { await collection.dropIndex(index.name); } catch (error) { if (error.code !== 27) throw error; }
      }
      if (index.unique && JSON.stringify(index.key) === JSON.stringify({ userId: 1, salesInvoiceId: 1 }) && index.partialFilterExpression?.salesInvoiceId?.$type === "objectId" && index.partialFilterExpression?.movementType === "sale_out") {
        try { await collection.dropIndex(index.name); } catch (error) { if (error.code !== 27) throw error; }
      }
    }
  })().catch((error) => { salesSourceIndexReady = null; throw error; });
  return salesSourceIndexReady;
};
const normalizeOtherLines = (rows) => {
  if (!Array.isArray(rows) || !rows.length) return [];
  return rows.map((row) => {
    const description = clean(row.description); const quantity = qty(row.quantity); const rate = round(row.rate);
    if (!description || quantity <= 0 || rate <= 0 || !["Meter", "KG", "Piece", "Nos", "Job", "Other"].includes(row.uom)) throw fail("Enter Description, UOM, Quantity and Rate for each sale row.");
    return { description, uom: row.uom, quantity, rate, amount: round(quantity * rate) };
  });
};
const exactSaleThans = async (userId, payload, session) => {
  const ids = payload.foldingEntryIds;
  if (!Array.isArray(ids) || !ids.length || ids.some((value) => !mongoose.isValidObjectId(value)) || new Set(ids.map(id)).size !== ids.length) throw fail("Select valid available Thans.");
  const rows = (await thanLocation.resolveCurrentThans(userId, { session })).filter((row) => ids.map(id).includes(id(row)));
  const bucket = { fabricQualityId: payload.fabricQualityId, godownId: payload.godownId, category: payload.fabricCategory || "normal", ownershipType: "own", ownerPartyId: null };
  if (rows.length !== ids.length || rows.some((row) => row.locationState !== "known" || !thanLocation.matchesBucket(row, bucket))) throw fail("Selected Than is no longer available at this location.", 409);
  const totals = rows.reduce((sum, row) => ({ meter: qty(sum.meter + row.meter), weightKg: qty(sum.weightKg + row.weightKg), thanCount: sum.thanCount + 1 }), { meter: 0, weightKg: 0, thanCount: 0 });
  const available = await getFabricBalances({ userId, ...bucket, session, exactSource: true });
  if (Object.keys(totals).some((field) => totals[field] > available[field] + 0.000001)) throw fail("Selected Thans exceed available Fabric Stock.", 409);
  return { rows, totals };
};

const createDirectDraft = async (userId, payload, actorId, session = null) => {
  if (!mongoose.isValidObjectId(payload.partyId)) throw fail("Select a Customer / Party.");
  const party = await setSession(WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, serviceTypes: { $ne: "sizing" }, role: { $in: ["customer", "both"] } }), session);
  if (!party) throw fail("Customer / Party is required");
  const saleNature = ["fabric", "yarn", "other"].includes(payload.saleNature) ? payload.saleNature : "fabric";
  const otherSubtype = saleNature === "other" && ["rejected", "cut_piece", "waste", "other"].includes(payload.otherSubtype) ? payload.otherSubtype : "";
  const accountingOnly = saleNature === "other" && payload.accountingOnly === true;
  const lines = accountingOnly ? normalizeOtherLines(payload.lines) : [];
  const entryMode = saleNature === "fabric" ? (payload.entryMode === "than" ? "than" : "manual") : "legacy";
  let quantity = qty(payload.quantity || (accountingOnly || otherSubtype === "other" ? 1 : 0));
  let finalRate = round(payload.finalRate || (accountingOnly || otherSubtype === "other" ? payload.amount : 0));
  if (lines.length) { quantity = 1; finalRate = round(lines.reduce((sum, row) => sum + row.amount, 0)); }
  if (entryMode === "than") { const exact = await exactSaleThans(userId, payload, session); quantity = exact.totals.meter; payload = { ...payload, weightKg: exact.totals.weightKg, thanCount: exact.totals.thanCount }; }
  if (quantity <= 0 || finalRate <= 0) throw fail("Valid quantity and rate are required");
  let quality = null; let yarn = null; let godown = null; let description = clean(payload.description); let uom = clean(payload.uom);
  const stockBackedFabric = saleNature === "fabric" || (saleNature === "other" && !accountingOnly && otherSubtype !== "other");
  if (saleNature === "yarn") { yarn = await setSession(WeavingYarn.findOne({ _id: payload.yarnId, userId, isActive: true }), session); if (!yarn) throw fail("Yarn is required"); description ||= [yarn.name, yarn.count, yarn.millBrand].filter(Boolean).join(" / "); uom = "KG"; }
  else if (stockBackedFabric) { quality = await setSession(WeavingFabricQuality.findOne({ _id: payload.fabricQualityId, userId, isActive: true }), session); if (!quality) throw fail("Fabric Quality is required"); description ||= quality.name; uom = "Meter"; }
  else { if (!description) throw fail("Description is required for General / Other Sale"); uom = ["Meter", "KG", "Piece", "Nos", "Job", "Other"].includes(uom) ? uom : "Job"; }
  if (saleNature === "yarn" || stockBackedFabric) { godown = await validateSource(userId, payload.godownId, session); if (saleNature === "yarn" && !godown) throw fail("Select a Yarn Godown."); }
  const originalRate = round(payload.originalRate ?? finalRate); if (originalRate !== finalRate && !clean(payload.rateOverrideReason)) throw fail("Rate override reason is required");
  const totals = calculateInvoiceTotals({ quantity, rate: finalRate, discountAmount: payload.discountAmount, taxAmount: payload.taxAmount });
  const creditDays = Math.max(0, Math.trunc(Number(payload.creditDays) || 0)); const invoiceDate = clean(payload.invoiceDate); const terms = normalizeSaleTerms(payload, totals.grandTotal);
  return createOne(WeavingSalesInvoice, { userId, requestKey: clean(payload.requestKey) || null, accountingOnly, lines, entryMode, foldingEntryIds: entryMode === "than" ? payload.foldingEntryIds : [], invoiceNo: await allocateNo(userId, "weaving_sales_invoice", "WS", 5, session), invoiceDate, partyId: party._id, partyName: party.name, saleSource: "direct", saleNature, fabricCategory: payload.fabricCategory === "b" ? "b" : "normal", otherSubtype, fabricQualityId: quality?._id || null, yarnId: yarn?._id || null, godownId: godown?._id || null, ownershipType: "own", description, qualitySnapshot: quality ? qualitySnapshot(quality) : { name: yarn?.name, count: yarn?.count, brand: yarn?.millBrand }, quantity, weightKg: qty(payload.weightKg), thanCount: qty(payload.thanCount), pieceCount: qty(payload.pieceCount), uom, originalRate, finalRate, rateOverrideReason: clean(payload.rateOverrideReason), rateChangedBy: originalRate !== finalRate ? actorId : null, rateChangedAt: originalRate !== finalRate ? new Date() : null, ...totals, ...terms, paymentAccountId: terms.receivedNowRequested > 0 ? payload.paymentAccountId : null, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || "cash") : "", receiptRequestKey: terms.receivedNowRequested > 0 ? clean(payload.receiptRequestKey) || `sale:${Date.now()}:${Math.random()}` : "", creditDays, dueDate: clean(payload.dueDate) || dueDateFromCreditDays(invoiceDate, creditDays), balanceDue: totals.grandTotal, notes: clean(payload.notes) }, session);
};

const stockCategory = (invoice) => invoice.accountingOnly ? null : invoice.saleNature === "fabric" ? (invoice.fabricCategory || "normal") : invoice.otherSubtype === "other" ? null : invoice.otherSubtype;

const postInvoiceInSession = async (userId, invoiceId, actorId, session, touchedAccountIds, payment = {}) => {
      const locked = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: { $in: ["draft", "posting"] } }), session);
      if (!locked) {
        const existing = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId }), session);
        if (existing?.status === "posted") return existing;
        throw fail("Only a Draft Invoice can be posted", 409);
      }
      locked.status = "posting";
      await locked.save(sessionOptions(session));
      const stockBacked = locked.saleSource === "direct" && (locked.saleNature === "yarn" || stockCategory(locked));
      if (stockBacked) {
        if (locked.saleNature === "yarn") {
          let movement = await setSession(WeavingYarnMovement.findOne({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }), session);
          if (!movement) { const balance = await yarnStock.getGodownBalance({ userId, yarnId: locked.yarnId, godownId: locked.godownId, ownershipType: "own", session }); if (locked.quantity > balance.kg) throw fail(`Only ${balance.kg} KG Own Yarn is available`, 409); movement = await WeavingYarnMovement.findOneAndUpdate({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }, { $setOnInsert: { userId, yarnId: locked.yarnId, date: locked.invoiceDate, movementType: "sale_out", ownershipType: "own", salesInvoiceId: locked._id, quantityKg: locked.quantity, sourceGodownId: locked.godownId, rate: locked.finalRate, notes: locked.invoiceNo } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) }); }
          locked.stockMovementId = movement._id; locked.stockMovementModel = "WeavingYarnMovement";
        } else if (locked.entryMode === "than") {
          const exact = await exactSaleThans(userId, locked, session);
          if (qty(exact.totals.meter) !== qty(locked.quantity)) throw fail("Selected Than quantities changed. Refresh and retry.", 409);
          for (const row of exact.rows) {
            const claimed = await WeavingFoldingEntry.updateOne({ _id: row._id, userId, status: "posted", activeKacchiId: null, activeSalesInvoiceId: null, ...thanLocation.revisionFilter(row) }, { $set: { activeSalesInvoiceId: locked._id }, $inc: { stockRevision: 1 } }, sessionOptions(session));
            if (claimed.modifiedCount !== 1) throw fail("Selected Than is no longer available at this location.", 409);
            const movement = await createOne(WeavingFabricMovement, { userId, date: locked.invoiceDate, movementType: "sale_out", category: stockCategory(locked), direction: "out", fabricQualityId: locked.fabricQualityId, godownId: locked.godownId, ownershipType: "own", meter: row.meter, weightKg: row.weightKg, thanCount: 1, sourceFoldingEntryId: row._id, salesInvoiceId: locked._id, notes: locked.invoiceNo }, session);
            locked.stockMovementId ||= movement._id;
          }
          locked.stockMovementModel = "WeavingFabricMovement";
        } else {
          let movement = await setSession(WeavingFabricMovement.findOne({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }), session);
          if (!movement) {
            const bucket = { fabricQualityId: locked.fabricQualityId, godownId: locked.godownId, category: stockCategory(locked), ownershipType: "own", ownerPartyId: null };
            const available = await assertManualStock(userId, bucket, { meter: locked.quantity, weightKg: locked.weightKg, thanCount: locked.thanCount, pieceCount: locked.pieceCount }, session);
            if (locked.quantity > available.meter || locked.weightKg > available.weightKg || locked.thanCount > available.thanCount || locked.pieceCount > available.pieceCount) throw fail("Sale quantity exceeds available Fabric Stock", 409);
            const ratio = available.meter > 0 ? locked.quantity / available.meter : 0; const weightKg = locked.weightKg || qty(available.weightKg * ratio); const thanCount = locked.thanCount || qty(available.thanCount * ratio);
            movement = await WeavingFabricMovement.findOneAndUpdate({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }, { $setOnInsert: { userId, date: locked.invoiceDate, movementType: "sale_out", stockIdentity: "untracked", category: stockCategory(locked), direction: "out", fabricQualityId: locked.fabricQualityId, godownId: locked.godownId, ownershipType: "own", meter: locked.quantity, weightKg, thanCount, pieceCount: locked.pieceCount, salesInvoiceId: locked._id, notes: locked.invoiceNo } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) });
            locked.weightKg = weightKg; locked.thanCount = thanCount;
          }
          locked.stockMovementId = movement._id; locked.stockMovementModel = "WeavingFabricMovement";
        }
      }
    const party = await setSession(WeavingParty.findOne({ _id: locked.partyId, userId }), session); const partyAccount = await commercial.ensurePartyAccount(userId, party, session);
    const incomeCode = locked.saleNature === "conversion" ? "WEAVING_CONVERSION_INCOME" : locked.saleNature === "fabric" ? "WEAVING_FABRIC_SALES" : locked.saleNature === "yarn" ? "WEAVING_YARN_SALES" : "WEAVING_OTHER_SALES";
    const [income, deductions, outputTax] = await Promise.all([commercial.ensureAccount(userId, incomeCode, session), locked.discountAmount > 0 ? commercial.ensureAccount(userId, "WEAVING_SALES_DEDUCTIONS", session) : null, locked.taxAmount > 0 ? commercial.ensureAccount(userId, "WEAVING_OUTPUT_TAX", session) : null]);
    let journal = await setSession(JournalEntry.findOne({ createdBy: userId, moduleScope: "weaving", invoiceId: locked._id, originModule: "weaving.sales", isDeleted: false }), session);
    if (!journal) journal = await createOne(JournalEntry, { date: new Date(`${locked.invoiceDate}T00:00:00.000Z`), description: `${locked.invoiceNo} - ${party.name}`, createdBy: userId, sourceType: "sale_invoice", originModule: "weaving.sales", moduleScope: "weaving", referenceId: locked._id, invoiceId: locked._id, invoiceModel: "WeavingSalesInvoice", billNo: locked.invoiceNo, lines: [{ account: partyAccount._id, type: "debit", amount: locked.grandTotal }, { account: income._id, type: "credit", amount: locked.subtotal }, ...(deductions ? [{ account: deductions._id, type: "debit", amount: locked.discountAmount }] : []), ...(outputTax ? [{ account: outputTax._id, type: "credit", amount: locked.taxAmount }] : [])] }, session);
    touchedAccountIds.push(...journal.lines.map((line) => line.account));
    locked.journalEntryId = journal._id;
    if (locked.receivedNowRequested > 0) {
      const paymentAccount = await setSession(Account.findOne({ _id: locked.paymentAccountId, userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } }), session);
      if (!paymentAccount) throw fail("Valid payment account is required");
      let receipt = await setSession(WeavingMoneyTransaction.findOne({ userId, requestKey: locked.receiptRequestKey }), session);
      if (!receipt) {
        const receiptJournal = await createOne(JournalEntry, { date: new Date(`${locked.invoiceDate}T00:00:00.000Z`), description: `Received against ${locked.invoiceNo}`, createdBy: userId, sourceType: "receive_payment", originModule: "weaving.receive_payment", moduleScope: "weaving", referenceId: locked._id, lines: [{ account: paymentAccount._id, type: "debit", amount: locked.receivedNowRequested }, { account: partyAccount._id, type: "credit", amount: locked.receivedNowRequested }] }, session);
        receipt = await createOne(WeavingMoneyTransaction, { userId, requestKey: locked.receiptRequestKey, transactionNo: await allocateNo(userId, "weaving_receive_payment", "RCV", 5, session), type: "receive", date: locked.invoiceDate, partyId: locked.partyId, salesInvoiceId: locked._id, amount: locked.receivedNowRequested, paymentAccountId: paymentAccount._id, paymentMethod: locked.paymentMethod || paymentAccount.category, ...chequeDetails(locked.paymentMethod || paymentAccount.category, payment), description: `Received against ${locked.invoiceNo}`, journalEntryId: receiptJournal._id }, session);
        touchedAccountIds.push(...receiptJournal.lines.map((line) => line.account));
      }
      if (id(receipt.salesInvoiceId) !== id(locked._id) || receipt.status !== "posted" || round(receipt.amount) !== locked.receivedNowRequested) throw fail("Payment reference is already used by another receipt.", 409);
      Object.assign(locked, paymentAmounts(locked.grandTotal, receipt.amount));
    }
    locked.status = "posted"; locked.postedAt = new Date(); locked.postedBy = actorId; await locked.save(sessionOptions(session));
    await recalculateAccountBalances([...new Set(touchedAccountIds.map(String))], session);
    return locked;

};

const postInvoice = async (userId, invoiceId, actorId) => {
  const seed = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId });
  if (!seed) throw fail("Invoice not found", 404);
  if (seed.status === "posted") return seed;
  if (seed.entryMode === "than") await ensureSalesSourceIndex();
  if (!["draft", "posting"].includes(seed.status)) throw fail("Only a Draft Invoice can be posted", 409);
  const stockBacked = seed.saleSource === "direct" && (seed.saleNature === "yarn" || stockCategory(seed));
  const lockKey = seed.saleNature === "yarn"
    ? ["yarn", seed.yarnId, seed.godownId, "own", "own"].join(":")
    : fabricLockKey({ ...seed.toObject(), category: stockCategory(seed) });
  const execute = async () => {
    const touchedAccountIds = [];
    const invoice = await runAtomic(async (session) => {
      return postInvoiceInSession(userId, invoiceId, actorId, session, touchedAccountIds);
    }, true);
    return WeavingSalesInvoice.findById(invoice._id);
  };
  const posted = await (stockBacked ? withStockLock(userId, lockKey, execute) : execute());
  return posted;
};

const createDirectInvoice = async (userId, payload, actorId) => {
  const requestKey = clean(payload.requestKey);
  if (!requestKey) throw fail("Please reopen the sale form and retry.");
  await ensureSalesInvoiceIndex();
  const existing = await WeavingSalesInvoice.findOne({ userId, requestKey });
  if (existing?.status === "posted") return existing;
  if (payload.entryMode === "than") await ensureSalesSourceIndex();
  const touched = [];
  const execute = () => runAtomic(async (session) => {
    touched.length = 0;
    const duplicate = await setSession(WeavingSalesInvoice.findOne({ userId, requestKey }), session);
    if (duplicate?.status === "posted") return duplicate;
    const invoice = duplicate || await createDirectDraft(userId, payload, actorId, session);
    return postInvoiceInSession(userId, invoice._id, actorId, session, touched, payload);
  }, true);
  const stockBacked = payload.saleNature !== "other" || !payload.accountingOnly;
  const lockKey = payload.saleNature === "yarn" ? ["yarn", payload.yarnId, payload.godownId, "own", "own"].join(":") : fabricLockKey({ ...payload, category: payload.saleNature === "other" ? payload.otherSubtype : payload.fabricCategory });
  const invoice = await (stockBacked ? withStockLock(userId, lockKey, execute) : execute());
  return invoice;
};

const confirmPakkiInvoice = async (userId, payload, actorId) => {
  if (!mongoose.isValidObjectId(payload.kacchiId)) throw fail("Select a pending Kacchi.");
  const touched = [];
  const invoice = await runAtomic(async (session) => {
    touched.length = 0;
    const pakki = await createPakkiInSession(userId, payload, session);
    const draft = await draftFromPakki(userId, pakki._id, session);
    if (draft.status === "posted") return draft;
    const terms = normalizeSaleTerms(payload, draft.grandTotal);
    Object.assign(draft, terms, { paymentAccountId: terms.receivedNowRequested > 0 ? payload.paymentAccountId : null, paymentMethod: terms.receivedNowRequested > 0 ? payload.paymentMethod || "cash" : "", receiptRequestKey: `sale:${draft._id}` });
    await draft.save(sessionOptions(session));
    return postInvoiceInSession(userId, draft._id, actorId, session, touched, payload);
  }, true);
  return invoice;
};

const createInvoiceFromPakki = async (userId, pakkiId, actorId) => {
  const invoice = await draftFromPakki(userId, pakkiId);
  try {
    return await postInvoice(userId, invoice._id, actorId);
  } catch (error) {
    await WeavingSalesInvoice.deleteOne({ _id: invoice._id, userId, status: "draft" });
    await WeavingPakkiSettlement.updateOne({ _id: pakkiId, userId, invoiceId: invoice._id }, { $set: { invoiceId: null } });
    throw error;
  }
};

const receiveRejection = async (userId, dueId, payload) => {
  const values = validateReceiptClassification(payload); const requestKey = clean(payload.requestKey); if (!requestKey) throw fail("Request key is required");
  const existing = await WeavingRejectionReceipt.findOne({ userId, requestKey }); if (existing) return existing;
  try {
    return await runAtomic(async (session) => {
      const duplicate = await setSession(WeavingRejectionReceipt.findOne({ userId, requestKey }), session); if (duplicate) return duplicate;
      const due = await WeavingRejectionDue.findOneAndUpdate({ _id: dueId, userId, status: { $in: ["pending", "partial"] }, pendingMeter: { $gte: values.receivedMeter } }, { $inc: { receivedMeter: values.receivedMeter, pendingMeter: -values.receivedMeter }, $set: { lastReceiptDate: clean(payload.receiptDate) } }, { new: true, ...sessionOptions(session) });
      if (!due) throw fail("Received Now exceeds current Pending Rejection", 409);
      due.status = due.pendingMeter <= 0 ? "received" : "partial"; await due.save(sessionOptions(session));
      const receipt = await createOne(WeavingRejectionReceipt, { userId, receiptNo: await allocateNo(userId, "weaving_rejection_receipt", "RR", 5, session), requestKey, receiptDate: clean(payload.receiptDate), dueId: due._id, pakkiId: due.pakkiId, partyId: due.partyId, fabricQualityId: due.fabricQualityId, godownId: payload.godownId || due.godownId, ownershipType: due.ownershipType, ownerPartyId: due.ownerPartyId, ...values, remainingPendingMeter: due.pendingMeter, notes: clean(payload.notes) }, session);
      const categories = [["normal", "normalMeter", "normalKg", "normalPieces"], ["rejected", "rejectedMeter", "rejectedKg", "rejectedPieces"], ["cut_piece", "cutPieceMeter", "cutPieceKg", "cutPiecePieces"], ["waste", "wasteMeter", "wasteKg", "wastePieces"]].filter(([, meter]) => values[meter] > 0);
      await WeavingFabricMovement.insertMany(categories.map(([category, meter, kg, pieces]) => ({ userId, date: receipt.receiptDate, movementType: "rejection_recovery", category, direction: "in", fabricQualityId: due.fabricQualityId, godownId: receipt.godownId, ownershipType: due.ownershipType, ownerPartyId: due.ownerPartyId, meter: values[meter], weightKg: values[kg], pieceCount: values[pieces], rejectionReceiptId: receipt._id, notes: `Rejection Recovery ${receipt.receiptNo}` })), sessionOptions(session));
      return receipt;
    });
  } catch (error) {
    if (error?.code === 11000) return WeavingRejectionReceipt.findOne({ userId, requestKey });
    throw error;
  }
};

const reverseRejection = async (userId, receiptId, actorId, reason) => runAtomic(async (session) => {
  const receipt = await setSession(WeavingRejectionReceipt.findOne({ _id: receiptId, userId, status: "posted" }), session);
  if (!receipt) throw fail("Posted Rejection Receipt not found", 404);
  const recoveryMovements = await setSession(WeavingFabricMovement.find({ userId, rejectionReceiptId: receipt._id, movementType: "rejection_recovery", isVoided: false }), session);
  const downstream = await setSession(WeavingFabricMovement.findOne({ userId, createdAt: { $gt: receipt.createdAt }, fabricQualityId: receipt.fabricQualityId, godownId: receipt.godownId, ownershipType: receipt.ownershipType, ownerPartyId: receipt.ownerPartyId || null, category: { $in: recoveryMovements.map((movement) => movement.category) }, direction: "out", movementType: { $in: ["sale_out", "kacchi_out", "quality_transfer_out"] }, isVoided: false }), session);
  if (downstream) throw fail("Recovered stock has already been used downstream and cannot be reversed", 409);
  await WeavingFabricMovement.updateMany({ userId, rejectionReceiptId: receipt._id, movementType: "rejection_recovery", isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
  const due = await setSession(WeavingRejectionDue.findOne({ _id: receipt.dueId, userId }), session); if (!due) throw fail("Rejection Due not found", 404);
  due.receivedMeter = qty(Math.max(0, due.receivedMeter - receipt.receivedMeter)); due.pendingMeter = qty(due.pendingMeter + receipt.receivedMeter); due.status = due.receivedMeter > 0 ? "partial" : "pending"; await due.save(sessionOptions(session));
  receipt.status = "reversed"; receipt.reversedAt = new Date(); receipt.reversedBy = actorId; receipt.reversalReason = clean(reason); receipt.remainingPendingMeter = due.pendingMeter; await receipt.save(sessionOptions(session));
  return receipt;
});

const buildManagementMetrics = ({ readyCount = 0, pending = [], invoices = [], receipts = [] }) => {
  const posted = invoices.filter((row) => row.status === "posted");
  const recovered = receipts
    .filter((row) => row.status === "posted")
    .reduce((sum, row) => sum + row.receivedMeter, 0);

  return {
    readyCount,
    pendingRejectionMeter: qty(pending.reduce((sum, row) => sum + row.pendingMeter, 0)),
    salesAmount: round(posted.reduce((sum, row) => sum + row.grandTotal, 0)),
    recoveredRejectionMeter: qty(recovered),
  };
};

const getManagementMetrics = async (userId) => {
  const [readyCount, pending] = await Promise.all([
    WeavingPakkiSettlement.countDocuments({ userId, status: "finalized", invoiceId: null }),
    WeavingRejectionDue.find({ userId, status: { $in: ["pending", "partial"] } })
      .select("pendingMeter")
      .lean(),
  ]);

  return buildManagementMetrics({ readyCount, pending });
};

const getWorkspace = async (userId, query = {}) => {
  const invoiceFilter = { userId }; if (query.from || query.to) invoiceFilter.invoiceDate = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  const [kacchis, pakkis, ready, invoices, pending, receipts, parties, contracts, qualities, yarns, godowns, paymentAccounts, availableThans, invoicePreview, fabricStock, yarnSummary, manualStockRows] = await Promise.all([
    WeavingKacchiParchi.find({ userId }).populate("contractId", "contractNo rate creditDays").populate("partyId", "name").populate("fabricQualityId", "name code").populate("godownId", "name").sort({ dispatchDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingPakkiSettlement.find({ userId }).populate("godownId", "name").populate("invoiceId", "invoiceNo grandTotal paidAmount balanceDue paymentStatus status").populate("contractId", "contractNo").populate("partyId", "name").sort({ pakkiDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingPakkiSettlement.find({ userId, status: "finalized", invoiceId: null }).populate("partyId", "name").sort({ pakkiDate: -1 }).lean(),
    WeavingSalesInvoice.find(invoiceFilter).populate("partyId", "name").sort({ invoiceDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingRejectionDue.find({ userId, status: { $in: ["pending", "partial"] } }).populate("partyId", "name").sort({ pakkiDate: 1 }).lean(),
    WeavingRejectionReceipt.find({ userId }).populate("godownId", "name").populate("partyId", "name").populate("fabricQualityId", "name code").sort({ receiptDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingParty.find({ userId, isActive: true, isHidden: false, role: { $in: ["customer", "both"] } }).select("name role").sort({ name: 1 }).lean(),
    WeavingContract.find({ userId, type: "sales", status: "active" }).select("contractNo contractType partyId itemId rate creditDays").sort({ contractDate: -1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code construction width warpCount weftCount brand").sort({ name: 1 }).lean(),
    WeavingYarn.find({ userId, isActive: true }).select("name count millBrand quality").sort({ name: 1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    Account.find({ userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } }).select("name code category").sort({ name: 1 }).lean(),
    thanLocation.resolveCurrentThans(userId),
    previewNo(userId, "weaving_sales_invoice", "WS"), foldingStock.stockSummary(userId), yarnStock.getSummary(userId), manualStock.getManualStock(userId),
  ]);
  const pendingKacchis = await WeavingKacchiParchi.find({ userId, $or: [{ status: "confirmed" }, { _id: { $in: ready.map((row) => row.kacchiId || row.sourceKacchiId).filter(Boolean) } }] }).populate("partyId", "name").populate("contractId", "contractNo rate creditDays").sort({ dispatchDate: 1 }).lean();
  const safeManualStock = manualStockRows.map((pool) => {
    const aggregate = fabricStock.rows.find((row) => manualStock.key(row) === manualStock.key(pool));
    const tracked = availableThans.filter((row) => row.locationState === "known" && thanLocation.matchesBucket(row, pool));
    return { ...pool, ...Object.fromEntries([["meter", "meter"], ["weightKg", "kg"], ["thanCount", "than"], ["pieceCount", "pieceCount"]].map(([field, aggregateField]) => {
      const reserved = tracked.reduce((sum, row) => sum + (field === "thanCount" ? 1 : Number(row[field] || 0)), 0);
      return [field, Math.max(0, qty(Math.min(pool[field], Number(aggregate?.[aggregateField] || 0) - reserved)))];
    })) };
  });
  return { kacchis, pakkis, ready, invoices, pending, receipts, meta: { parties, contracts, qualities, yarns, godowns, paymentAccounts, pendingKacchis, availableThans: availableThans.filter((row) => row.locationState === "known"), unknownThans: availableThans.filter((row) => row.locationState !== "known"), nextInvoiceNo: invoicePreview, fabricStock: fabricStock.rows.filter((row) => row.ownershipType === "own" && (row.meter > 0 || row.kg > 0)), yarnStock: yarnSummary.stockRows, manualStock: safeManualStock }, metrics: buildManagementMetrics({ readyCount: ready.length, pending, invoices, receipts }) };
};

const reverseJournalInSession = async ({ userId, journalId, date, reason, session }) => {
  if (!journalId) return null;
  const original = await setSession(JournalEntry.findOne({ _id: journalId, createdBy: userId, moduleScope: "weaving", isDeleted: false, isReversed: false }), session);
  if (!original) return null;
  const reversal = await createOne(JournalEntry, { date: new Date(`${date}T00:00:00.000Z`), description: reason, createdBy: userId, sourceType: "reversal", originModule: "weaving.reversal", moduleScope: "weaving", referenceId: original.referenceId, invoiceId: original.invoiceId, invoiceModel: original.invoiceModel, billNo: original.billNo, isReversal: true, reversalOf: original._id, lines: original.lines.map((line) => ({ account: line.account, type: line.type === "debit" ? "credit" : "debit", amount: line.amount })) }, session);
  original.isReversed = true;
  await original.save(sessionOptions(session));
  return reversal;
};

const updatePostedInvoice = async (userId, invoiceId, payload, actorId, outerSession = null) => {
  const seed = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" }), outerSession);
  if (!seed) throw fail("Posted Invoice not found", 404);
  if (payload.editRequestKey && seed.lastEditRequestKey === payload.editRequestKey) return seed;
  if (seed.saleSource === "pakki" && !outerSession) throw fail("Use Edit on the linked Pakki to keep settlement and rejection records consistent.", 409);
  const detailedLines = seed.accountingOnly && Array.isArray(payload.lines) ? normalizeOtherLines(payload.lines) : seed.lines || [];
  if (detailedLines.length) payload = { ...payload, quantity: 1, finalRate: round(detailedLines.reduce((sum, row) => sum + row.amount, 0)) };
  const activeReceipts = await setSession(WeavingMoneyTransaction.find({ userId, salesInvoiceId: seed._id, type: "receive", status: "posted" }), outerSession);
  if (activeReceipts.some((row) => !seed.receiptRequestKey || row.requestKey !== seed.receiptRequestKey)) throw fail("Reverse later receipts linked to this Invoice before editing it", 409);
  const party = await setSession(WeavingParty.findOne({ _id: payload.partyId || seed.partyId, userId, isActive: true, isHidden: false, serviceTypes: { $ne: "sizing" }, role: { $in: ["customer", "both"] } }), outerSession);
  if (!party) throw fail("Customer / Party is required");
  const invoiceDate = clean(payload.invoiceDate) || seed.invoiceDate;
  let quantity = qty(payload.quantity ?? seed.quantity);
  const finalRate = round(payload.finalRate ?? seed.finalRate);
  if (!seed.accountingOnly && finalRate !== seed.originalRate && !clean(payload.rateOverrideReason || seed.rateOverrideReason)) throw fail("Rate override reason is required.");
  if (quantity <= 0 || finalRate <= 0) throw fail("Valid quantity and rate are required");
  const totals = calculateInvoiceTotals({ quantity, rate: finalRate, discountAmount: payload.discountAmount ?? seed.discountAmount, taxAmount: payload.taxAmount ?? seed.taxAmount });
  const terms = normalizeSaleTerms({ receivedNow: seed.receivedNowRequested, paymentAccountId: seed.paymentAccountId, paymentMethod: seed.paymentMethod, ...payload }, totals.grandTotal);
  const paymentAccountId = terms.receivedNowRequested > 0 ? (payload.paymentAccountId || seed.paymentAccountId) : null;
  const paymentAccount = paymentAccountId ? await setSession(Account.findOne({ _id: paymentAccountId, userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } }), outerSession) : null;
  if (terms.receivedNowRequested > 0 && !paymentAccount) throw fail("Valid payment account is required");
  const stockBacked = seed.saleSource === "direct" && (seed.saleNature === "yarn" || stockCategory(seed));
  if (payload.saleNature && payload.saleNature !== seed.saleNature) throw fail("Sale Type cannot be changed after posting", 409);
  const targetGodownId = payload.godownId !== undefined ? payload.godownId : seed.godownId;
  const targetYarnId = payload.yarnId || seed.yarnId;
  const targetQualityId = payload.fabricQualityId || seed.fabricQualityId;
  const targetCategory = seed.saleNature === "fabric" ? (payload.fabricCategory === "b" ? "b" : payload.fabricCategory === "normal" ? "normal" : seed.fabricCategory) : (payload.otherSubtype || seed.otherSubtype);
  const targetGodown = stockBacked ? await WeavingGodown.findOne({ _id: targetGodownId, userId, isActive: true }) : null;
  if (stockBacked && (seed.saleNature === "yarn" || targetGodownId) && !targetGodown) throw fail("Select a valid Source Location.");
  if (seed.saleNature === "yarn" && !await WeavingYarn.exists({ _id: targetYarnId, userId, isActive: true })) throw fail("Yarn is required");
  if (stockBacked && seed.saleNature !== "yarn" && !await WeavingFabricQuality.exists({ _id: targetQualityId, userId, isActive: true })) throw fail("Fabric Quality is required");
  const lockKey = seed.saleNature === "yarn" ? ["yarn", targetYarnId, targetGodownId, "own", "own"].join(":") : fabricLockKey({ fabricQualityId: targetQualityId, godownId: targetGodownId, category: targetCategory });
  const execute = async () => {
    const touched = [];
    const work = async (session) => {
      const invoice = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" }), session);
      if (!invoice) throw fail("Invoice changed before it could be edited", 409);
      if (payload.editRequestKey && invoice.lastEditRequestKey === payload.editRequestKey) return invoice;
      if (payload.expectedUpdatedAt && new Date(payload.expectedUpdatedAt).getTime() !== new Date(invoice.updatedAt).getTime()) throw fail("This sale changed after you opened it. Reopen Edit and retry.", 409);
      const { editHistory, ...before } = invoice.toObject();
      invoice.editHistory.push({ at: new Date(), actorId, invoice: before });
      invoice.lastEditRequestKey = clean(payload.editRequestKey);
      if (invoice.accountingOnly) invoice.lines = detailedLines;
      const receipts = await setSession(WeavingMoneyTransaction.find({ userId, salesInvoiceId: invoice._id, type: "receive", status: "posted" }), session);
      if (receipts.some((row) => !invoice.receiptRequestKey || row.requestKey !== invoice.receiptRequestKey)) throw fail("Reverse later receipts linked to this Invoice before editing it", 409);
      if (stockBacked && invoice.saleNature === "yarn") {
        const movement = await setSession(WeavingYarnMovement.findOne({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: { $ne: true } }), session);
        if (!movement) throw fail("Linked Yarn movement was not found", 409);
        invoice.editHistory[invoice.editHistory.length - 1].movement = movement.toObject();
        const balance = await yarnStock.getGodownBalance({ userId, yarnId: targetYarnId, godownId: targetGodownId, ownershipType: "own", session });
        const reusable = String(movement.yarnId) === String(targetYarnId) && String(movement.sourceGodownId) === String(targetGodownId) ? movement.quantityKg : 0;
        if (quantity > round(balance.kg + reusable)) throw fail(`Only ${round(balance.kg + reusable)} KG Own Yarn is available`, 409);
        Object.assign(movement, { yarnId: targetYarnId, date: invoiceDate, quantityKg: quantity, sourceGodownId: targetGodownId, rate: finalRate });
        await movement.save(sessionOptions(session));
      } else if (stockBacked && invoice.entryMode === "than") {
        const oldMovements = await setSession(WeavingFabricMovement.find({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: false }), session);
        if (!oldMovements.length) throw fail("Linked Than movements are unavailable. Review the sale before editing.", 409);
        for (const movement of oldMovements) {
          const released = await WeavingFoldingEntry.updateOne({ _id: movement.sourceFoldingEntryId, userId, activeSalesInvoiceId: invoice._id, activeKacchiId: null }, { $set: { activeSalesInvoiceId: null }, $inc: { stockRevision: 1 } }, sessionOptions(session));
          if (released.modifiedCount !== 1) throw fail("A sold Than changed. Refresh the sale before editing.", 409);
          movement.isVoided = true; await movement.save(sessionOptions(session));
        }
        const selection = { fabricQualityId: targetQualityId, godownId: targetGodownId, fabricCategory: targetCategory, foldingEntryIds: payload.foldingEntryIds || invoice.foldingEntryIds };
        const exact = await exactSaleThans(userId, selection, session);
        if (quantity !== exact.totals.meter) throw fail("Selected Than totals changed. Refresh and select them again.", 409);
        invoice.stockRevision = Number(invoice.stockRevision || 0) + 1;
        for (const row of exact.rows) {
          const claimed = await WeavingFoldingEntry.updateOne({ _id: row._id, userId, activeKacchiId: null, activeSalesInvoiceId: null, ...thanLocation.revisionFilter(row) }, { $set: { activeSalesInvoiceId: invoice._id }, $inc: { stockRevision: 1 } }, sessionOptions(session));
          if (claimed.modifiedCount !== 1) throw fail("Selected Than is no longer available.", 409);
          const movement = await createOne(WeavingFabricMovement, { userId, date: invoiceDate, movementType: "sale_out", direction: "out", category: targetCategory, fabricQualityId: targetQualityId, godownId: targetGodownId, ownershipType: "own", sourceFoldingEntryId: row._id, salesInvoiceId: invoice._id, meter: row.meter, weightKg: row.weightKg, thanCount: 1, editRevision: invoice.stockRevision, notes: `Edit ${invoice.invoiceNo}` }, session);
          invoice.stockMovementId = movement._id;
        }
        invoice.foldingEntryIds = selection.foldingEntryIds; invoice.weightKg = exact.totals.weightKg; invoice.thanCount = exact.totals.thanCount;
      } else if (stockBacked) {
        const movement = await setSession(WeavingFabricMovement.findOne({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: { $ne: true } }), session);
        if (!movement) throw fail("Linked Fabric movement was not found", 409);
        invoice.editHistory[invoice.editHistory.length - 1].movement = movement.toObject();
        if (invoice.entryMode === "manual") {
          movement.isVoided = true; await movement.save(sessionOptions(session));
          await assertManualStock(userId, { fabricQualityId: targetQualityId, godownId: targetGodownId || null, category: targetCategory, ownershipType: "own", ownerPartyId: null }, { meter: quantity, weightKg: qty(payload.weightKg ?? invoice.weightKg), thanCount: qty(payload.thanCount ?? invoice.thanCount), pieceCount: qty(payload.pieceCount ?? invoice.pieceCount) }, session);
          movement.isVoided = false;
        }
        const available = await getFabricBalances({ userId, fabricQualityId: targetQualityId, godownId: targetGodownId, category: targetCategory, ownershipType: "own", session, exactSource: true });
        const sameStock = String(movement.fabricQualityId) === String(targetQualityId) && String(movement.godownId) === String(targetGodownId) && movement.category === targetCategory;
        const weightKg = qty(payload.weightKg ?? invoice.weightKg); const thanCount = qty(payload.thanCount ?? invoice.thanCount); const pieceCount = qty(payload.pieceCount ?? invoice.pieceCount);
        if (quantity > qty(available.meter + (sameStock ? movement.meter : 0)) || weightKg > qty(available.weightKg + (sameStock ? movement.weightKg : 0)) || thanCount > qty(available.thanCount + (sameStock ? movement.thanCount : 0)) || pieceCount > qty(available.pieceCount + (sameStock ? movement.pieceCount : 0))) throw fail("Sale quantity exceeds available Fabric Stock", 409);
        Object.assign(movement, { date: invoiceDate, category: targetCategory, fabricQualityId: targetQualityId, godownId: targetGodownId, meter: quantity, weightKg, thanCount, pieceCount });
        await movement.save(sessionOptions(session));
        invoice.weightKg = weightKg; invoice.thanCount = thanCount; invoice.pieceCount = pieceCount;
      }
      const oldJournal = await reverseJournalInSession({ userId, journalId: invoice.journalEntryId, date: invoiceDate, reason: `Edit ${invoice.invoiceNo}`, session });
      if (oldJournal) touched.push(...oldJournal.lines.map((line) => line.account));
      for (const receipt of receipts) {
        const reversal = await reverseJournalInSession({ userId, journalId: receipt.journalEntryId, date: invoiceDate, reason: `Edit receipt for ${invoice.invoiceNo}`, session });
        if (reversal) touched.push(...reversal.lines.map((line) => line.account));
        receipt.status = "void"; receipt.voidedAt = new Date(); receipt.voidReason = `Invoice ${invoice.invoiceNo} edited`; receipt.reversalJournalId = reversal?._id || null; await receipt.save(sessionOptions(session));
      }
      const partyAccount = await commercial.ensurePartyAccount(userId, party, session);
      const incomeCode = invoice.saleNature === "conversion" ? "WEAVING_CONVERSION_INCOME" : invoice.saleNature === "fabric" ? "WEAVING_FABRIC_SALES" : invoice.saleNature === "yarn" ? "WEAVING_YARN_SALES" : "WEAVING_OTHER_SALES";
      const [income, deductions, outputTax] = await Promise.all([commercial.ensureAccount(userId, incomeCode, session), totals.discountAmount > 0 ? commercial.ensureAccount(userId, "WEAVING_SALES_DEDUCTIONS", session) : null, totals.taxAmount > 0 ? commercial.ensureAccount(userId, "WEAVING_OUTPUT_TAX", session) : null]);
      const journal = await createOne(JournalEntry, { date: new Date(`${invoiceDate}T00:00:00.000Z`), description: `${invoice.invoiceNo} - ${party.name} (edited)`, createdBy: userId, sourceType: "sale_invoice", originModule: "weaving.sales", moduleScope: "weaving", referenceId: invoice._id, invoiceId: invoice._id, invoiceModel: "WeavingSalesInvoice", billNo: invoice.invoiceNo, lines: [{ account: partyAccount._id, type: "debit", amount: totals.grandTotal }, { account: income._id, type: "credit", amount: totals.subtotal }, ...(deductions ? [{ account: deductions._id, type: "debit", amount: totals.discountAmount }] : []), ...(outputTax ? [{ account: outputTax._id, type: "credit", amount: totals.taxAmount }] : [])] }, session);
      touched.push(...journal.lines.map((line) => line.account));
      let paidAmount = 0; let receiptRequestKey = "";
      if (terms.receivedNowRequested > 0) {
        receiptRequestKey = `sale:${invoice._id}:edit:${Date.now()}`;
        const receiptJournal = await createOne(JournalEntry, { date: new Date(`${invoiceDate}T00:00:00.000Z`), description: `Received against ${invoice.invoiceNo}`, createdBy: userId, sourceType: "receive_payment", originModule: "weaving.receive_payment", moduleScope: "weaving", referenceId: invoice._id, lines: [{ account: paymentAccount._id, type: "debit", amount: terms.receivedNowRequested }, { account: partyAccount._id, type: "credit", amount: terms.receivedNowRequested }] }, session);
        await createOne(WeavingMoneyTransaction, { userId, requestKey: receiptRequestKey, transactionNo: await allocateNo(userId, "weaving_receive_payment", "RCV", 5, session), type: "receive", date: invoiceDate, partyId: party._id, salesInvoiceId: invoice._id, amount: terms.receivedNowRequested, paymentAccountId: paymentAccount._id, paymentMethod: payload.paymentMethod || invoice.paymentMethod || paymentAccount.category, ...chequeDetails(payload.paymentMethod || invoice.paymentMethod || paymentAccount.category, { ...(receipts[0]?.toObject() || {}), ...payload }), description: `Received against ${invoice.invoiceNo}`, journalEntryId: receiptJournal._id }, session);
        touched.push(...receiptJournal.lines.map((line) => line.account)); paidAmount = Math.min(totals.grandTotal, terms.receivedNowRequested);
      }
      const creditDays = Math.max(0, Math.trunc(Number(payload.creditDays ?? invoice.creditDays) || 0));
      Object.assign(invoice, totals, terms, { partyId: party._id, partyName: party.name, invoiceDate, quantity, finalRate, fabricCategory: invoice.saleNature === "fabric" ? targetCategory : invoice.fabricCategory, otherSubtype: invoice.saleNature === "other" ? targetCategory : invoice.otherSubtype, yarnId: targetYarnId || null, fabricQualityId: targetQualityId || null, godownId: targetGodownId || null, description: clean(payload.description) || invoice.description, paymentAccountId, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || invoice.paymentMethod || paymentAccount.category) : "", receiptRequestKey, paidAmount, balanceDue: round(totals.grandTotal - paidAmount), paymentStatus: paidAmount >= totals.grandTotal ? "paid" : paidAmount > 0 ? "partial" : "unpaid", journalEntryId: journal._id, creditDays, dueDate: clean(payload.dueDate) || dueDateFromCreditDays(invoiceDate, creditDays), notes: clean(payload.notes), rateOverrideReason: clean(payload.rateOverrideReason || invoice.rateOverrideReason), rateChangedBy: finalRate !== invoice.originalRate ? actorId : null, rateChangedAt: finalRate !== invoice.originalRate ? new Date() : null });
      invoice.markModified("editHistory");
      await invoice.save(sessionOptions(session));
      await recalculateAccountBalances([...new Set(touched.map(String))], session);
      return invoice;
    };
    return outerSession ? work(outerSession) : runAtomic(work, true);
  };
  if (seed.entryMode === "than") await ensureSalesSourceIndex();
  return stockBacked && !outerSession ? withStockLock(userId, lockKey, execute) : execute();
};

const updatePakki = async (userId, pakkiId, payload, actorId) => runAtomic(async (session) => {
  const pakki = await setSession(WeavingPakkiSettlement.findOne({ _id: pakkiId, userId, status: "finalized" }), session);
  if (!pakki || !pakki.invoiceId) throw fail("Final Pakki Invoice not found.", 404);
  const linked = await setSession(WeavingSalesInvoice.findOne({ _id: pakki.invoiceId, userId, status: "posted" }), session);
  if (!linked) throw fail("The linked invoice is unavailable.", 409);
  if (payload.editRequestKey && linked.lastEditRequestKey === payload.editRequestKey) return linked;
  const values = calculateSettlement({ ...pakki.toObject(), ...payload, grossMeter: pakki.grossMeter });
  const amountDeduction = round(payload.amountDeduction ?? pakki.amountDeduction);
  const subtotal = round(values.billableMeter * pakki.rate);
  if (values.billableMeter <= 0 || amountDeduction < 0 || amountDeduction > subtotal) throw fail("Review Billable Meter and Amount Deduction.");
  let due = await setSession(WeavingRejectionDue.findOne({ userId, pakkiId: pakki._id }), session);
  if (due && values.rejectionMeter < due.receivedMeter) throw fail("Rejection cannot be reduced below the quantity already physically received. Reverse the affected rejection receipt first.", 409);
  const previousPakki = pakki.toObject(); const previousDue = due?.toObject() || null;
  const invoice = await updatePostedInvoice(userId, linked._id, { ...payload, partyId: pakki.partyId, notes: payload.commercialRemarks ?? pakki.commercialRemarks, invoiceDate: payload.pakkiDate || pakki.pakkiDate, quantity: values.billableMeter, finalRate: pakki.rate, discountAmount: amountDeduction, taxAmount: linked.taxAmount, rateOverrideReason: linked.rateOverrideReason }, actorId, session);
  const revision = invoice.editHistory[invoice.editHistory.length - 1];
  revision.pakki = previousPakki; revision.rejectionDue = previousDue;
  invoice.markModified("editHistory"); await invoice.save(sessionOptions(session));
  Object.assign(pakki, values, { pakkiDate: invoice.invoiceDate, amountDeduction, subtotal, settlementAmount: invoice.grandTotal, creditDays: invoice.creditDays, dueDate: invoice.dueDate, commercialRemarks: clean(payload.commercialRemarks ?? pakki.commercialRemarks) });
  await pakki.save(sessionOptions(session));
  if (due) {
    due.originalRejectionMeter = values.rejectionMeter;
    due.pendingMeter = qty(values.rejectionMeter - due.receivedMeter);
    due.status = due.pendingMeter > 0 ? due.receivedMeter > 0 ? "partial" : "pending" : "received";
    due.pakkiDate = pakki.pakkiDate;
    await due.save(sessionOptions(session));
  } else if (values.rejectionMeter > 0) {
    const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: pakki.sourceKacchiId || pakki.kacchiId, userId }), session);
    if (!kacchi) throw fail("Source Kacchi is unavailable.", 409);
    due = await createOne(WeavingRejectionDue, { userId, pakkiId: pakki._id, partyId: pakki.partyId, contractId: pakki.contractId, fabricQualityId: pakki.fabricQualityId, qualitySnapshot: pakki.qualitySnapshot, ownershipType: pakki.ownershipType, ownerPartyId: kacchi.ownerPartyId, godownId: pakki.godownId, pakkiDate: pakki.pakkiDate, originalRejectionMeter: values.rejectionMeter, pendingMeter: values.rejectionMeter }, session);
  }
  return invoice;
}, true);

const updateDraft = async (userId, invoiceId, payload, actorId) => {
  const posted = await WeavingSalesInvoice.exists({ _id: invoiceId, userId, status: "posted" });
  if (posted) return updatePostedInvoice(userId, invoiceId, payload, actorId);
  const invoice = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "draft" }); if (!invoice) throw fail("Only a Draft Invoice can be edited", 409);
  const finalRate = round(payload.finalRate ?? invoice.finalRate); if (finalRate !== invoice.originalRate && !clean(payload.rateOverrideReason || invoice.rateOverrideReason)) throw fail("Rate override reason is required"); if (finalRate <= 0) throw fail("Rate must be greater than zero");
  const totals = calculateInvoiceTotals({ quantity: invoice.quantity, rate: finalRate, discountAmount: payload.discountAmount ?? invoice.discountAmount, taxAmount: payload.taxAmount ?? invoice.taxAmount });
  const terms = normalizeSaleTerms({ receivedNow: invoice.receivedNowRequested, paymentAccountId: invoice.paymentAccountId, paymentMethod: invoice.paymentMethod, ...payload }, totals.grandTotal);
  Object.assign(invoice, totals, terms, { finalRate, paymentAccountId: terms.receivedNowRequested > 0 ? (payload.paymentAccountId || invoice.paymentAccountId) : null, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || invoice.paymentMethod || "cash") : "", receiptRequestKey: terms.receivedNowRequested > 0 ? (invoice.receiptRequestKey || clean(payload.receiptRequestKey) || `sale:${invoice._id}`) : "", rateOverrideReason: clean(payload.rateOverrideReason), rateChangedBy: finalRate !== invoice.originalRate ? actorId : null, rateChangedAt: finalRate !== invoice.originalRate ? new Date() : null, invoiceDate: clean(payload.invoiceDate) || invoice.invoiceDate, creditDays: Math.max(0, Math.trunc(Number(payload.creditDays ?? invoice.creditDays) || 0)), notes: clean(payload.notes) });
  invoice.dueDate = clean(payload.dueDate) || dueDateFromCreditDays(invoice.invoiceDate, invoice.creditDays); invoice.balanceDue = invoice.grandTotal; return invoice.save();
};

const voidInvoice = async (userId, invoiceId, actorId, reason) => {
  const touched = [];
  const result = await runAtomic(async (session) => {
    const invoice = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" }), session);
    if (!invoice) throw fail("Posted Invoice not found", 404);
    const paid = await setSession(WeavingMoneyTransaction.exists({ userId, salesInvoiceId: invoice._id, status: "posted", type: "receive" }), session);
    if (invoice.paidAmount > 0 || paid) throw fail("Reverse linked receipts before voiding this Invoice", 409);
    const reversal = await reverseJournalInSession({ userId, journalId: invoice.journalEntryId, date: new Date().toISOString().slice(0, 10), reason: `Void ${invoice.invoiceNo}: ${clean(reason)}`, session });
    if (reversal) touched.push(...reversal.lines.map((line) => line.account));
    if (invoice.saleSource === "direct" && invoice.stockMovementId) {
      if (invoice.stockMovementModel === "WeavingYarnMovement") await createOne(WeavingYarnMovement, { userId, yarnId: invoice.yarnId, date: new Date().toISOString().slice(0, 10), movementType: "sale_return", ownershipType: "own", salesInvoiceId: invoice._id, quantityKg: invoice.quantity, godownId: invoice.godownId, rate: invoice.finalRate, notes: `Void ${invoice.invoiceNo}` }, session);
      else {
        const movements = await setSession(WeavingFabricMovement.find({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: false }).lean(), session);
        for (const movement of movements) {
          if (movement.sourceFoldingEntryId) {
            const released = await WeavingFoldingEntry.updateOne({ _id: movement.sourceFoldingEntryId, userId, activeSalesInvoiceId: invoice._id, activeKacchiId: null }, { $set: { activeSalesInvoiceId: null }, $inc: { stockRevision: 1 } }, sessionOptions(session));
            if (released.modifiedCount !== 1) throw fail("A sold Than changed. Review its stock history before voiding.", 409);
          }
          const { _id, createdAt, updatedAt, __v, ...values } = movement;
          await createOne(WeavingFabricMovement, { ...values, date: new Date().toISOString().slice(0, 10), movementType: "sale_return", direction: "in", notes: `Void ${invoice.invoiceNo}` }, session);
        }
      }
    }
    invoice.status = "void"; invoice.activeForPakki = false; invoice.voidedAt = new Date(); invoice.voidedBy = actorId; invoice.voidReason = clean(reason); invoice.reversalJournalId = reversal?._id || null;
    await invoice.save(sessionOptions(session));
    const sourcePakkiId = invoice.sourcePakkiId || invoice.pakkiId;
    if (sourcePakkiId) await WeavingPakkiSettlement.updateOne({ _id: sourcePakkiId, userId, invoiceId: invoice._id }, { $set: { invoiceId: null } }, sessionOptions(session));
    await recalculateAccountBalances([...new Set(touched.map(String))], session);
    return invoice;
  }, true);
  return result;
};

module.exports = {
  confirmPakkiInvoice: costing.withCostingInvalidation(confirmPakkiInvoice, "sale"),
  calculateSettlement,
  calculateInvoiceTotals,
  dueDateFromCreditDays,
  createKacchi: costing.withCostingInvalidation(createKacchi, "kacchi"),
  updateKacchi: costing.withCostingInvalidation(updateKacchi, "kacchi"),
  voidKacchi: costing.withCostingInvalidation(voidKacchi, "kacchi"),
  createPakki: costing.withCostingInvalidation(createPakki, "pakki"),
  voidPakki: costing.withCostingInvalidation(voidPakki, "pakki"),
  draftFromPakki,
  createDirectDraft,
  createInvoiceFromPakki: costing.withCostingInvalidation(createInvoiceFromPakki, "sale"),
  createDirectInvoice: costing.withCostingInvalidation(createDirectInvoice, "sale"),
  postInvoice: costing.withCostingInvalidation(postInvoice, "sale"),
  receiveRejection: costing.withCostingInvalidation(receiveRejection, "rejection"),
  reverseRejection: costing.withCostingInvalidation(reverseRejection, "rejection"),
  getWorkspace,
  getManagementMetrics,
  updateDraft,
  updatePostedInvoice,
  updatePakki: costing.withCostingInvalidation(updatePakki, "sale"),
  voidInvoice: costing.withCostingInvalidation(voidInvoice, "sale"),
  getFabricBalance,
  getFabricBalances,
  _test: { paymentAmounts, normalizeOtherLines, chequeDetails, buildManagementMetrics, calculateSettlement, calculateInvoiceTotals, dueDateFromCreditDays, validateReceiptClassification, stockCategory, normalizeSaleTerms },
};
