const { receiptIdentity, productionIdentity } = require("./weavingProductionContextService");
const mongoose = require("mongoose");
const WeavingContract = require("../../models/WeavingContract");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingParty = require("../../models/WeavingParty");
const WeavingSizingBill = require("../../models/WeavingSizingBill");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const WeavingBeam = require("../../models/WeavingBeam");
const WeavingBeamSet = require("../../models/WeavingBeamSet");
const WeavingKnottingJob = require("../../models/WeavingKnottingJob");
const Account = require("../../models/Account");
const commercial = require("./weavingCommercialService");
const costing = require("./weavingCostingService");
const { normalizePacking, calculateYarnPacking } = require("./weavingPacking");
const { syncReceiptBeams } = require("./weavingBeamService");
const { getGodownBalance } = require("./weavingYarnStockService");
const { lbsFromKg } = require("./weavingOperationsUtils");

const { round } = commercial;
const fail = (message, statusCode = 400) =>
  Object.assign(new Error(message), { statusCode });
const clean = (value = "") => String(value || "").trim();

const atomicSave = (mutation) => async (userId, ...args) => {
  const session = await mongoose.startSession();
  try {
    // Never fall back to separate writes if transactions are unavailable.
    return await session.withTransaction(() => mutation(userId, ...args, session));
  } finally {
    await session.endSession();
  }
};

const createReceiptBundle = async (userId, payload, session) => {
  const receipt = await createReceipt(userId, payload.receipt || payload, session);
  const yarnReturn = payload.return
    ? await createReturn(userId, { ...payload.return, receiptId: receipt._id, issueId: receipt.issueId, sizingPartyId: receipt.sizingPartyId }, session)
    : null;
  const bill = payload.bill
    ? await createBill(userId, { ...payload.bill, receiptId: receipt._id }, session)
    : null;
  return { receipt, yarnReturn, bill };
};

const requireSizingParty = async (userId, id, session = null) => {
  const party = await WeavingParty.findOne({
    _id: id,
    userId,
    isActive: true,
    isHidden: { $ne: true },
    serviceTypes: "sizing",
  }).session(session);
  if (!party) throw fail("Valid Sizing Party is required");
  return party;
};

const resolveReceiptIssue = async (userId, sizingPartyId, requestedIssueId = null, session = null, existingIssueId = null) => {
  const fixedId = existingIssueId || requestedIssueId;
  if (fixedId) {
    const issue = await WeavingSizingIssue.findOne({ _id: fixedId, userId, sizingPartyId, status: "posted" }).session(session);
    if (!issue) throw fail("Linked Sizing Issue is invalid for this Party");
    return issue;
  }
  const used = await WeavingSizingReceipt.find({ userId, sizingPartyId, status: "posted", issueId: { $ne: null } }).session(session).distinct("issueId");
  const issue = await WeavingSizingIssue.findOne({ userId, sizingPartyId, status: "posted", _id: { $nin: used } })
    .sort({ date: 1, createdAt: 1, _id: 1 }).session(session);
  if (!issue) throw fail("No open Sizing Issue is available for this Sizing");
  return issue;
};

const createIssue = async (userId, payload, session = null) => {
  await requireSizingParty(userId, payload.sizingPartyId, session);
  if (!Array.isArray(payload.lines) || !payload.lines.length)
    throw fail("Add at least one yarn line");
  const identity = { contractId: null, fabricQualityId: null, ownershipType: "own", ownerPartyId: null };
  const lines = [];
  const reservedByStockKey = new Map();
  for (const source of payload.lines) {
    const [yarn, godown] = await Promise.all([
      WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }).session(session),
      WeavingGodown.findOne({
        _id: source.sourceGodownId,
        userId,
        isActive: true,
      }).session(session),
    ]);
    if (!yarn || !godown)
      throw fail("Valid Yarn and Source Godown are required");
    let packing;
    try { packing = calculateYarnPacking(source, yarn); } catch (error) { throw fail(error.message); }
    const quantityKg = packing.quantityKg;
    if (identity.ownershipType && ((source.ownershipType && source.ownershipType !== identity.ownershipType) ||
      (source.ownerPartyId && String(source.ownerPartyId) !== String(identity.ownerPartyId || "")))) throw fail("Yarn stock ownership must match the production context");
    const ownershipType = identity.ownershipType || source.ownershipType || "own";
    const ownerPartyId = ownershipType === "party" ? identity.ownerPartyId || source.ownerPartyId || null : null;
    if (ownershipType === "party" && !ownerPartyId)
      throw fail("Owner Party is required for Party Yarn");
    const available = await getGodownBalance({
      userId,
      yarnId: yarn._id,
      godownId: godown._id,
      ownershipType,
      ownerPartyId,
      session,
    });
    const stockKey = [
      yarn._id,
      godown._id,
      ownershipType,
      ownerPartyId || "own",
    ]
      .map(String)
      .join("|");
    const remaining = round(
      available.kg - (reservedByStockKey.get(stockKey) || 0),
    );
    if (quantityKg > remaining)
      throw fail(
        `Insufficient matching Godown stock. Available ${remaining} KG`,
      );
    reservedByStockKey.set(
      stockKey,
      round((reservedByStockKey.get(stockKey) || 0) + quantityKg),
    );
    lines.push({
      yarnId: yarn._id,
      quantityKg,
      ...packing,
      lotReference: clean(source.lotReference),
      sourceGodownId: godown._id,
      ownershipType,
      ownerPartyId,
    });
  }
  const issueNo = await commercial.nextNo(
    WeavingSizingIssue,
    userId,
    "issueNo",
    "SI",
    session,
  );
  const [issue] = await WeavingSizingIssue.create([{
    userId,
    issueNo,
    date: payload.date,
    sizingPartyId: payload.sizingPartyId,
    ...identity,
    gatePassNo: clean(payload.gatePassNo),
    notes: clean(payload.notes),
    lines,
  }], { session });
  const movements = await WeavingYarnMovement.insertMany(
    lines.map((line) => ({
      userId,
      yarnId: line.yarnId,
      date: payload.date,
      movementType: "sizing_issue",
      ownershipType: line.ownershipType,
      ownerPartyId: line.ownerPartyId,
      sizingIssueId: issue._id,
      contractId: issue.contractId,
      quantityKg: line.quantityKg,
      quantityLbs: line.quantityLbs,
      sourceEntryUnit: "LBS",
      destinationType: "direct_sizing",
      sizingPartyId: issue.sizingPartyId,
      sourceGodownId: line.sourceGodownId,
      packageType: line.packageType,
      packageQty: line.packageQty,
      coneSize: line.coneSize,
      conesPerPackage: line.conesPerPackage,
      extraCones: line.extraCones,
      totalCones: line.totalCones,
      smallCones: line.smallCones,
      largeCones: line.largeCones,
      packageWeight: line.packageWeight,
      packageWeightUnit: line.packageWeightUnit,
      smallConesPerPackage: line.smallConesPerPackage,
      largeConesPerPackage: line.largeConesPerPackage,
      lotReference: line.lotReference,
      notes: issue.notes,
    })), { session },
  );
  issue.movementIds = movements.map((row) => row._id);
  await issue.save({ session });
  return issue;
};

