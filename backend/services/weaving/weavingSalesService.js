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
const { recalculateAccountBalances } = require("../../utils/accountHelper");

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const qty = (value) => Math.round((Number(value) || 0) * 1000000) / 1000000;
const clean = (value = "") => String(value || "").trim();
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const id = (value) => String(value?._id || value || "");
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
  const counter = await Counter.findOneAndUpdate(
    { userId, type },
    { $inc: { seq: 1 }, $setOnInsert: { userId, type } },
    { new: true, upsert: true, setDefaultsOnInsert: false, ...sessionOptions(session) },
  );
  return `${prefix}-${String(counter.seq).padStart(width, "0")}`;
};

const previewNo = async (userId, type, prefix, width = 5) => {
  const counter = await Counter.findOne({ userId, type }).select("seq").lean();
  return `${prefix}-${String((Number(counter?.seq) || 0) + 1).padStart(width, "0")}`;
};

const qualitySnapshot = (quality) => ({ name: quality.name, code: quality.code, warpCount: quality.warpCount, weftCount: quality.weftCount, construction: quality.construction, width: quality.width, brand: quality.brand });

const getFabricBalances = async ({ userId, fabricQualityId, godownId, category = "normal", ownershipType = "own", ownerPartyId = null, session = null }) => {
  const match = { userId, fabricQualityId, status: "posted", ...(godownId ? { godownId } : {}), ownershipType };
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
  const movementMatch = { userId, fabricQualityId, category, isVoided: false, ...(godownId ? { godownId } : {}), ownershipType };
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

const buildKacchiContext = async (userId, payload, session, currentKacchiId = null) => {
  const sourceIds = [...new Set((payload.foldingEntryIds || payload.selectedThanIds || []).map(id).filter(Boolean))];
  if (!sourceIds.length) throw fail("Select at least one available Than");
  const [contract, party, quality, godown] = await Promise.all([
    setSession(WeavingContract.findOne({ _id: payload.contractId, userId, type: "sales", status: "active" }), session),
    setSession(WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: ["customer", "both"] } }), session),
    setSession(WeavingFabricQuality.findOne({ _id: payload.fabricQualityId, userId, isActive: true }), session),
    setSession(WeavingGodown.findOne({ _id: payload.godownId, userId, isActive: true }), session),
  ]);
  if (!contract || !party || !quality || !godown) throw fail("Valid Contract, Party, Fabric Quality and Godown are required");
  if (id(contract.partyId) !== id(party._id) || id(contract.itemId) !== id(quality._id)) throw fail("Kacchi details do not match the selected Contract", 409);
  const ownershipType = contract.contractType === "conversion" ? "party" : "own";
  const entries = await setSession(WeavingFoldingEntry.find({ _id: { $in: sourceIds }, userId, status: "posted", grade: "a", activeKacchiId: { $in: [null, currentKacchiId] } }), session);
  if (entries.length !== sourceIds.length) throw fail("One or more selected Thans are unavailable or already dispatched", 409);
  entries.forEach((entry) => {
    if (id(entry.fabricQualityId) !== id(quality._id) || id(entry.godownId) !== id(godown._id) || entry.ownershipType !== ownershipType || (ownershipType === "party" && id(entry.ownerPartyId) !== id(party._id)) || (entry.contractId && id(entry.contractId) !== id(contract._id))) throw fail(`Than ${entry.thanNo} does not match the selected Party, Contract, Quality or Godown`, 409);
  });
  const lines = entries.map((entry) => ({ foldingEntryId: entry._id, thanNo: entry.thanNo, fabricQualityId: quality._id, qualitySnapshot: qualitySnapshot(quality), grade: "a", category: "normal", meter: qty(entry.meter), weightKg: qty(entry.weightKg), weightLbs: qty(entry.weightLbs), thanCount: 1, godownId: godown._id, ownershipType, ownerPartyId: ownershipType === "party" ? party._id : null, contractId: contract._id }));
  const selectedTotals = { meter: qty(lines.reduce((sum, line) => sum + line.meter, 0)), weightKg: qty(lines.reduce((sum, line) => sum + line.weightKg, 0)), thanCount: qty(lines.reduce((sum, line) => sum + line.thanCount, 0)) };
  const available = await getFabricBalances({ userId, fabricQualityId: quality._id, godownId: godown._id, category: "normal", ownershipType, ownerPartyId: ownershipType === "party" ? party._id : null, session });
  if (currentKacchiId) {
    const currentMovements = await setSession(WeavingFabricMovement.find({ userId, kacchiId: currentKacchiId, movementType: "kacchi_out", isVoided: false }).select("meter weightKg thanCount").lean(), session);
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
  return runAtomic(async (session) => {
    const context = await buildKacchiContext(userId, payload, session);
    const kacchi = await createOne(WeavingKacchiParchi, { userId, requestKey, kacchiNo: await allocateNo(userId, "weaving_kacchi", "KC", 5, session), dispatchDate: clean(payload.dispatchDate), partyId: context.party._id, contractId: context.contract._id, fabricQualityId: context.quality._id, qualitySnapshot: qualitySnapshot(context.quality), godownId: context.godown._id, ownershipType: context.ownershipType, ownerPartyId: context.ownershipType === "party" ? context.party._id : null, lines: context.lines, ...context.totals, notes: clean(payload.notes) }, session);
    for (const entry of context.entries) {
      const claimed = await WeavingFoldingEntry.findOneAndUpdate({ _id: entry._id, userId, status: "posted", grade: "a", activeKacchiId: null }, { $set: { activeKacchiId: kacchi._id, dispatchStatus: "kacchi_out" } }, { new: true, ...sessionOptions(session) });
      if (!claimed) throw fail(`Than ${entry.thanNo} was dispatched by another request`, 409);
    }
    await WeavingFabricMovement.insertMany(context.lines.map((line) => ({ userId, date: kacchi.dispatchDate, movementType: "kacchi_out", category: line.category, direction: "out", fabricQualityId: line.fabricQualityId, godownId: line.godownId, ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, meter: line.meter, weightKg: line.weightKg, thanCount: line.thanCount, kacchiId: kacchi._id, sourceFoldingEntryId: line.foldingEntryId, notes: `Kacchi ${kacchi.kacchiNo} / ${line.thanNo}` })), sessionOptions(session));
    return kacchi;
  });
};

