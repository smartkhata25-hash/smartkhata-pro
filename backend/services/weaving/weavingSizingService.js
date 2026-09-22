const WeavingContract = require("../../models/WeavingContract");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingParty = require("../../models/WeavingParty");
const WeavingSizingBill = require("../../models/WeavingSizingBill");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const commercial = require("./weavingCommercialService");
const costing = require("./weavingCostingService");
const { normalizePacking } = require("./weavingPacking");
const { syncReceiptBeams } = require("./weavingBeamService");
const { getGodownBalance } = require("./weavingYarnStockService");

const { round } = commercial;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const clean = (value = "") => String(value || "").trim();

const requireSizingParty = async (userId, id) => {
  const party = await WeavingParty.findOne({ _id: id, userId, isActive: true, isHidden: { $ne: true }, serviceTypes: "sizing" });
  if (!party) throw fail("Valid Sizing Party is required");
  return party;
};

const createIssue = async (userId, payload) => {
  await requireSizingParty(userId, payload.sizingPartyId);
  if (!Array.isArray(payload.lines) || !payload.lines.length) throw fail("Add at least one yarn line");
  const lines = [];
  const reservedByStockKey = new Map();
  for (const source of payload.lines) {
    const quantityKg = round(source.quantityKg);
    if (quantityKg <= 0) throw fail("Yarn quantity must be greater than zero");
    const [yarn, godown] = await Promise.all([
      WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }),
      WeavingGodown.findOne({ _id: source.sourceGodownId, userId, isActive: true }),
    ]);
    if (!yarn || !godown) throw fail("Valid Yarn and Source Godown are required");
    const packing = normalizePacking(source, yarn);
    const ownershipType = source.ownershipType === "party" ? "party" : "own";
    const ownerPartyId = ownershipType === "party" ? source.ownerPartyId || null : null;
    if (ownershipType === "party" && !ownerPartyId) throw fail("Owner Party is required for Party Yarn");
    const available = await getGodownBalance({ userId, yarnId: yarn._id, godownId: godown._id, ownershipType, ownerPartyId });
    const stockKey = [yarn._id, godown._id, ownershipType, ownerPartyId || "own"].map(String).join("|");
    const remaining = round(available.kg - (reservedByStockKey.get(stockKey) || 0));
    if (quantityKg > remaining) throw fail(`Insufficient matching Godown stock. Available ${remaining} KG`);
    reservedByStockKey.set(stockKey, round((reservedByStockKey.get(stockKey) || 0) + quantityKg));
    lines.push({ yarnId: yarn._id, quantityKg, ...packing, lotReference: clean(source.lotReference), sourceGodownId: godown._id, ownershipType, ownerPartyId });
  }
  const issueNo = clean(payload.issueNo) || await commercial.nextNo(WeavingSizingIssue, userId, "issueNo", "SI");
  const issue = await WeavingSizingIssue.create({ userId, issueNo, date: payload.date, sizingPartyId: payload.sizingPartyId, contractId: payload.contractId || null, gatePassNo: clean(payload.gatePassNo), notes: clean(payload.notes), lines });
  const movements = await WeavingYarnMovement.insertMany(lines.map((line) => ({ userId, yarnId: line.yarnId, date: payload.date, movementType: "sizing_issue", ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, sizingIssueId: issue._id, contractId: issue.contractId, quantityKg: line.quantityKg, destinationType: "direct_sizing", sizingPartyId: issue.sizingPartyId, sourceGodownId: line.sourceGodownId, packageType: line.packageType, packageQty: line.packageQty, coneSize: line.coneSize, conesPerPackage: line.conesPerPackage, extraCones: line.extraCones, totalCones: line.totalCones, smallCones: line.smallCones, largeCones: line.largeCones, lotReference: line.lotReference, notes: issue.notes })));
  issue.movementIds = movements.map((row) => row._id); await issue.save(); return issue;
};