const createReceipt = async (userId, payload, session = null) => {
  await requireSizingParty(userId, payload.sizingPartyId, session);
  const issue = await resolveReceiptIssue(userId, payload.sizingPartyId, payload.issueId, session);
  const beamCount = Number(payload.beamCount) || 0;
  if (beamCount < 1) throw fail("Beam count is required");
  const gross = round(payload.yarnGrossWeightKg);
  const deductions = round(
    Number(payload.gullaWeightKg || 0) +
      Number(payload.packingWeightKg || 0) +
      Number(payload.bardanaWeightKg || 0),
  );
  if (deductions > gross) throw fail("Weight deductions cannot exceed Gross KG");
  const netWeightKg = round(Math.max(0, gross - deductions));
  const receiptNo = await commercial.nextNo(
    WeavingSizingReceipt,
    userId,
    "receiptNo",
    "SR", session,
  );
  if (!clean(payload.partyReceiptNo))
    throw fail("Party Receiving / Challan No. is required");
  const receipt = await new WeavingSizingReceipt({
    ...payload,
    userId,
    receiptNo,
    partyReceiptNo: clean(payload.partyReceiptNo),
    issueId: issue?._id || null,
    ...await receiptIdentity(userId, payload, issue, session),
    beamCount,
    netWeightKg,
    notes: clean(payload.notes),
  }).save({ session });
  const totalIssued =
    issue?.lines.reduce((sum, line) => sum + Number(line.quantityKg || 0), 0) ||
    0;
  const consumed = totalIssued
    ? netWeightKg > 0
      ? Math.min(netWeightKg, totalIssued)
      : totalIssued
    : 0;
  const movements = issue
    ? await WeavingYarnMovement.insertMany(
        issue.lines.map((line, index) => ({
          userId,
          yarnId: line.yarnId,
          date: payload.date,
          movementType: "sizing_receipt",
          ownershipType: line.ownershipType,
          ownerPartyId: line.ownerPartyId,
          sizingIssueId: issue._id,
          sizingReceiptId: receipt._id,
          contractId: receipt.contractId,
          quantityKg:
            index === issue.lines.length - 1
              ? round(
                  consumed -
                    issue.lines
                      .slice(0, -1)
                      .reduce(
                        (sum, item) =>
                          sum +
                          round((consumed * item.quantityKg) / totalIssued),
                        0,
                      ),
                )
              : round((consumed * line.quantityKg) / totalIssued),
          destinationType: "direct_sizing",
          sizingPartyId: receipt.sizingPartyId,
          lotReference: line.lotReference,
          notes: `Beam Receipt ${receiptNo}`,
        })), { session },
      )
    : [];
  receipt.movementIds = movements.map((row) => row._id);
  await receipt.save({ session });
  await syncReceiptBeams({ session, userId, receiptId: receipt._id });
  return receipt;
};