const updateKacchi = async (userId, kacchiId, payload) => runAtomic(async (session) => {
  const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: kacchiId, userId, status: "confirmed", pakkiId: null }), session);
  if (!kacchi) throw fail("Only an unfinalized Kacchi can be edited", 409);
  const context = await buildKacchiContext(userId, payload, session, kacchi._id);
  const oldIds = new Set(kacchi.lines.map((line) => id(line.foldingEntryId)));
  const newIds = new Set(context.lines.map((line) => id(line.foldingEntryId)));
  const removed = kacchi.lines.filter((line) => !newIds.has(id(line.foldingEntryId)));
  const added = context.lines.filter((line) => !oldIds.has(id(line.foldingEntryId)));
  for (const line of added) {
    const claimed = await WeavingFoldingEntry.findOneAndUpdate({ _id: line.foldingEntryId, userId, status: "posted", activeKacchiId: null }, { $set: { activeKacchiId: kacchi._id, dispatchStatus: "kacchi_out" } }, { new: true, ...sessionOptions(session) });
    if (!claimed) throw fail(`Than ${line.thanNo} is no longer available`, 409);
  }
  if (removed.length) {
    const removedIds = removed.map((line) => line.foldingEntryId);
    await WeavingFabricMovement.updateMany({ userId, kacchiId: kacchi._id, sourceFoldingEntryId: { $in: removedIds }, movementType: "kacchi_out", isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
    await WeavingFoldingEntry.updateMany({ userId, _id: { $in: removedIds }, activeKacchiId: kacchi._id }, { $set: { activeKacchiId: null, dispatchStatus: "available" } }, sessionOptions(session));
  }
  if (added.length) await WeavingFabricMovement.insertMany(added.map((line) => ({ userId, date: clean(payload.dispatchDate), movementType: "kacchi_out", category: line.category, direction: "out", fabricQualityId: line.fabricQualityId, godownId: line.godownId, ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, meter: line.meter, weightKg: line.weightKg, thanCount: line.thanCount, kacchiId: kacchi._id, sourceFoldingEntryId: line.foldingEntryId, notes: `Kacchi ${kacchi.kacchiNo} / ${line.thanNo}` })), sessionOptions(session));
  Object.assign(kacchi, { dispatchDate: clean(payload.dispatchDate), partyId: context.party._id, contractId: context.contract._id, fabricQualityId: context.quality._id, qualitySnapshot: qualitySnapshot(context.quality), godownId: context.godown._id, ownershipType: context.ownershipType, ownerPartyId: context.ownershipType === "party" ? context.party._id : null, lines: context.lines, ...context.totals, notes: clean(payload.notes) });
  await kacchi.save(sessionOptions(session));
  return kacchi;
});