const createReceipt = async (userId, payload) => {
  await requireSizingParty(userId, payload.sizingPartyId);
  const issue = await WeavingSizingIssue.findOne({ _id: payload.issueId, userId, sizingPartyId: payload.sizingPartyId, status: "posted" });
  if (!issue) throw fail("Valid Sizing Issue is required");
  const beamCount = Number(payload.beamCount) || 0; if (beamCount < 1) throw fail("Beam count is required");
  const gross = round(payload.yarnGrossWeightKg); const deductions = round(Number(payload.gullaWeightKg || 0) + Number(payload.packingWeightKg || 0) + Number(payload.bardanaWeightKg || 0));
  const netWeightKg = round(payload.netWeightKg || Math.max(0, gross - deductions));
  const receiptNo = clean(payload.receiptNo) || await commercial.nextNo(WeavingSizingReceipt, userId, "receiptNo", "SR");
  const receipt = await WeavingSizingReceipt.create({ ...payload, userId, receiptNo, contractId: payload.contractId || issue.contractId || null, beamCount, netWeightKg, notes: clean(payload.notes) });
  const totalIssued = issue.lines.reduce((sum, line) => sum + Number(line.quantityKg || 0), 0);
  const consumed = netWeightKg > 0 ? Math.min(netWeightKg, totalIssued) : totalIssued;
  const movements = await WeavingYarnMovement.insertMany(issue.lines.map((line, index) => ({ userId, yarnId: line.yarnId, date: payload.date, movementType: "sizing_receipt", ownershipType: line.ownershipType, ownerPartyId: line.ownerPartyId, sizingIssueId: issue._id, sizingReceiptId: receipt._id, contractId: receipt.contractId, quantityKg: index === issue.lines.length - 1 ? round(consumed - issue.lines.slice(0, -1).reduce((sum, item) => sum + round(consumed * item.quantityKg / totalIssued), 0)) : round(consumed * line.quantityKg / totalIssued), destinationType: "direct_sizing", sizingPartyId: receipt.sizingPartyId, lotReference: line.lotReference, notes: `Beam Receipt ${receiptNo}` })));
  receipt.movementIds = movements.map((row) => row._id); await receipt.save();
  await syncReceiptBeams({ userId, receiptId: receipt._id });
  return receipt;
};

const createBill = async (userId, payload) => {
  const party = await requireSizingParty(userId, payload.sizingPartyId);
  const weight = round(payload.billableWeightKg); const rate = round(payload.ratePerKg);
  if (weight <= 0 || rate < 0) throw fail("Billable weight and rate are required");
  const grossAmount = round(weight * rate); const gstPercent = round(payload.gstPercent); const gstAmount = round(grossAmount * gstPercent / 100); const billAmount = round(grossAmount + gstAmount);
  const billNo = clean(payload.billNo) || await commercial.nextNo(WeavingSizingBill, userId, "billNo", "SB");
  const [partyAccount, expenseAccount, gstAccount] = await Promise.all([commercial.ensurePartyAccount(userId, party), commercial.ensureAccount(userId, "WEAVING_SIZING_EXP"), gstAmount > 0 ? commercial.ensureAccount(userId, "WEAVING_INPUT_GST") : null]);
  const bill = await WeavingSizingBill.create({ userId, billNo, billDate: payload.billDate, sizingPartyId: party._id, receiptId: payload.receiptId || null, billableWeightKg: weight, ratePerKg: rate, grossAmount, gstPercent, gstAmount, billAmount, creditDays: Number(payload.creditDays) || 0, dueDate: clean(payload.dueDate), balanceDue: billAmount, notes: clean(payload.notes) });
  const journal = await commercial._test.createJournal({ userId, date: payload.billDate, description: `Sizing Bill ${billNo} - ${party.name}`, sourceType: "purchase_invoice", originModule: "weaving.sizing.bill", referenceId: bill._id, billNo, lines: [{ account: expenseAccount._id, type: "debit", amount: grossAmount }, ...(gstAmount > 0 ? [{ account: gstAccount._id, type: "debit", amount: gstAmount }] : []), { account: partyAccount._id, type: "credit", amount: billAmount }] });
  bill.journalEntryId = journal._id;
  const paidNow = round(payload.paidNow);
  if (paidNow > 0) { if (paidNow > billAmount) throw fail("Payment exceeds bill amount"); const payment = await commercial.postMoneyTransaction({ userId, payload: { type: "pay", partyId: party._id, sizingBillId: bill._id, amount: paidNow, paymentAccountId: payload.paymentAccountId, paymentMethod: payload.paymentMethod, date: payload.billDate, description: `Paid against ${billNo}` } }); bill.paidAmount = paidNow; bill.balanceDue = round(billAmount - paidNow); bill.paymentStatus = bill.balanceDue <= 0 ? "paid" : "partial"; bill.paymentTransactionIds.push(payment._id); }
  await bill.save(); return bill;
};