const createBill = async (userId, payload, session = null) => {
  const party = await requireSizingParty(userId, payload.sizingPartyId, session);
  const linkedReceipt = payload.receiptId ? await WeavingSizingReceipt.findOne({ _id: payload.receiptId, userId, sizingPartyId: party._id, status: "posted" }).session(session) : null;
  if (payload.receiptId && !linkedReceipt) throw fail("Linked Sizing Receiving is invalid for this Sizing");
  const weight = round(payload.billableWeightKg);
  const rate = round(payload.ratePerKg);
  if (weight <= 0 || rate < 0)
    throw fail("Billable weight and rate are required");
  const grossAmount = round(weight * rate);
  const gstPercent = round(payload.gstPercent);
  const gstAmount = round((grossAmount * gstPercent) / 100);
  const billAmount = round(grossAmount + gstAmount);
  const billNo = await commercial.nextNo(
    WeavingSizingBill,
    userId,
    "billNo",
    "SB", session,
  );
  const [partyAccount, expenseAccount, gstAccount] = [
    await (commercial.ensurePartyAccount(userId, party, session)),
    await (commercial.ensureAccount(userId, "WEAVING_SIZING_EXP", session)),
    await (gstAmount > 0
      ? commercial.ensureAccount(userId, "WEAVING_INPUT_GST", session)
      : null),
  ];
  const bill = await new WeavingSizingBill({
    userId,
    billNo,
    partyInvoiceNo: clean(payload.partyInvoiceNo),
    billDate: payload.billDate,
    sizingPartyId: party._id,
    receiptId: linkedReceipt?._id || null,
    billableWeightKg: weight,
    ratePerKg: rate,
    grossAmount,
    gstPercent,
    gstAmount,
    billAmount,
    creditDays: Number(payload.creditDays) || 0,
    dueDate: clean(payload.dueDate),
    balanceDue: billAmount,
    notes: clean(payload.notes),
  }).save({ session });
  const journal = await commercial._test.createJournal({ session,
    userId,
    date: payload.billDate,
    description: `Sizing Bill ${billNo} - ${party.name}`,
    sourceType: "purchase_invoice",
    originModule: "weaving.sizing.bill",
    referenceId: bill._id,
    billNo,
    lines: [
      { account: expenseAccount._id, type: "debit", amount: grossAmount },
      ...(gstAmount > 0
        ? [{ account: gstAccount._id, type: "debit", amount: gstAmount }]
        : []),
      { account: partyAccount._id, type: "credit", amount: billAmount },
    ],
  });
  bill.journalEntryId = journal._id;
  const paidNow = round(payload.paidNow);
  if (paidNow > 0) {
    if (paidNow > billAmount) throw fail("Payment exceeds bill amount");
    const payment = await commercial.postMoneyTransaction({ session,
      userId,
      payload: {
        type: "pay",
        partyId: party._id,
        sizingBillId: bill._id,
        amount: paidNow,
        paymentAccountId: payload.paymentAccountId,
        paymentMethod: payload.paymentMethod,
        chequeNo: payload.chequeNo,
        chequeBank: payload.chequeBank,
        chequeDate: payload.chequeDate,
        date: payload.billDate,
        description: `Paid against ${billNo}`,
      },
    });
    bill.paidAmount = paidNow;
    bill.balanceDue = round(billAmount - paidNow);
    bill.paymentStatus = bill.balanceDue <= 0 ? "paid" : "partial";
    bill.paymentTransactionIds.push(payment._id);
  }
  await bill.save({ session });
  return bill;
};

const createReturn = async (userId, payload, session = null) => {
  await requireSizingParty(userId, payload.sizingPartyId, session);
  const source = payload.issueId
    ? await WeavingSizingIssue.findOne({
        _id: payload.issueId,
        userId,
        sizingPartyId: payload.sizingPartyId,
        status: "posted",
      }).session(session)
    : null;
  const derivedYarnId = source?.lines?.[0]?.yarnId || payload.yarnId;
  const [yarn, godown] = await Promise.all([
    WeavingYarn.findOne({ _id: derivedYarnId, userId, isActive: true }).session(session),
    WeavingGodown.findOne({ _id: payload.destinationGodownId, userId, isActive: true }).session(session),
  ]);
  if (!yarn || !godown) throw fail("Yarn and Destination Godown are required");
  if (source?.lines?.length > 1) throw fail("This legacy Issue contains multiple Yarns; save the Return from its original record");
  const sourceLine = source?.lines?.[0];
  let packing;
  try { packing = calculateYarnPacking({
      ...payload,
      smallCones: payload.returnedSmallCones,
      largeCones: payload.returnedLargeCones,
    }, yarn); } catch (error) { throw fail(error.message); }
  if (!clean(payload.partyReturnNo))
    throw fail("Party Return / Challan No. is required");
  return new WeavingYarnMovement({
    userId,
    yarnId: yarn._id,
    date: payload.date,
    movementType: "sizing_return",
    ownershipType:
      sourceLine?.ownershipType ||
      (payload.ownershipType === "party" ? "party" : "own"),
    ownerPartyId: sourceLine?.ownerPartyId || payload.ownerPartyId || null,
    sizingIssueId: source?._id || null,
    sizingReceiptId: payload.receiptId || null,
    contractId: payload.contractId || source?.contractId || null,
    quantityKg: packing.quantityKg,
    quantityLbs: packing.quantityLbs,
    sourceEntryUnit: "LBS",
    destinationType: "godown",
    godownId: godown._id,
    sizingPartyId: payload.sizingPartyId,
    returnNo: await commercial.nextNo(
      WeavingYarnMovement,
      userId,
      "returnNo",
      "SRN", session,
    ),
    partyReturnNo: clean(payload.partyReturnNo),
    ...packing,
    lotReference: clean(payload.lotReference),
    notes: clean(payload.notes),
  }).save({ session });
};