const voidKacchi = async (userId, kacchiId, actorId, reason) => runAtomic(async (session) => {
  const kacchi = await setSession(WeavingKacchiParchi.findOne({ _id: kacchiId, userId, status: "confirmed", pakkiId: null }), session);
  if (!kacchi) throw fail("Only an unfinalized Kacchi can be voided", 409);
  await WeavingFabricMovement.updateMany({ userId, kacchiId: kacchi._id, movementType: "kacchi_out", isVoided: false }, { $set: { isVoided: true } }, sessionOptions(session));
  await WeavingFoldingEntry.updateMany({ userId, activeKacchiId: kacchi._id }, { $set: { activeKacchiId: null, dispatchStatus: "available" } }, sessionOptions(session));
  kacchi.status = "void"; kacchi.voidedAt = new Date(); kacchi.voidedBy = actorId; kacchi.voidReason = clean(reason);
  await kacchi.save(sessionOptions(session));
  return kacchi;
});

const createPakki = async (userId, payload) => runAtomic(async (session) => {
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
});

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

const draftFromPakki = async (userId, pakkiId) => {
  const pakki = await WeavingPakkiSettlement.findOne({ _id: pakkiId, userId, status: "finalized" });
  if (!pakki) throw fail("Finalized Pakki not found", 404);
  const existing = await WeavingSalesInvoice.findOne({ userId, activeForPakki: true, status: { $ne: "void" }, $or: [{ sourcePakkiId: pakki._id }, { pakkiId: pakki._id }] });
  if (existing) return existing;
  const historical = await WeavingSalesInvoice.findOne({ userId, $or: [{ sourcePakkiId: pakki._id }, { pakkiId: pakki._id }] }).sort({ createdAt: -1 });
  const [party, contract] = await Promise.all([WeavingParty.findOne({ _id: pakki.partyId, userId, isActive: true, isHidden: false }), WeavingContract.findOne({ _id: pakki.contractId, userId })]);
  if (!party || !contract) throw fail("Pakki Party or Contract is unavailable");
  const totals = calculateInvoiceTotals({ quantity: pakki.billableMeter, rate: pakki.rate, discountAmount: pakki.amountDeduction });
  const invoice = await WeavingSalesInvoice.create({ userId, invoiceNo: await allocateNo(userId, "weaving_sales_invoice", "WS"), invoiceDate: pakki.pakkiDate, partyId: party._id, partyName: party.name, saleSource: "pakki", saleNature: pakki.contractType === "conversion" ? "conversion" : "fabric", pakkiId: historical ? null : pakki._id, sourcePakkiId: pakki._id, replacesInvoiceId: historical?._id || null, activeForPakki: true, contractId: contract._id, fabricQualityId: pakki.fabricQualityId, godownId: pakki.godownId, ownershipType: pakki.ownershipType, description: pakki.contractType === "conversion" ? "Conversion / Job Work" : pakki.qualitySnapshot?.name || "Fabric Sale", qualitySnapshot: pakki.qualitySnapshot, quantity: pakki.billableMeter, weightKg: pakki.grossKg, thanCount: pakki.thanCount, uom: "Meter", originalRate: pakki.rate, finalRate: pakki.rate, ...totals, creditDays: pakki.creditDays, dueDate: pakki.dueDate, balanceDue: totals.grandTotal, notes: pakki.commercialRemarks });
  pakki.invoiceId = invoice._id; await pakki.save(); return invoice;
};

const normalizeSaleTerms = (payload, grandTotal) => {
  const saleTerms = ["credit", "paid", "partial"].includes(payload.saleTerms) ? payload.saleTerms : "credit";
  const receivedNowRequested = saleTerms === "paid" ? grandTotal : saleTerms === "partial" ? round(payload.receivedNow) : 0;
  if (receivedNowRequested < 0 || receivedNowRequested > grandTotal || (saleTerms === "partial" && receivedNowRequested <= 0)) throw fail("Invalid Received Now amount");
  if (receivedNowRequested > 0 && !payload.paymentAccountId) throw fail("Payment Account is required");
  return { saleTerms, receivedNowRequested };
};