const createReturn = async (userId, payload) => {
  await requireSizingParty(userId, payload.sizingPartyId);
  const [yarn, godown] = await Promise.all([WeavingYarn.findOne({ _id: payload.yarnId, userId, isActive: true }), WeavingGodown.findOne({ _id: payload.destinationGodownId, userId, isActive: true })]);
  const quantityKg = round(payload.returnedKg);
  if (!yarn || !godown || quantityKg <= 0) throw fail("Yarn, Destination Godown and Returned KG are required");
  const source = payload.issueId ? await WeavingSizingIssue.findOne({ _id: payload.issueId, userId, sizingPartyId: payload.sizingPartyId, status: "posted" }) : null;
  const sourceLine = source?.lines?.find((line) => String(line.yarnId) === String(yarn._id));
  const packing = normalizePacking({ ...payload, smallCones: payload.returnedSmallCones, largeCones: payload.returnedLargeCones }, yarn);
  return WeavingYarnMovement.create({ userId, yarnId: yarn._id, date: payload.date, movementType: "sizing_return", ownershipType: sourceLine?.ownershipType || (payload.ownershipType === "party" ? "party" : "own"), ownerPartyId: sourceLine?.ownerPartyId || payload.ownerPartyId || null, sizingIssueId: source?._id || null, contractId: payload.contractId || source?.contractId || null, quantityKg, destinationType: "godown", godownId: godown._id, sizingPartyId: payload.sizingPartyId, returnNo: clean(payload.returnNo), ...packing, lotReference: clean(payload.lotReference), notes: clean(payload.notes) });
};

const materialLedger = async (userId, query = {}) => {
  const filter = {
    userId,
    isVoided: { $ne: true },
    $or: [
      { movementType: { $in: ["purchase_in", "party_inward"] }, destinationType: "direct_sizing" },
      { movementType: { $in: ["sizing_issue", "sizing_receipt", "sizing_return"] } },
    ],
  };
  if (query.sizingPartyId) filter.sizingPartyId = query.sizingPartyId;
  if (query.yarnId) filter.yarnId = query.yarnId;
  if (query.ownershipType) filter.ownershipType = query.ownershipType;
  if (query.from || query.to) filter.date = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  const movements = await WeavingYarnMovement.find(filter).populate("yarnId", "name count").populate("sizingPartyId ownerPartyId", "name").populate("contractId", "contractNo").sort({ date: 1, createdAt: 1 }).lean();
  const balances = new Map();
  return movements.map((row) => { const key = `${row.sizingPartyId?._id}:${row.yarnId?._id}:${row.ownershipType}:${row.ownerPartyId?._id || "own"}`; const inbound = !["sizing_receipt", "sizing_return"].includes(row.movementType); const sign = inbound ? 1 : -1; const previous = balances.get(key) || { kg: 0, packages: 0, small: 0, large: 0 }; const current = { kg: round(previous.kg + sign * row.quantityKg), packages: round(previous.packages + sign * row.packageQty), small: round(previous.small + sign * row.smallCones), large: round(previous.large + sign * row.largeCones) }; balances.set(key, current); const label = row.movementType === "purchase_in" || row.movementType === "party_inward" ? "Direct Purchase Inward" : row.movementType === "sizing_issue" ? "Yarn Issue" : row.movementType === "sizing_return" ? "Yarn Return" : "Beam Receiving Adjustment"; return { ...row, movementLabel: label, inKg: inbound ? row.quantityKg : 0, outKg: inbound ? 0 : row.quantityKg, packageIn: inbound ? row.packageQty : 0, packageOut: inbound ? 0 : row.packageQty, smallConesIn: inbound ? row.smallCones : 0, smallConesOut: inbound ? 0 : row.smallCones, largeConesIn: inbound ? row.largeCones : 0, largeConesOut: inbound ? 0 : row.largeCones, balanceKg: current.kg, balancePackages: current.packages, balanceSmallCones: current.small, balanceLargeCones: current.large }; });
};

module.exports = {
  requireSizingParty,
  createIssue: costing.withCostingInvalidation(createIssue, "sizing"),
  createReceipt: costing.withCostingInvalidation(createReceipt, "sizing"),
  createBill: costing.withCostingInvalidation(createBill, "sizing"),
  createReturn: costing.withCostingInvalidation(createReturn, "sizing"),
  materialLedger,
};