const dependencyError = (message) =>
  fail(`Cannot change this posted Sizing record: ${message}`, 409);
const assertReceiptUnused = async (userId, receiptId, session = null) => {
  const [set, beam, knotting] = [
    await (WeavingBeamSet.findOne({
      userId,
      sizingReceiptId: receiptId,
      status: { $ne: "available" },
    }).session(session)),
    await (WeavingBeam.findOne({
      userId,
      sizingReceiptId: receiptId,
      status: { $ne: "available" },
    }).session(session)),
    await (WeavingKnottingJob.findOne({
      userId,
      sizingReceiptId: receiptId,
      status: { $ne: "void" },
    }).session(session)),
  ];
  if (knotting) throw dependencyError("the receipt has a Knotting job");
  if (beam || set)
    throw dependencyError(
      "the receipt's beams have been used by Knotting, Loom, or Production",
    );
};
const voidReturn = async (userId, id, reason = "") => {
  const row = await WeavingYarnMovement.findOne({
    _id: id,
    userId,
    movementType: "sizing_return",
    isVoided: { $ne: true },
  });
  if (!row) throw fail("Posted Sizing return not found", 404);
  row.isVoided = true;
  row.notes = `${row.notes || ""}${row.notes ? " | " : ""}VOID: ${clean(reason)}`;
  await row.save();
  return row;
};
const voidBill = async (userId, id, reason = "") => {
  const bill = await WeavingSizingBill.findOne({
    _id: id,
    userId,
    status: "posted",
  });
  if (!bill) throw fail("Posted Sizing bill not found", 404);
  const payments = await Promise.all(
    bill.paymentTransactionIds.map((paymentId) =>
      commercial.voidMoneyTransaction(
        userId,
        paymentId,
        `Sizing Bill ${bill.billNo} voided: ${clean(reason)}`,
      ),
    ),
  );
  await commercial.reverseJournal(
    userId,
    bill.journalEntryId,
    new Date().toISOString().slice(0, 10),
    `Void Sizing Bill ${bill.billNo}: ${clean(reason)}`,
  );
  bill.status = "void";
  bill.voidedAt = new Date();
  bill.notes = `${bill.notes || ""}${bill.notes ? " | " : ""}VOID: ${clean(reason)}`;
  await bill.save();
  return { bill, payments };
};
const voidIssue = async (userId, id, reason = "") => {
  const issue = await WeavingSizingIssue.findOne({
    _id: id,
    userId,
    status: "posted",
  });
  if (!issue) throw fail("Posted Sizing issue not found", 404);
  if (
    await WeavingSizingReceipt.exists({
      userId,
      issueId: issue._id,
      status: "posted",
    })
  )
    throw dependencyError("it is linked to a Sizing Receiving");
  if (
    await WeavingYarnMovement.exists({
      userId,
      sizingIssueId: issue._id,
      movementType: "sizing_return",
      isVoided: { $ne: true },
    })
  )
    throw dependencyError("it is linked to a Yarn Return");
  await WeavingYarnMovement.updateMany(
    { userId, sizingIssueId: issue._id, isVoided: { $ne: true } },
    { $set: { isVoided: true } },
  );
  issue.status = "void";
  issue.voidedAt = new Date();
  await issue.save();
  return issue;
};
const voidReceiptBundle = async (userId, id, reason = "") => {
  const receipt = await WeavingSizingReceipt.findOne({
    _id: id,
    userId,
    status: "posted",
  });
  if (!receipt) throw fail("Posted Sizing receiving not found", 404);
  await assertReceiptUnused(userId, receipt._id);
  const bills = await WeavingSizingBill.find({
    userId,
    receiptId: receipt._id,
    status: "posted",
  });
  for (const bill of bills)
    await voidBill(
      userId,
      bill._id,
      `Receiving ${receipt.receiptNo} voided: ${clean(reason)}`,
    );
  const returns = await WeavingYarnMovement.find({
    userId,
    sizingReceiptId: receipt._id,
    movementType: "sizing_return",
    isVoided: { $ne: true },
  });
  for (const row of returns)
    await voidReturn(
      userId,
      row._id,
      `Receiving ${receipt.receiptNo} voided: ${clean(reason)}`,
    );
  await WeavingYarnMovement.updateMany(
    {
      userId,
      sizingReceiptId: receipt._id,
      movementType: "sizing_receipt",
      isVoided: { $ne: true },
    },
    { $set: { isVoided: true } },
  );
  receipt.status = "void";
  receipt.voidedAt = new Date();
  await receipt.save();
  return receipt;
};