const createDirectDraft = async (userId, payload, actorId) => {
  const party = await WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, serviceTypes: { $ne: "sizing" }, role: { $in: ["customer", "both"] } });
  if (!party) throw fail("Customer / Party is required");
  const saleNature = ["fabric", "yarn", "other"].includes(payload.saleNature) ? payload.saleNature : "fabric";
  const otherSubtype = saleNature === "other" && ["rejected", "cut_piece", "waste", "other"].includes(payload.otherSubtype) ? payload.otherSubtype : "";
  const quantity = qty(payload.quantity || (otherSubtype === "other" ? 1 : 0)); const finalRate = round(payload.finalRate || (otherSubtype === "other" ? payload.amount : 0));
  if (quantity <= 0 || finalRate <= 0) throw fail("Valid quantity and rate are required");
  let quality = null; let yarn = null; let godown = null; let description = clean(payload.description); let uom = clean(payload.uom);
  const stockBackedFabric = saleNature === "fabric" || (saleNature === "other" && otherSubtype !== "other");
  if (saleNature === "yarn") { yarn = await WeavingYarn.findOne({ _id: payload.yarnId, userId, isActive: true }); if (!yarn) throw fail("Yarn is required"); description ||= [yarn.name, yarn.count, yarn.millBrand].filter(Boolean).join(" / "); uom = "KG"; }
  else if (stockBackedFabric) { quality = await WeavingFabricQuality.findOne({ _id: payload.fabricQualityId, userId, isActive: true }); if (!quality) throw fail("Fabric Quality is required"); description ||= quality.name; uom = "Meter"; }
  else { if (!description) throw fail("Description is required for General / Other Sale"); uom = ["Meter", "KG", "Piece", "Nos", "Job", "Other"].includes(uom) ? uom : "Job"; }
  if (saleNature === "yarn" || stockBackedFabric) { godown = await WeavingGodown.findOne({ _id: payload.godownId, userId, isActive: true }); if (!godown) throw fail("Godown is required"); }
  const originalRate = round(payload.originalRate ?? finalRate); if (originalRate !== finalRate && !clean(payload.rateOverrideReason)) throw fail("Rate override reason is required");
  const totals = calculateInvoiceTotals({ quantity, rate: finalRate, discountAmount: payload.discountAmount, taxAmount: payload.taxAmount });
  const creditDays = Math.max(0, Math.trunc(Number(payload.creditDays) || 0)); const invoiceDate = clean(payload.invoiceDate); const terms = normalizeSaleTerms(payload, totals.grandTotal);
  return WeavingSalesInvoice.create({ userId, invoiceNo: await allocateNo(userId, "weaving_sales_invoice", "WS"), invoiceDate, partyId: party._id, partyName: party.name, saleSource: "direct", saleNature, fabricCategory: payload.fabricCategory === "b" ? "b" : "normal", otherSubtype, fabricQualityId: quality?._id || null, yarnId: yarn?._id || null, godownId: godown?._id || null, ownershipType: "own", description, qualitySnapshot: quality ? qualitySnapshot(quality) : { name: yarn?.name, count: yarn?.count, brand: yarn?.millBrand }, quantity, weightKg: qty(payload.weightKg), thanCount: qty(payload.thanCount), pieceCount: qty(payload.pieceCount), uom, originalRate, finalRate, rateOverrideReason: clean(payload.rateOverrideReason), rateChangedBy: originalRate !== finalRate ? actorId : null, rateChangedAt: originalRate !== finalRate ? new Date() : null, ...totals, ...terms, paymentAccountId: terms.receivedNowRequested > 0 ? payload.paymentAccountId : null, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || "cash") : "", receiptRequestKey: terms.receivedNowRequested > 0 ? clean(payload.receiptRequestKey) || `sale:${Date.now()}:${Math.random()}` : "", creditDays, dueDate: clean(payload.dueDate) || dueDateFromCreditDays(invoiceDate, creditDays), balanceDue: totals.grandTotal, notes: clean(payload.notes) });
};

const stockCategory = (invoice) => invoice.saleNature === "fabric" ? (invoice.fabricCategory || "normal") : invoice.otherSubtype === "other" ? null : invoice.otherSubtype;

const postInvoice = async (userId, invoiceId, actorId) => {
  const seed = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId });
  if (!seed) throw fail("Invoice not found", 404);
  if (seed.status === "posted") return seed;
  if (!["draft", "posting"].includes(seed.status)) throw fail("Only a Draft Invoice can be posted", 409);
  const stockBacked = seed.saleSource === "direct" && (seed.saleNature === "yarn" || stockCategory(seed));
  const lockKey = seed.saleNature === "yarn"
    ? ["yarn", seed.yarnId, seed.godownId, "own"].join(":")
    : ["fabric", seed.fabricQualityId, seed.godownId, stockCategory(seed), "own"].join(":");
  const execute = async () => {
    const touchedAccountIds = [];
    const invoice = await runAtomic(async (session) => {
      const locked = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: { $in: ["draft", "posting"] } }), session);
      if (!locked) {
        const existing = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId }), session);
        if (existing?.status === "posted") return existing;
        throw fail("Only a Draft Invoice can be posted", 409);
      }
      locked.status = "posting";
      await locked.save(sessionOptions(session));
      if (stockBacked) {
        if (locked.saleNature === "yarn") {
          let movement = await setSession(WeavingYarnMovement.findOne({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }), session);
          if (!movement) { const balance = await yarnStock.getGodownBalance({ userId, yarnId: locked.yarnId, godownId: locked.godownId, ownershipType: "own", session }); if (locked.quantity > balance.kg) throw fail(`Only ${balance.kg} KG Own Yarn is available`, 409); movement = await WeavingYarnMovement.findOneAndUpdate({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }, { $setOnInsert: { userId, yarnId: locked.yarnId, date: locked.invoiceDate, movementType: "sale_out", ownershipType: "own", salesInvoiceId: locked._id, quantityKg: locked.quantity, sourceGodownId: locked.godownId, rate: locked.finalRate, notes: locked.invoiceNo } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) }); }
          locked.stockMovementId = movement._id; locked.stockMovementModel = "WeavingYarnMovement";
        } else {
          let movement = await setSession(WeavingFabricMovement.findOne({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }), session);
          if (!movement) {
            const available = await getFabricBalances({ userId, fabricQualityId: locked.fabricQualityId, godownId: locked.godownId, category: stockCategory(locked), ownershipType: "own", session });
            if (locked.quantity > available.meter || locked.weightKg > available.weightKg || locked.thanCount > available.thanCount || locked.pieceCount > available.pieceCount) throw fail("Sale quantity exceeds available Fabric Stock", 409);
            const ratio = available.meter > 0 ? locked.quantity / available.meter : 0; const weightKg = locked.weightKg || qty(available.weightKg * ratio); const thanCount = locked.thanCount || qty(available.thanCount * ratio);
            movement = await WeavingFabricMovement.findOneAndUpdate({ userId, salesInvoiceId: locked._id, movementType: "sale_out" }, { $setOnInsert: { userId, date: locked.invoiceDate, movementType: "sale_out", category: stockCategory(locked), direction: "out", fabricQualityId: locked.fabricQualityId, godownId: locked.godownId, ownershipType: "own", meter: locked.quantity, weightKg, thanCount, pieceCount: locked.pieceCount, salesInvoiceId: locked._id, notes: locked.invoiceNo } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) });
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
        receipt = await createOne(WeavingMoneyTransaction, { userId, requestKey: locked.receiptRequestKey, transactionNo: await allocateNo(userId, "weaving_receive_payment", "RCV", 5, session), type: "receive", date: locked.invoiceDate, partyId: locked.partyId, salesInvoiceId: locked._id, amount: locked.receivedNowRequested, paymentAccountId: paymentAccount._id, paymentMethod: locked.paymentMethod || paymentAccount.category, description: `Received against ${locked.invoiceNo}`, journalEntryId: receiptJournal._id }, session);
        touchedAccountIds.push(...receiptJournal.lines.map((line) => line.account));
      }
      locked.paidAmount = round(receipt.amount);
      locked.balanceDue = round(Math.max(0, locked.grandTotal - locked.paidAmount));
      locked.paymentStatus = locked.balanceDue <= 0 ? "paid" : "partial";
    }
    locked.status = "posted"; locked.postedAt = new Date(); locked.postedBy = actorId; await locked.save(sessionOptions(session));
    return locked;
    });
    await recalculateAccountBalances(touchedAccountIds);
    return WeavingSalesInvoice.findById(invoice._id);
  };
  const posted = await (stockBacked ? withStockLock(userId, lockKey, execute) : execute());
  return posted;
};