const updateIssue = async (userId, id, payload, session = null) => {
  const issue = await WeavingSizingIssue.findOne({
    _id: id,
    userId,
    status: "posted",
  }).session(session);
  if (!issue) throw fail("Posted Sizing issue not found", 404);
  const identityPayload = { ...payload };
  for (const field of ["contractId", "fabricQualityId", "ownershipType", "ownerPartyId"]) if (!Object.prototype.hasOwnProperty.call(identityPayload, field)) identityPayload[field] = issue[field];
  const identity = await productionIdentity(userId, identityPayload, { existing: issue, session, requireIdentity: false });
  if (
    await WeavingSizingReceipt.exists({
      userId,
      issueId: issue._id,
      status: "posted",
    }).session(session)
  )
    throw dependencyError("it is linked to a Sizing Receiving");
  if (
    await WeavingYarnMovement.exists({
      userId,
      sizingIssueId: issue._id,
      movementType: "sizing_return",
      isVoided: { $ne: true },
    }).session(session)
  )
    throw dependencyError("it is linked to a Yarn Return");
  await requireSizingParty(userId, payload.sizingPartyId, session);
  if (!Array.isArray(payload.lines) || payload.lines.length < 1)
    throw fail("Add at least one yarn line");
  const lines = [];
  for (const source of payload.lines) {
    const [yarn, godown] = await Promise.all([
      WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }).session(session),
      WeavingGodown.findOne({
        _id: source.sourceGodownId,
        userId,
        isActive: true,
      }).session(session),
    ]);
    if (!yarn || !godown) throw fail("Valid Yarn and Source Godown are required");
    let packing;
    const priorLine = issue.lines.find((line) => String(line.yarnId) === String(yarn._id) && String(line.sourceGodownId) === String(godown._id));
    const isLegacyWeightOnly = priorLine && !Number(source.packageQty || 0) && !Number(source.smallCones || 0) && !Number(source.largeCones || 0) && Number(priorLine.quantityKg || 0) > 0;
    if (isLegacyWeightOnly) {
      packing = { ...normalizePacking(source, yarn), quantityKg: round(priorLine.quantityKg), quantityLbs: Number(priorLine.quantityLbs || lbsFromKg(priorLine.quantityKg)),
        packageWeight: Number(priorLine.packageWeight || 0), packageWeightUnit: priorLine.packageWeightUnit || "LBS",
        smallConesPerPackage: Number(priorLine.smallConesPerPackage || 0), largeConesPerPackage: Number(priorLine.largeConesPerPackage || 0) };
    } else {
      try { packing = calculateYarnPacking(source, yarn); } catch (error) { throw fail(error.message); }
    }
    const quantityKg = packing.quantityKg;
    if (identity.ownershipType && ((source.ownershipType && source.ownershipType !== identity.ownershipType) ||
      (source.ownerPartyId && String(source.ownerPartyId) !== String(identity.ownerPartyId || "")))) throw fail("Yarn stock ownership must match the production context");
    const ownershipType = identity.ownershipType || source.ownershipType || "own";
    const ownerPartyId = ownershipType === "party" ? identity.ownerPartyId || source.ownerPartyId || null : null;
    const oldAvailable = issue.lines
      .filter(
        (line) =>
          String(line.yarnId) === String(yarn._id) &&
          String(line.sourceGodownId) === String(godown._id) &&
          line.ownershipType === ownershipType &&
          String(line.ownerPartyId || "") === String(ownerPartyId || ""),
      )
      .reduce((sum, line) => sum + Number(line.quantityKg || 0), 0);
    const available = await getGodownBalance({
      userId,
      yarnId: yarn._id,
      godownId: godown._id,
      ownershipType,
      ownerPartyId,
      session,
    });
    if (quantityKg > round(available.kg + oldAvailable))
      throw fail(
        `Insufficient matching Godown stock. Available ${round(available.kg + oldAvailable)} KG`,
      );
    lines.push({
      yarnId: yarn._id,
      quantityKg,
      ...packing,
      lotReference: clean(source.lotReference),
      sourceGodownId: godown._id,
      ownershipType,
      ownerPartyId,
    });
  }
  await WeavingYarnMovement.updateMany(
    {
      userId,
      sizingIssueId: issue._id,
      movementType: "sizing_issue",
      isVoided: { $ne: true },
    },
    { $set: { isVoided: true } }, { session },
  );
  Object.assign(issue, {
    date: payload.date,
    sizingPartyId: payload.sizingPartyId,
    ...identity,
    gatePassNo: clean(payload.gatePassNo),
    notes: clean(payload.notes),
    lines,
  });
  const movements = await WeavingYarnMovement.insertMany(
    lines.map((line) => ({
      userId,
      yarnId: line.yarnId,
      date: issue.date,
      movementType: "sizing_issue",
      ownershipType: line.ownershipType,
      ownerPartyId: line.ownerPartyId,
      sizingIssueId: issue._id,
      contractId: issue.contractId,
      quantityKg: line.quantityKg,
      quantityLbs: line.quantityLbs,
      sourceEntryUnit: "LBS",
      destinationType: "direct_sizing",
      sizingPartyId: issue.sizingPartyId,
      sourceGodownId: line.sourceGodownId,
      packageType: line.packageType,
      packageQty: line.packageQty,
      coneSize: line.coneSize,
      conesPerPackage: line.conesPerPackage,
      extraCones: line.extraCones,
      totalCones: line.totalCones,
      smallCones: line.smallCones,
      largeCones: line.largeCones,
      packageWeight: line.packageWeight,
      packageWeightUnit: line.packageWeightUnit,
      smallConesPerPackage: line.smallConesPerPackage,
      largeConesPerPackage: line.largeConesPerPackage,
      lotReference: line.lotReference,
      notes: issue.notes,
    })), { session },
  );
  issue.movementIds.push(...movements.map((row) => row._id));
  await issue.save({ session });
  return issue;
};

const updateReturn = async (userId, id, payload, session = null) => {
  const old = await WeavingYarnMovement.findOne({
    _id: id,
    userId,
    movementType: "sizing_return",
    isVoided: { $ne: true },
  }).session(session);
  if (!old) throw fail("Posted Sizing return not found", 404);
  await requireSizingParty(userId, payload.sizingPartyId, session);
  const [yarn, godown] = [
    await (WeavingYarn.findOne({ _id: payload.yarnId, userId, isActive: true }).session(session)),
    await (WeavingGodown.findOne({
      _id: payload.destinationGodownId,
      userId,
      isActive: true,
    }).session(session)),
  ];
  if (!yarn || !godown) throw fail("Yarn and Destination Godown are required");
  const source = payload.issueId
    ? await WeavingSizingIssue.findOne({
        _id: payload.issueId,
        userId,
        status: "posted",
      }).session(session)
    : null;
  const sourceLine = source?.lines?.find(
    (line) => String(line.yarnId) === String(yarn._id),
  );
  let packing;
  const legacyWeightOnly = !Number(payload.packageQty || 0) && !Number(payload.returnedSmallCones || 0) && !Number(payload.returnedLargeCones || 0) && Number(old.quantityKg || 0) > 0;
  if (legacyWeightOnly) packing = { ...normalizePacking(payload, yarn), quantityKg: round(old.quantityKg), quantityLbs: Number(old.quantityLbs || lbsFromKg(old.quantityKg)) };
  else try { packing = calculateYarnPacking({ ...payload, smallCones: payload.returnedSmallCones, largeCones: payload.returnedLargeCones }, yarn); } catch (error) { throw fail(error.message); }
  old.isVoided = true;
  old.notes = `${old.notes || ""}${old.notes ? " | " : ""}VOID: edited and replaced`;
  await old.save({ session });
  return new WeavingYarnMovement({
    userId,
    yarnId: yarn._id,
    date: payload.date,
    movementType: "sizing_return",
    ownershipType: sourceLine?.ownershipType || old.ownershipType,
    ownerPartyId: sourceLine?.ownerPartyId || old.ownerPartyId,
    sizingIssueId: source?._id || old.sizingIssueId,
    sizingReceiptId: payload.receiptId || old.sizingReceiptId,
    contractId: payload.contractId || source?.contractId || old.contractId,
    quantityKg: packing.quantityKg,
    quantityLbs: packing.quantityLbs,
    sourceEntryUnit: "LBS",
    destinationType: "godown",
    godownId: godown._id,
    sizingPartyId: payload.sizingPartyId,
    returnNo: old.returnNo,
    partyReturnNo: clean(payload.partyReturnNo),
    ...packing,
    lotReference: clean(payload.lotReference),
    notes: clean(payload.notes),
  }).save({ session });
};

const rebuildBill = async (userId, bill, payload, session = null) => {
  const party = await requireSizingParty(userId, payload.sizingPartyId, session);
  const weight = round(payload.billableWeightKg);
  const rate = round(payload.ratePerKg);
  if (weight <= 0 || rate < 0)
    throw fail("Billable weight and rate are required");
  const grossAmount = round(weight * rate);
  const gstPercent = round(payload.gstPercent);
  const gstAmount = round((grossAmount * gstPercent) / 100);
  const billAmount = round(grossAmount + gstAmount);
  const paidNow = round(payload.paidNow);
  if (paidNow > billAmount) throw fail("Payment exceeds bill amount");
  const [partyAccount, expenseAccount, gstAccount] = [
    await (commercial.ensurePartyAccount(userId, party, session)),
    await (commercial.ensureAccount(userId, "WEAVING_SIZING_EXP", session)),
    await (gstAmount > 0
      ? commercial.ensureAccount(userId, "WEAVING_INPUT_GST", session)
      : null),
  ];
  const journal = await commercial.createJournal({ session,
    userId,
    date: payload.billDate,
    description: `Sizing Bill ${bill.billNo} - ${party.name}`,
    sourceType: "purchase_invoice",
    originModule: "weaving.sizing.bill",
    referenceId: bill._id,
    billNo: bill.billNo,
    lines: [
      { account: expenseAccount._id, type: "debit", amount: grossAmount },
      ...(gstAmount > 0
        ? [{ account: gstAccount._id, type: "debit", amount: gstAmount }]
        : []),
      { account: partyAccount._id, type: "credit", amount: billAmount },
    ],
  });
  Object.assign(bill, {
    partyInvoiceNo: clean(payload.partyInvoiceNo),
    billDate: payload.billDate,
    sizingPartyId: party._id,
    receiptId: payload.receiptId || bill.receiptId || null,
    billableWeightKg: weight,
    ratePerKg: rate,
    grossAmount,
    gstPercent,
    gstAmount,
    billAmount,
    creditDays: Number(payload.creditDays) || 0,
    dueDate: clean(payload.dueDate),
    paidAmount: 0,
    balanceDue: billAmount,
    paymentStatus: "unpaid",
    journalEntryId: journal._id,
    paymentTransactionIds: [],
    notes: clean(payload.notes),
  });
  if (paidNow > 0) {
    const payment = await commercial.postMoneyTransaction({ session,
      userId,
      payload: {
        type: "pay",
        partyId: party._id,
        sizingBillId: bill._id,
        amount: paidNow,
        paymentAccountId: payload.paymentAccountId,
        paymentMethod: payload.paymentMethod,
        chequeNo: payload.chequeNo,
        chequeBank: payload.chequeBank,
        chequeDate: payload.chequeDate,
        date: payload.billDate,
        description: `Paid against ${bill.billNo}`,
      },
    });
    bill.paidAmount = paidNow;
    bill.balanceDue = round(billAmount - paidNow);
    bill.paymentStatus = bill.balanceDue <= 0 ? "paid" : "partial";
    bill.paymentTransactionIds = [payment._id];
  }
  await bill.save({ session });
  return bill;
};
const updateBill = async (userId, id, payload, session = null) => {
  const bill = await WeavingSizingBill.findOne({
    _id: id,
    userId,
    status: "posted",
  }).session(session);
  if (!bill) throw fail("Posted Sizing bill not found", 404);
  const proposedTotal = round(
    round(payload.billableWeightKg) *
      round(payload.ratePerKg) *
      (1 + round(payload.gstPercent) / 100),
  );
  const paidNow = round(payload.paidNow);
  if (round(payload.billableWeightKg) <= 0 || round(payload.ratePerKg) < 0)
    throw fail("Billable weight and rate are required");
  if (paidNow > proposedTotal) throw fail("Payment exceeds bill amount");
  if (
    paidNow > 0 &&
    !(await Account.exists({
      _id: payload.paymentAccountId,
      userId,
      moduleScope: "weaving",
      isActive: { $ne: false },
    }).session(session))
  )
    throw fail("Valid Payment Account is required");
  if (
    paidNow > 0 &&
    payload.paymentMethod === "cheque" &&
    (!clean(payload.chequeNo) || !clean(payload.chequeDate))
  )
    throw fail("Cheque Number and Cheque Date are required");
  for (const paymentId of bill.paymentTransactionIds)
    await commercial.voidMoneyTransaction(
      userId,
      paymentId,
      `Sizing Bill ${bill.billNo} edited`, session,
    );
  await commercial.reverseJournal(
    userId,
    bill.journalEntryId,
    new Date().toISOString().slice(0, 10),
    `Edit Sizing Bill ${bill.billNo}`, session,
  );
  return rebuildBill(userId, bill, payload, session);
};