const createDirectInvoice = async (userId, payload, actorId) => {
  const invoice = await createDirectDraft(userId, payload, actorId);
  try {
    return await postInvoice(userId, invoice._id, actorId);
  } catch (error) {
    await WeavingSalesInvoice.deleteOne({ _id: invoice._id, userId, status: "draft" });
    throw error;
  }
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
  const [kacchis, pakkis, ready, invoices, pending, receipts, parties, contracts, qualities, yarns, godowns, paymentAccounts, availableThans, invoicePreview, fabricStock, yarnSummary] = await Promise.all([
    WeavingKacchiParchi.find({ userId }).populate("partyId", "name").populate("fabricQualityId", "name code").populate("godownId", "name").sort({ dispatchDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingPakkiSettlement.find({ userId }).populate("partyId", "name").sort({ pakkiDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingPakkiSettlement.find({ userId, status: "finalized", invoiceId: null }).populate("partyId", "name").sort({ pakkiDate: -1 }).lean(),
    WeavingSalesInvoice.find(invoiceFilter).populate("partyId", "name").sort({ invoiceDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingRejectionDue.find({ userId, status: { $in: ["pending", "partial"] } }).populate("partyId", "name").sort({ pakkiDate: 1 }).lean(),
    WeavingRejectionReceipt.find({ userId }).populate("partyId", "name").populate("fabricQualityId", "name code").sort({ receiptDate: -1, createdAt: -1 }).limit(250).lean(),
    WeavingParty.find({ userId, isActive: true, isHidden: false, role: { $in: ["customer", "both"] } }).select("name role").sort({ name: 1 }).lean(),
    WeavingContract.find({ userId, type: "sales", status: "active" }).select("contractNo contractType partyId itemId rate creditDays").sort({ contractDate: -1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code construction width warpCount weftCount brand").sort({ name: 1 }).lean(),
    WeavingYarn.find({ userId, isActive: true }).select("name count millBrand quality").sort({ name: 1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
    Account.find({ userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } }).select("name code category").sort({ name: 1 }).lean(),
    WeavingFoldingEntry.find({ userId, status: "posted", grade: "a", activeKacchiId: null }).select("thanNo date contractId fabricQualityId godownId ownershipType ownerPartyId meter weightKg weightLbs qualitySnapshot").sort({ date: 1, thanNo: 1 }).lean(),
    previewNo(userId, "weaving_sales_invoice", "WS"), foldingStock.stockSummary(userId), yarnStock.getSummary(userId),
  ]);
  return { kacchis, pakkis, ready, invoices, pending, receipts, meta: { parties, contracts, qualities, yarns, godowns, paymentAccounts, availableThans, nextInvoiceNo: invoicePreview, fabricStock: fabricStock.rows.filter((row) => row.ownershipType === "own" && (row.meter > 0 || row.kg > 0)), yarnStock: yarnSummary.items }, metrics: buildManagementMetrics({ readyCount: ready.length, pending, invoices, receipts }) };
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

const updatePostedInvoice = async (userId, invoiceId, payload, actorId) => {
  const seed = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" });
  if (!seed) throw fail("Posted Invoice not found", 404);
  const activeReceipts = await WeavingMoneyTransaction.find({ userId, salesInvoiceId: seed._id, type: "receive", status: "posted" });
  if (activeReceipts.some((row) => !seed.receiptRequestKey || row.requestKey !== seed.receiptRequestKey)) throw fail("Reverse later receipts linked to this Invoice before editing it", 409);
  const party = await WeavingParty.findOne({ _id: payload.partyId || seed.partyId, userId, isActive: true, isHidden: false, serviceTypes: { $ne: "sizing" }, role: { $in: ["customer", "both"] } });
  if (!party) throw fail("Customer / Party is required");
  const invoiceDate = clean(payload.invoiceDate) || seed.invoiceDate;
  const quantity = qty(payload.quantity ?? seed.quantity);
  const finalRate = round(payload.finalRate ?? seed.finalRate);
  if (quantity <= 0 || finalRate <= 0) throw fail("Valid quantity and rate are required");
  const totals = calculateInvoiceTotals({ quantity, rate: finalRate, discountAmount: payload.discountAmount ?? seed.discountAmount, taxAmount: payload.taxAmount ?? seed.taxAmount });
  const terms = normalizeSaleTerms(payload.saleTerms ? payload : { saleTerms: seed.saleTerms, receivedNow: seed.receivedNowRequested, paymentAccountId: seed.paymentAccountId }, totals.grandTotal);
  const paymentAccountId = terms.receivedNowRequested > 0 ? (payload.paymentAccountId || seed.paymentAccountId) : null;
  const paymentAccount = paymentAccountId ? await Account.findOne({ _id: paymentAccountId, userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } }) : null;
  if (terms.receivedNowRequested > 0 && !paymentAccount) throw fail("Valid payment account is required");
  const stockBacked = seed.saleSource === "direct" && (seed.saleNature === "yarn" || stockCategory(seed));
  if (payload.saleNature && payload.saleNature !== seed.saleNature) throw fail("Sale Type cannot be changed after posting", 409);
  const targetGodownId = payload.godownId || seed.godownId;
  const targetYarnId = payload.yarnId || seed.yarnId;
  const targetQualityId = payload.fabricQualityId || seed.fabricQualityId;
  const targetCategory = seed.saleNature === "fabric" ? (payload.fabricCategory === "b" ? "b" : payload.fabricCategory === "normal" ? "normal" : seed.fabricCategory) : (payload.otherSubtype || seed.otherSubtype);
  const targetGodown = stockBacked ? await WeavingGodown.findOne({ _id: targetGodownId, userId, isActive: true }) : null;
  if (stockBacked && !targetGodown) throw fail("Godown is required");
  if (seed.saleNature === "yarn" && !await WeavingYarn.exists({ _id: targetYarnId, userId, isActive: true })) throw fail("Yarn is required");
  if (stockBacked && seed.saleNature !== "yarn" && !await WeavingFabricQuality.exists({ _id: targetQualityId, userId, isActive: true })) throw fail("Fabric Quality is required");
  const lockKey = seed.saleNature === "yarn" ? ["yarn", targetYarnId, targetGodownId, "own"].join(":") : ["fabric", targetQualityId, targetGodownId, targetCategory, "own"].join(":");
  const execute = async () => {
    const touched = [];
    const result = await runAtomic(async (session) => {
      const invoice = await setSession(WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" }), session);
      if (!invoice) throw fail("Invoice changed before it could be edited", 409);
      const receipts = await setSession(WeavingMoneyTransaction.find({ userId, salesInvoiceId: invoice._id, type: "receive", status: "posted" }), session);
      if (receipts.some((row) => !invoice.receiptRequestKey || row.requestKey !== invoice.receiptRequestKey)) throw fail("Reverse later receipts linked to this Invoice before editing it", 409);
      if (stockBacked && invoice.saleNature === "yarn") {
        const movement = await setSession(WeavingYarnMovement.findOne({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: { $ne: true } }), session);
        if (!movement) throw fail("Linked Yarn movement was not found", 409);
        const balance = await yarnStock.getGodownBalance({ userId, yarnId: targetYarnId, godownId: targetGodownId, ownershipType: "own", session });
        const reusable = String(movement.yarnId) === String(targetYarnId) && String(movement.sourceGodownId) === String(targetGodownId) ? movement.quantityKg : 0;
        if (quantity > round(balance.kg + reusable)) throw fail(`Only ${round(balance.kg + reusable)} KG Own Yarn is available`, 409);
        Object.assign(movement, { yarnId: targetYarnId, date: invoiceDate, quantityKg: quantity, sourceGodownId: targetGodownId, rate: finalRate });
        await movement.save(sessionOptions(session));
      } else if (stockBacked) {
        const movement = await setSession(WeavingFabricMovement.findOne({ userId, salesInvoiceId: invoice._id, movementType: "sale_out", isVoided: { $ne: true } }), session);
        if (!movement) throw fail("Linked Fabric movement was not found", 409);
        const available = await getFabricBalances({ userId, fabricQualityId: targetQualityId, godownId: targetGodownId, category: targetCategory, ownershipType: "own", session });
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
        await createOne(WeavingMoneyTransaction, { userId, requestKey: receiptRequestKey, transactionNo: await allocateNo(userId, "weaving_receive_payment", "RCV", 5, session), type: "receive", date: invoiceDate, partyId: party._id, salesInvoiceId: invoice._id, amount: terms.receivedNowRequested, paymentAccountId: paymentAccount._id, paymentMethod: payload.paymentMethod || invoice.paymentMethod || paymentAccount.category, description: `Received against ${invoice.invoiceNo}`, journalEntryId: receiptJournal._id }, session);
        touched.push(...receiptJournal.lines.map((line) => line.account)); paidAmount = terms.receivedNowRequested;
      }
      const creditDays = Math.max(0, Math.trunc(Number(payload.creditDays ?? invoice.creditDays) || 0));
      Object.assign(invoice, totals, terms, { partyId: party._id, partyName: party.name, invoiceDate, quantity, finalRate, fabricCategory: targetCategory === "b" ? "b" : invoice.fabricCategory, otherSubtype: invoice.saleNature === "other" ? targetCategory : invoice.otherSubtype, yarnId: targetYarnId || null, fabricQualityId: targetQualityId || null, godownId: targetGodownId || null, description: clean(payload.description) || invoice.description, paymentAccountId, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || invoice.paymentMethod || paymentAccount.category) : "", receiptRequestKey, paidAmount, balanceDue: round(totals.grandTotal - paidAmount), paymentStatus: paidAmount >= totals.grandTotal ? "paid" : paidAmount > 0 ? "partial" : "unpaid", journalEntryId: journal._id, creditDays, dueDate: clean(payload.dueDate) || dueDateFromCreditDays(invoiceDate, creditDays), notes: clean(payload.notes), rateOverrideReason: clean(payload.rateOverrideReason || invoice.rateOverrideReason), rateChangedBy: finalRate !== invoice.originalRate ? actorId : null, rateChangedAt: finalRate !== invoice.originalRate ? new Date() : null });
      await invoice.save(sessionOptions(session));
      return invoice;
    });
    await recalculateAccountBalances([...new Set(touched.map(String))]);
    return result;
  };
  return stockBacked ? withStockLock(userId, lockKey, execute) : execute();
};

const updateDraft = async (userId, invoiceId, payload, actorId) => {
  const posted = await WeavingSalesInvoice.exists({ _id: invoiceId, userId, status: "posted" });
  if (posted) return updatePostedInvoice(userId, invoiceId, payload, actorId);
  const invoice = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "draft" }); if (!invoice) throw fail("Only a Draft Invoice can be edited", 409);
  const finalRate = round(payload.finalRate ?? invoice.finalRate); if (finalRate !== invoice.originalRate && !clean(payload.rateOverrideReason || invoice.rateOverrideReason)) throw fail("Rate override reason is required"); if (finalRate <= 0) throw fail("Rate must be greater than zero");
  const totals = calculateInvoiceTotals({ quantity: invoice.quantity, rate: finalRate, discountAmount: payload.discountAmount ?? invoice.discountAmount, taxAmount: payload.taxAmount ?? invoice.taxAmount });
  const terms = normalizeSaleTerms(payload.saleTerms ? payload : { saleTerms: invoice.saleTerms, receivedNow: invoice.receivedNowRequested, paymentAccountId: invoice.paymentAccountId }, totals.grandTotal);
  Object.assign(invoice, totals, terms, { finalRate, paymentAccountId: terms.receivedNowRequested > 0 ? (payload.paymentAccountId || invoice.paymentAccountId) : null, paymentMethod: terms.receivedNowRequested > 0 ? (payload.paymentMethod || invoice.paymentMethod || "cash") : "", receiptRequestKey: terms.receivedNowRequested > 0 ? (invoice.receiptRequestKey || clean(payload.receiptRequestKey) || `sale:${invoice._id}`) : "", rateOverrideReason: clean(payload.rateOverrideReason), rateChangedBy: finalRate !== invoice.originalRate ? actorId : null, rateChangedAt: finalRate !== invoice.originalRate ? new Date() : null, invoiceDate: clean(payload.invoiceDate) || invoice.invoiceDate, creditDays: Math.max(0, Math.trunc(Number(payload.creditDays ?? invoice.creditDays) || 0)), notes: clean(payload.notes) });
  invoice.dueDate = clean(payload.dueDate) || dueDateFromCreditDays(invoice.invoiceDate, invoice.creditDays); invoice.balanceDue = invoice.grandTotal; return invoice.save();
};

const voidInvoice = async (userId, invoiceId, actorId, reason) => {
  const invoice = await WeavingSalesInvoice.findOne({ _id: invoiceId, userId, status: "posted" }); if (!invoice) throw fail("Posted Invoice not found", 404);
  if (invoice.paidAmount > 0) throw fail("Reverse linked receipts before voiding this Invoice", 409);
  const reversal = await commercial.reverseJournal(userId, invoice.journalEntryId, new Date().toISOString().slice(0, 10), `Void ${invoice.invoiceNo}: ${clean(reason)}`);
  if (invoice.saleSource === "direct" && invoice.stockMovementId) {
    if (invoice.stockMovementModel === "WeavingYarnMovement") await WeavingYarnMovement.create({ userId, yarnId: invoice.yarnId, date: new Date().toISOString().slice(0, 10), movementType: "sale_return", ownershipType: "own", salesInvoiceId: invoice._id, quantityKg: invoice.quantity, godownId: invoice.godownId, rate: invoice.finalRate, notes: `Void ${invoice.invoiceNo}` });
    else await WeavingFabricMovement.create({ userId, date: new Date().toISOString().slice(0, 10), movementType: "sale_return", category: stockCategory(invoice), direction: "in", fabricQualityId: invoice.fabricQualityId, godownId: invoice.godownId, ownershipType: "own", meter: invoice.quantity, weightKg: invoice.weightKg, thanCount: invoice.thanCount, pieceCount: invoice.pieceCount, salesInvoiceId: invoice._id, notes: `Void ${invoice.invoiceNo}` });
  }
  invoice.status = "void"; invoice.activeForPakki = false; invoice.voidedAt = new Date(); invoice.voidedBy = actorId; invoice.voidReason = clean(reason); invoice.reversalJournalId = reversal?._id || null; await invoice.save();
  const sourcePakkiId = invoice.sourcePakkiId || invoice.pakkiId; if (sourcePakkiId) await WeavingPakkiSettlement.updateOne({ _id: sourcePakkiId, userId, invoiceId: invoice._id }, { $set: { invoiceId: null } });
  return invoice;
};

module.exports = {
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
  voidInvoice: costing.withCostingInvalidation(voidInvoice, "sale"),
  getFabricBalance,
  getFabricBalances,
  _test: { buildManagementMetrics, calculateSettlement, calculateInvoiceTotals, dueDateFromCreditDays, validateReceiptClassification, stockCategory, normalizeSaleTerms },
};