const updateReceiptBundle = async (userId, id, payload, session = null) => {
  const receipt = await WeavingSizingReceipt.findOne({
    _id: id,
    userId,
    status: "posted",
  }).session(session);
  if (!receipt) throw fail("Posted Sizing receiving not found", 404);
  await assertReceiptUnused(userId, receipt._id, session);
  await requireSizingParty(userId, payload.receipt.sizingPartyId, session);
  const issue = await resolveReceiptIssue(userId, payload.receipt.sizingPartyId, payload.receipt.issueId, session, receipt.issueId);
  const beamCount = Number(payload.receipt.beamCount) || 0;
  if (beamCount < 1) throw fail("Beam count is required");
  const gross = round(payload.receipt.yarnGrossWeightKg);
  const deductions = round(Number(payload.receipt.gullaWeightKg || 0) + Number(payload.receipt.packingWeightKg || 0) + Number(payload.receipt.bardanaWeightKg || 0));
  if (deductions > gross) throw fail("Weight deductions cannot exceed Gross KG");
  const netWeightKg = round(Math.max(0, gross - deductions));
  const existingReturn = await WeavingYarnMovement.findOne({
    userId,
    sizingReceiptId: receipt._id,
    movementType: "sizing_return",
    isVoided: { $ne: true },
  }).session(session);
  const existingBill = await WeavingSizingBill.findOne({
    userId,
    receiptId: receipt._id,
    status: "posted",
  }).session(session);
  if (
    String(receipt.sizingPartyId) !== String(payload.receipt.sizingPartyId) &&
    ((existingReturn && !payload.return) || (existingBill && !payload.bill))
  )
    throw dependencyError(
      "change the linked Return/Bill party too, or keep the original Sizing Party",
    );
  if (existingReturn && payload.return)
    await updateReturn(userId, existingReturn._id, {
      ...payload.return,
      receiptId: receipt._id,
    }, session);
  else if (!existingReturn && payload.return)
    await createReturn(userId, { ...payload.return, receiptId: receipt._id }, session);
  if (existingBill && payload.bill)
    await updateBill(userId, existingBill._id, {
      ...payload.bill,
      receiptId: receipt._id,
    }, session);
  else if (!existingBill && payload.bill)
    await createBill(userId, { ...payload.bill, receiptId: receipt._id }, session);
  await WeavingYarnMovement.updateMany(
    {
      userId,
      sizingReceiptId: receipt._id,
      movementType: "sizing_receipt",
      isVoided: { $ne: true },
    },
    { $set: { isVoided: true } },
  ).session(session);
  Object.assign(receipt, {
    ...payload.receipt,
    receiptNo: receipt.receiptNo,
    userId,
    ...await receiptIdentity(userId, payload.receipt, issue, session, receipt),
    beamCount,
    netWeightKg,
    partyReceiptNo: clean(payload.receipt.partyReceiptNo),
    notes: clean(payload.receipt.notes),
  });
  const totalIssued =
    issue?.lines.reduce((sum, line) => sum + Number(line.quantityKg || 0), 0) ||
    0;
  const consumed = totalIssued
    ? netWeightKg > 0
      ? Math.min(netWeightKg, totalIssued)
      : totalIssued
    : 0;
  const movements = issue
    ? await WeavingYarnMovement.insertMany(
        issue.lines.map((line, index) => ({
          userId,
          yarnId: line.yarnId,
          date: receipt.date,
          movementType: "sizing_receipt",
          ownershipType: line.ownershipType,
          ownerPartyId: line.ownerPartyId,
          sizingIssueId: issue._id,
          sizingReceiptId: receipt._id,
          contractId: receipt.contractId,
          quantityKg:
            index === issue.lines.length - 1
              ? round(
                  consumed -
                    issue.lines
                      .slice(0, -1)
                      .reduce(
                        (sum, item) =>
                          sum +
                          round((consumed * item.quantityKg) / totalIssued),
                        0,
                      ),
                )
              : round((consumed * line.quantityKg) / totalIssued),
          destinationType: "direct_sizing",
          sizingPartyId: receipt.sizingPartyId,
          lotReference: line.lotReference,
          notes: `Beam Receipt ${receipt.receiptNo}`,
        })), { session },
      )
    : [];
  receipt.movementIds.push(...movements.map((row) => row._id));
  await receipt.save({ session });
  await WeavingBeam.deleteMany({
    userId,
    sizingReceiptId: receipt._id,
    status: "available",
    beamIndex: { $gt: beamCount },
  }).session(session);
  await syncReceiptBeams({ session, userId, receiptId: receipt._id });
  return receipt;
};

const materialLedger = async (userId, query = {}) => {
  const filter = {
    userId,
    isVoided: { $ne: true },
    $or: [
      {
        movementType: { $in: ["purchase_in", "party_inward"] },
        destinationType: "direct_sizing",
      },
      {
        movementType: {
          $in: ["sizing_issue", "sizing_receipt", "sizing_return"],
        },
      },
    ],
  };
  if (query.sizingPartyId) filter.sizingPartyId = query.sizingPartyId;
  if (query.yarnId) filter.yarnId = query.yarnId;
  if (query.ownershipType) filter.ownershipType = query.ownershipType;
  if (query.from || query.to)
    filter.date = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  const movements = await WeavingYarnMovement.find(filter)
    .populate("yarnId", "name count")
    .populate("sizingPartyId ownerPartyId", "name")
    .populate("contractId", "contractNo")
    .sort({ date: 1, createdAt: 1 })
    .lean();
  const balances = new Map();
  return movements.map((row) => {
    const key = `${row.sizingPartyId?._id}:${row.yarnId?._id}:${row.ownershipType}:${row.ownerPartyId?._id || "own"}`;
    const inbound = !["sizing_receipt", "sizing_return"].includes(
      row.movementType,
    );
    const sign = inbound ? 1 : -1;
    const previous = balances.get(key) || {
      kg: 0,
      packages: 0,
      small: 0,
      large: 0,
    };
    const current = {
      kg: round(previous.kg + sign * row.quantityKg),
      packages: round(previous.packages + sign * row.packageQty),
      small: round(previous.small + sign * row.smallCones),
      large: round(previous.large + sign * row.largeCones),
    };
    balances.set(key, current);
    const label =
      row.movementType === "purchase_in" || row.movementType === "party_inward"
        ? "Direct Purchase Inward"
        : row.movementType === "sizing_issue"
          ? "Yarn Issue"
          : row.movementType === "sizing_return"
            ? "Yarn Return"
            : "Beam Receiving Adjustment";
    return {
      ...row,
      movementLabel: label,
      inKg: inbound ? row.quantityKg : 0,
      outKg: inbound ? 0 : row.quantityKg,
      packageIn: inbound ? row.packageQty : 0,
      packageOut: inbound ? 0 : row.packageQty,
      smallConesIn: inbound ? row.smallCones : 0,
      smallConesOut: inbound ? 0 : row.smallCones,
      largeConesIn: inbound ? row.largeCones : 0,
      largeConesOut: inbound ? 0 : row.largeCones,
      balanceKg: current.kg,
      balancePackages: current.packages,
      balanceSmallCones: current.small,
      balanceLargeCones: current.large,
    };
  });
};

module.exports = {
  requireSizingParty,
  createIssue: costing.withCostingInvalidation(atomicSave(createIssue), "sizing"),
  createReceipt: costing.withCostingInvalidation(atomicSave(createReceipt), "sizing"),
  createReceiptBundle: costing.withCostingInvalidation(atomicSave(createReceiptBundle), "sizing"),
  createBill: costing.withCostingInvalidation(atomicSave(createBill), "sizing"),
  createReturn: costing.withCostingInvalidation(atomicSave(createReturn), "sizing"),
  voidIssue: costing.withCostingInvalidation(voidIssue, "sizing"),
  voidReturn: costing.withCostingInvalidation(voidReturn, "sizing"),
  voidBill: costing.withCostingInvalidation(voidBill, "sizing"),
  voidReceiptBundle: costing.withCostingInvalidation(
    voidReceiptBundle,
    "sizing",
  ),
  updateIssue: costing.withCostingInvalidation(atomicSave(updateIssue), "sizing"),
  updateReturn: costing.withCostingInvalidation(atomicSave(updateReturn), "sizing"),
  updateBill: costing.withCostingInvalidation(atomicSave(updateBill), "sizing"),
  updateReceiptBundle: costing.withCostingInvalidation(
    atomicSave(updateReceiptBundle),
    "sizing",
  ),
  materialLedger,
};
