const mongoose = require("mongoose");
const Account = require("../../models/Account");
const Counter = require("../../models/Counter");
const JournalEntry = require("../../models/JournalEntry");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingItem = require("../../models/WeavingItem");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingMoneyTransaction = require("../../models/WeavingMoneyTransaction");
const WeavingParty = require("../../models/WeavingParty");
const WeavingPurchaseInvoice = require("../../models/WeavingPurchaseInvoice");
const WeavingSizingBill = require("../../models/WeavingSizingBill");
const WeavingSizingIssue = require("../../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../../models/WeavingSizingReceipt");
const WeavingYarn = require("../../models/WeavingYarn");
const WeavingYarnMovement = require("../../models/WeavingYarnMovement");
const WeavingSalesInvoice = require("../../models/WeavingSalesInvoice");
const WeavingPakkiSettlement = require("../../models/WeavingPakkiSettlement");
const WeavingRejectionDue = require("../../models/WeavingRejectionDue");
const WeavingRejectionReceipt = require("../../models/WeavingRejectionReceipt");
const WeavingFabricMovement = require("../../models/WeavingFabricMovement");
const costing = require("./weavingCostingService");
const { recalculateAccountBalances } = require("../../utils/accountHelper");
const { normalizePacking } = require("./weavingPacking");

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const text = (value = "") => String(value || "").trim();
const error = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const sessionOptions = (session) => (session ? { session } : {});
const createOne = async (Model, document, session) => {
  if (!session) return Model.create(document);
  const [created] = await Model.create([document], { session });
  return created;
};
const runAtomic = async (work) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } catch (failure) {
    if (!/Transaction numbers are only allowed|replica set member|does not support transactions/i.test(failure.message || "")) throw failure;
    return work(null);
  } finally {
    await session.endSession();
  }
};
const accountSpecs = {
  WEAVING_OPENING_EQUITY: ["Weaving Opening Balance Equity", "Equity", "capital", "credit"],
  WEAVING_YARN_INVENTORY: ["Weaving Yarn Inventory", "Asset", "inventory", "debit"],
  WEAVING_FABRIC_INVENTORY: ["Weaving Fabric Inventory", "Asset", "inventory", "debit"],
  WEAVING_MAINTENANCE_EXP: ["Maintenance Expense", "Expense", "maintenance", "debit"],
  WEAVING_OTHER_EXP: ["Other Expense", "Expense", "other_expense", "debit"],
  WEAVING_FIXED_ASSETS: ["Weaving Fixed Assets", "Asset", "fixed", "debit"],
  WEAVING_SIZING_EXP: ["Sizing Expense", "Expense", "production", "debit"],
  WEAVING_INPUT_GST: ["Input GST", "Asset", "tax", "debit"],
  WEAVING_FABRIC_SALES: ["Fabric Sales", "Income", "sales", "credit"],
  WEAVING_CONVERSION_INCOME: ["Conversion / Job Work Income", "Income", "service", "credit"],
  WEAVING_YARN_SALES: ["Yarn Sales", "Income", "sales", "credit"],
  WEAVING_OTHER_SALES: ["Other Stock Sales", "Income", "sales", "credit"],
  WEAVING_SALES_DEDUCTIONS: ["Sales Discounts and Deductions", "Expense", "other_expense", "debit"],
  WEAVING_OUTPUT_TAX: ["Output Tax", "Liability", "tax", "credit"],
};

const ensureAccount = async (userId, code, session = null) => {
  const spec = accountSpecs[code];
  if (!spec) throw error("Invalid Weaving account", 400);
  return Account.findOneAndUpdate({ userId, moduleScope: "weaving", code }, { $setOnInsert: { userId, code, name: spec[0], type: spec[1], category: spec[2], normalBalance: spec[3], moduleScope: "weaving", isSystem: false, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) });
};

const ensurePartyAccount = async (userId, party, session = null) => {
  if (party.accountId) {
    const existing = await Account.findOne({ _id: party.accountId, userId, moduleScope: "weaving" }, null, sessionOptions(session));
    if (existing) return existing;
  }
  const code = `WEAVING_PARTY_${String(party._id).toUpperCase()}`;
  const account = await Account.findOneAndUpdate({ userId, moduleScope: "weaving", code }, { $set: { name: party.name, isActive: party.isActive !== false }, $setOnInsert: { userId, code, type: "Asset", category: "party", normalBalance: "debit", moduleScope: "weaving", isSystem: false } }, { upsert: true, new: true, setDefaultsOnInsert: true, ...sessionOptions(session) });
  party.accountId = account._id; await party.save(sessionOptions(session)); return account;
};

const createJournal = async ({ userId, date, description, sourceType = "manual", originModule, referenceId, invoiceId, invoiceModel, billNo = "", lines }) => {
  const normalized = lines.filter((line) => round(line.amount) > 0).map((line) => ({ ...line, amount: round(line.amount) }));
  const debit = round(normalized.filter((line) => line.type === "debit").reduce((sum, line) => sum + line.amount, 0));
  const credit = round(normalized.filter((line) => line.type === "credit").reduce((sum, line) => sum + line.amount, 0));
  if (normalized.length < 2 || debit !== credit) throw error("Weaving journal is not balanced");
  const journal = await JournalEntry.create({ date: new Date(`${date}T00:00:00.000Z`), description, createdBy: userId, sourceType, originModule, moduleScope: "weaving", referenceId, invoiceId, invoiceModel, billNo, lines: normalized });
  await recalculateAccountBalances([...new Set(normalized.map((line) => String(line.account)))]);
  return journal;
};

const allocateLedgerVoucherBlock = async (userId, type, prefix, count = 1) => {
  const counter = await Counter.findOneAndUpdate(
    { userId, type },
    { $inc: { seq: count }, $setOnInsert: { userId, type } },
    { new: true, upsert: true, setDefaultsOnInsert: false },
  );
  const end = Number(counter.seq || count);
  return Array.from({ length: count }, (_, index) => `${prefix}-${String(end - count + index + 1).padStart(5, "0")}`);
};

const reverseJournal = async (userId, journalId, date, reason) => {
  if (!journalId) return null;
  const original = await JournalEntry.findOne({ _id: journalId, createdBy: userId, moduleScope: "weaving", isDeleted: false, isReversed: false });
  if (!original) return null;
  const reversal = await createJournal({ userId, date, description: reason, sourceType: "reversal", originModule: "weaving.reversal", referenceId: original.referenceId, lines: original.lines.map((line) => ({ account: line.account, type: line.type === "debit" ? "credit" : "debit", amount: line.amount })) });
  original.isReversed = true; await original.save(); reversal.isReversal = true; reversal.reversalOf = original._id; await reversal.save(); return reversal;
};

const openingBalanceIsUnchanged = ({ currentAmount, currentType, currentJournalId, currentDate, nextAmount, nextType, nextDate, journalExists }) =>
  round(currentAmount) === round(nextAmount)
  && currentType === nextType
  && ((round(nextAmount) <= 0 && !currentJournalId) || (journalExists && currentDate === nextDate));

const reconcileOpeningBalance = async (userId, party, payload) => {
  const existingJournal = party.openingJournalId
    ? await JournalEntry.findOne({ _id: party.openingJournalId, createdBy: userId, moduleScope: "weaving", isDeleted: false }).select("date billNo").lean()
    : null;
  const existingDate = existingJournal?.date
    ? new Date(existingJournal.date).toISOString().slice(0, 10)
    : "";
  const amount = payload.openingBalance === undefined
    ? round(party.openingBalance)
    : round(payload.openingBalance);
  const balanceType = payload.balanceType === "payable"
    ? "payable"
    : payload.balanceType === "receivable"
      ? "receivable"
      : party.balanceType || "receivable";
  const openingDate = text(payload.openingDate) || existingDate || new Date().toISOString().slice(0, 10);
  const unchanged = openingBalanceIsUnchanged({ currentAmount: party.openingBalance, currentType: party.balanceType, currentJournalId: party.openingJournalId, currentDate: existingDate, nextAmount: amount, nextType: balanceType, nextDate: openingDate, journalExists: Boolean(existingJournal) });

  if (unchanged) return party;

  if (party.openingJournalId) await reverseJournal(userId, party.openingJournalId, new Date().toISOString().slice(0, 10), `Reverse opening balance - ${party.name}`);
  party.openingBalance = amount; party.balanceType = balanceType; party.openingJournalId = null;
  if (amount > 0) {
    const [partyAccount, equity] = await Promise.all([ensurePartyAccount(userId, party), ensureAccount(userId, "WEAVING_OPENING_EQUITY")]);
    const billNo = existingJournal?.billNo || (await allocateLedgerVoucherBlock(userId, "weaving_opening_balance", "WOB"))[0];
    const journal = await createJournal({ userId, date: openingDate, description: `Opening Balance - ${party.name}`, sourceType: "opening_balance", originModule: "weaving.party.opening", referenceId: party._id, billNo, lines: balanceType === "receivable" ? [{ account: partyAccount._id, type: "debit", amount }, { account: equity._id, type: "credit", amount }] : [{ account: equity._id, type: "debit", amount }, { account: partyAccount._id, type: "credit", amount }] });
    party.openingJournalId = journal._id;
  }
  await party.save(); return party;
};

const validIds = (values = []) => [...new Set(values.filter((value) => mongoose.isValidObjectId(value)).map(String))];
const mapById = (rows = []) => new Map(rows.map((row) => [String(row._id), row]));

const resolveEffectiveWeavingPartyLedgerJournals = (journals = []) => {
  const reversedIds = new Set(
    journals
      .filter((journal) => journal.isReversal === true || journal.sourceType === "reversal")
      .map((journal) => String(journal.reversalOf || ""))
      .filter(Boolean),
  );

  return journals.filter((journal) =>
    journal.isDeleted !== true
    && journal.isReversal !== true
    && journal.sourceType !== "reversal"
    && journal.isReversed !== true
    && !reversedIds.has(String(journal._id)),
  );
};

const calculateEffectivePartyLedger = ({ journals = [], accountId, fromDate = null, toDate = null }) => {
  let opening = 0;
  const periodJournals = [];
  resolveEffectiveWeavingPartyLedgerJournals(journals).forEach((journal) => {
    const date = new Date(journal.date);
    if (toDate && date > toDate) return;
    const lines = (journal.lines || []).filter((line) => String(line.account) === String(accountId));
    const debit = round(lines.filter((line) => line.type === "debit").reduce((sum, line) => sum + line.amount, 0));
    const credit = round(lines.filter((line) => line.type === "credit").reduce((sum, line) => sum + line.amount, 0));
    if (fromDate && date < fromDate) opening = round(opening + debit - credit);
    else periodJournals.push({ journal, debit, credit });
  });
  return { opening, periodJournals };
};

const buildLedgerSource = ({ journal, effectiveJournal, transaction, purchase, sale, sizingBill }) => {
  const origin = effectiveJournal?.originModule || "";
  const referenceId = String(effectiveJournal?.referenceId || effectiveJournal?.invoiceId || "");
  const base = {
    kind: "journal",
    id: String(journal._id),
    journalId: String(journal._id),
    subtype: null,
    status: "posted",
    isReversal: journal.isReversal === true || journal.sourceType === "reversal",
  };

  if (origin === "weaving.party.opening" || effectiveJournal?.sourceType === "opening_balance") {
    return { ...base, kind: "opening", id: referenceId, reference: effectiveJournal.billNo || "", status: "posted" };
  }
  if (origin === "weaving.pay_bill" || origin === "weaving.receive_payment" || ["pay_bill", "receive_payment"].includes(effectiveJournal?.sourceType)) {
    if (!transaction) return { ...base, status: "missing" };
    return {
      ...base,
      kind: "payment",
      id: transaction ? String(transaction._id) : referenceId,
      subtype: transaction?.type || (origin === "weaving.receive_payment" ? "receive" : "pay"),
      reference: transaction?.transactionNo || effectiveJournal.billNo || "",
      status: transaction?.status || "missing",
    };
  }
  if (origin === "weaving.purchase" || effectiveJournal?.sourceType === "purchase_invoice") {
    if (!purchase) return { ...base, status: "missing" };
    return { ...base, kind: "purchase", id: purchase ? String(purchase._id) : referenceId, purchaseType: purchase?.purchaseType || "other", reference: purchase?.purchaseNo || effectiveJournal.billNo || "", status: purchase?.status || "missing" };
  }
  if (origin === "weaving.sales" || effectiveJournal?.sourceType === "sale_invoice") {
    if (!sale) return { ...base, status: "missing" };
    return { ...base, kind: "sale_invoice", id: sale ? String(sale._id) : referenceId, reference: sale?.invoiceNo || effectiveJournal.billNo || "", status: sale?.status || "missing" };
  }
  if (origin === "weaving.sizing.bill") {
    if (!sizingBill) return { ...base, status: "missing" };
    return { ...base, kind: "sizing_bill", id: sizingBill ? String(sizingBill._id) : referenceId, reference: sizingBill?.billNo || effectiveJournal.billNo || "", status: sizingBill?.status || "missing" };
  }
  return { ...base, reference: effectiveJournal.billNo || "" };
};

const resolveLedgerSources = async (userId, journals = []) => {
  const reversalIds = validIds(journals.filter((journal) => journal.isReversal || journal.sourceType === "reversal").map((journal) => journal.reversalOf));
  const originals = reversalIds.length
    ? await JournalEntry.find({ _id: { $in: reversalIds }, createdBy: userId, moduleScope: "weaving", isDeleted: false }).lean()
    : [];
  const originalMap = mapById(originals);
  const effective = journals.map((journal) => originalMap.get(String(journal.reversalOf || "")) || journal);
  const journalIds = validIds(effective.map((journal) => journal._id));
  const referenceIds = validIds(effective.flatMap((journal) => [journal.referenceId, journal.invoiceId]));
  const [transactionsByJournal, transactionsByReference, purchases, sales, sizingBills] = await Promise.all([
    journalIds.length ? WeavingMoneyTransaction.find({ userId, journalEntryId: { $in: journalIds } }).select("transactionNo type status journalEntryId").lean() : [],
    referenceIds.length ? WeavingMoneyTransaction.find({ userId, _id: { $in: referenceIds } }).select("transactionNo type status journalEntryId").lean() : [],
    referenceIds.length ? WeavingPurchaseInvoice.find({ userId, _id: { $in: referenceIds } }).select("purchaseNo status purchaseType").lean() : [],
    referenceIds.length ? WeavingSalesInvoice.find({ userId, _id: { $in: referenceIds } }).select("invoiceNo status").lean() : [],
    referenceIds.length ? WeavingSizingBill.find({ userId, _id: { $in: referenceIds } }).select("billNo status").lean() : [],
  ]);
  const transactionJournalMap = new Map(transactionsByJournal.map((row) => [String(row.journalEntryId), row]));
  const transactionReferenceMap = mapById(transactionsByReference);
  const purchaseMap = mapById(purchases);
  const saleMap = mapById(sales);
  const sizingMap = mapById(sizingBills);

  return new Map(journals.map((journal, index) => {
    const effectiveJournal = effective[index];
    const referenceId = String(effectiveJournal.referenceId || effectiveJournal.invoiceId || "");
    return [String(journal._id), buildLedgerSource({
      journal,
      effectiveJournal,
      transaction: transactionJournalMap.get(String(effectiveJournal._id)) || transactionReferenceMap.get(referenceId),
      purchase: purchaseMap.get(referenceId),
      sale: saleMap.get(referenceId),
      sizingBill: sizingMap.get(referenceId),
    })];
  }));
};

const ensureReadableLedgerReferences = async (userId, allJournals, effectiveJournals, sourceMap) => {
  const historicalNumbers = new Map();
  allJournals.forEach((journal) => {
    if (!journal.billNo) return;
    const key = `${journal.originModule || journal.sourceType}:${String(journal.referenceId || journal.invoiceId || "")}`;
    if (!historicalNumbers.has(key)) historicalNumbers.set(key, journal.billNo);
  });

  const groups = new Map();
  const updates = [];
  effectiveJournals.forEach((journal) => {
    const source = sourceMap.get(String(journal._id));
    if (source?.reference) return;
    const historyKey = `${journal.originModule || journal.sourceType}:${String(journal.referenceId || journal.invoiceId || "")}`;
    const historical = historicalNumbers.get(historyKey);
    if (historical) {
      source.reference = historical;
      updates.push({ updateOne: { filter: { _id: journal._id, createdBy: userId, moduleScope: "weaving", $or: [{ billNo: "" }, { billNo: { $exists: false } }] }, update: { $set: { billNo: historical } } } });
      return;
    }
    const groupKey = source?.kind === "opening" ? "opening" : "journal";
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ journal, source });
  });

  for (const [groupKey, entries] of groups) {
    const prefix = groupKey === "opening" ? "WOB" : "WJV";
    const numbers = await allocateLedgerVoucherBlock(userId, `weaving_${groupKey}_voucher`, prefix, entries.length);
    entries.forEach((entry, index) => {
      entry.source.reference = numbers[index];
      updates.push({ updateOne: { filter: { _id: entry.journal._id, createdBy: userId, moduleScope: "weaving", $or: [{ billNo: "" }, { billNo: { $exists: false } }] }, update: { $set: { billNo: numbers[index] } } } });
    });
  }
  if (updates.length) await JournalEntry.bulkWrite(updates, { ordered: false });
};

const partyBalance = async (userId, accountId) => {
  if (!accountId) return 0;
  const rows = await JournalEntry.find({ createdBy: userId, moduleScope: "weaving", isDeleted: false, "lines.account": accountId }).select("lines sourceType isReversal isReversed reversalOf isDeleted").lean();
  const effectiveRows = resolveEffectiveWeavingPartyLedgerJournals(rows);
  return round(effectiveRows.reduce((total, journal) => total + journal.lines.filter((line) => String(line.account) === String(accountId)).reduce((sum, line) => sum + (line.type === "debit" ? line.amount : -line.amount), 0), 0));
};

const getPartyLedger = async (userId, partyId, filters = {}) => {
  const party = await WeavingParty.findOne({ _id: partyId, userId }); if (!party) throw error("Counterparty not found", 404);
  const account = await ensurePartyAccount(userId, party);
  const journalQuery = { createdBy: userId, moduleScope: "weaving", isDeleted: false, "lines.account": account._id };
  const allJournals = await JournalEntry.find(journalQuery).sort({ date: 1, createdAt: 1 }).lean();
  const fromDate = filters.from ? new Date(`${filters.from}T00:00:00.000Z`) : null;
  const toDate = filters.to ? new Date(`${filters.to}T23:59:59.999Z`) : null;
  const { opening, periodJournals } = calculateEffectivePartyLedger({ journals: allJournals, accountId: account._id, fromDate, toDate });
  const sourceMap = await resolveLedgerSources(userId, periodJournals.map(({ journal }) => journal));
  await ensureReadableLedgerReferences(userId, allJournals, periodJournals.map(({ journal }) => journal), sourceMap);
  let running = opening; const rows = periodJournals.map(({ journal, debit, credit }) => { const source = sourceMap.get(String(journal._id)); running = round(running + debit - credit); return { _id: journal._id, date: journal.date, reference: source?.reference || "Journal", type: journal.originModule || journal.sourceType, origin: journal.originModule || "", description: journal.description, debit, credit, runningBalance: running, source }; });
  const debit = round(rows.reduce((s, r) => s + r.debit, 0)); const credit = round(rows.reduce((s, r) => s + r.credit, 0));
  return { party, account, rows, period: { from: filters.from || "", to: filters.to || "" }, summary: { opening, debit, credit, closing: running, status: running > 0 ? "receivable" : running < 0 ? "payable" : "settled" } };
};

const mergeRoles = (source, target) => source === target ? source : source === "both" || target === "both" ? "both" : "both";
const consolidateJournalLines = (lines, sourceAccountId, targetAccountId) => {
  const totals = new Map();
  lines.forEach((line) => {
    const account = String(line.account) === String(sourceAccountId) ? targetAccountId : line.account;
    const key = String(account); const current = totals.get(key) || { account, debit: 0, credit: 0 };
    current[line.type] = round(current[line.type] + line.amount); totals.set(key, current);
  });
  return [...totals.values()].flatMap((entry) => { const net = round(entry.debit - entry.credit); if (!net) return []; return [{ account: entry.account, type: net > 0 ? "debit" : "credit", amount: Math.abs(net) }]; });
};

const mergeParties = async (userId, sourceId, targetId) => {
  if (!sourceId || !targetId || String(sourceId) === String(targetId)) throw error("Choose a different target party");
  const [sourceSeed, targetSeed] = await Promise.all([WeavingParty.findOne({ _id: sourceId, userId }), WeavingParty.findOne({ _id: targetId, userId, isActive: true, isHidden: false })]);
  if (!sourceSeed) throw error("Source party not found", 404); if (!targetSeed) throw error("Target party is not active", 400); if (sourceSeed.isHidden) throw error("Hidden parties cannot be merged", 400);
  const [sourceAccount, targetAccount] = await Promise.all([ensurePartyAccount(userId, sourceSeed), ensurePartyAccount(userId, targetSeed)]);
  const session = await mongoose.startSession(); let result;
  try {
    await session.withTransaction(async () => {
      const [source, target] = await Promise.all([WeavingParty.findOne({ _id: sourceId, userId, isHidden: false }).session(session), WeavingParty.findOne({ _id: targetId, userId, isActive: true, isHidden: false }).session(session)]);
      if (!source || !target) throw error("Party changed before merge; reload and try again", 409);
      let movedDocuments = 0;
      const updates = await Promise.all([
        WeavingContract.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id, partyName: target.name } }, { session }),
        WeavingPurchaseInvoice.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id, partyName: target.name } }, { session }),
        WeavingPurchaseInvoice.updateMany({ userId, "lines.sizingPartyId": source._id }, { $set: { "lines.$[line].sizingPartyId": target._id } }, { arrayFilters: [{ "line.sizingPartyId": source._id }], session }),
        WeavingMoneyTransaction.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id } }, { session }),
        WeavingYarnMovement.updateMany({ userId, ownerPartyId: source._id }, { $set: { ownerPartyId: target._id } }, { session }),
        WeavingYarnMovement.updateMany({ userId, sizingPartyId: source._id }, { $set: { sizingPartyId: target._id } }, { session }),
        WeavingSizingIssue.updateMany({ userId, sizingPartyId: source._id }, { $set: { sizingPartyId: target._id } }, { session }),
        WeavingSizingIssue.updateMany({ userId, "lines.ownerPartyId": source._id }, { $set: { "lines.$[line].ownerPartyId": target._id } }, { arrayFilters: [{ "line.ownerPartyId": source._id }], session }),
        WeavingSizingReceipt.updateMany({ userId, sizingPartyId: source._id }, { $set: { sizingPartyId: target._id } }, { session }),
        WeavingSizingBill.updateMany({ userId, sizingPartyId: source._id }, { $set: { sizingPartyId: target._id } }, { session }),
        WeavingSalesInvoice.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id, partyName: target.name } }, { session }),
        WeavingPakkiSettlement.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id } }, { session }),
        WeavingRejectionDue.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id } }, { session }),
        WeavingRejectionDue.updateMany({ userId, ownerPartyId: source._id }, { $set: { ownerPartyId: target._id } }, { session }),
        WeavingRejectionReceipt.updateMany({ userId, partyId: source._id }, { $set: { partyId: target._id } }, { session }),
        WeavingRejectionReceipt.updateMany({ userId, ownerPartyId: source._id }, { $set: { ownerPartyId: target._id } }, { session }),
        WeavingFabricMovement.updateMany({ userId, ownerPartyId: source._id }, { $set: { ownerPartyId: target._id } }, { session }),
      ]);
      movedDocuments = updates.reduce((sum, update) => sum + Number(update.modifiedCount || 0), 0);
      const journals = await JournalEntry.find({ createdBy: userId, moduleScope: "weaving", isDeleted: false, "lines.account": sourceAccount._id }).session(session);
      for (const journal of journals) { journal.lines = consolidateJournalLines(journal.lines, sourceAccount._id, targetAccount._id); const debit = round(journal.lines.filter((line) => line.type === "debit").reduce((sum, line) => sum + line.amount, 0)); const credit = round(journal.lines.filter((line) => line.type === "credit").reduce((sum, line) => sum + line.amount, 0)); if (debit !== credit) throw error("Merge would unbalance a journal", 409); await journal.save({ session }); }
      target.role = mergeRoles(source.role, target.role); target.serviceTypes = [...new Set([...(target.serviceTypes || []), ...(source.serviceTypes || [])])]; await target.save({ session });
      source.isHidden = true; source.hiddenReason = "merged"; source.hiddenAt = new Date(); source.isActive = false; await source.save({ session });
      await Account.updateOne({ _id: sourceAccount._id, userId, moduleScope: "weaving" }, { $set: { isActive: false } }, { session });
      result = { source, target, movedTransactions: journals.length, movedDocuments };
    });
  } finally { await session.endSession(); }
  await recalculateAccountBalances([sourceAccount._id, targetAccount._id]); return result;
};

const ensurePaymentAccount = async (userId, id) => {
  const account = await Account.findOne({ _id: id, userId, isActive: true, moduleScope: { $in: ["shared", "weaving"] }, category: { $in: ["cash", "bank", "online", "cheque"] } });
  if (!account) throw error("Valid payment account is required"); return account;
};

const nextNo = async (Model, userId, field, prefix) => { const latest = await Model.findOne({ userId }).sort({ createdAt: -1 }).select(field).lean(); const value = latest?.[field] || ""; return `${prefix}-${String((Number(String(value).match(/(\d+)$/)?.[1]) || 0) + 1).padStart(5, "0")}`; };

const postMoneyTransaction = async ({ userId, payload, purchaseInvoice = null, salesInvoice = null }) => {
  const requestKey = text(payload.requestKey);
  if (requestKey) {
    const existing = await WeavingMoneyTransaction.findOne({ userId, requestKey });
    if (existing) {
      if (existing.salesInvoiceId) {
        const invoice = salesInvoice || await WeavingSalesInvoice.findOne({ _id: existing.salesInvoiceId, userId });
        if (invoice) {
          const rows = await WeavingMoneyTransaction.find({ userId, salesInvoiceId: invoice._id, type: "receive", status: "posted" }).select("amount").lean();
          invoice.paidAmount = round(rows.reduce((sum, row) => sum + row.amount, 0)); invoice.balanceDue = round(Math.max(0, invoice.grandTotal - invoice.paidAmount)); invoice.paymentStatus = invoice.balanceDue <= 0 ? "paid" : invoice.paidAmount > 0 ? "partial" : "unpaid"; await invoice.save();
        }
      }
      return existing;
    }
  }
  const type = payload.type === "receive" ? "receive" : "pay"; const amount = round(payload.amount); if (amount <= 0) throw error("Amount must be greater than zero");
  const allowedRoles = type === "receive" ? ["customer", "both"] : ["supplier", "both"];
  const party = await WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: allowedRoles } });
  if (!party) throw error(type === "receive" ? "Customer / Party is required" : "Supplier / Party is required");
  const [partyAccount, paymentAccount] = await Promise.all([ensurePartyAccount(userId, party), ensurePaymentAccount(userId, payload.paymentAccountId)]);
  if (purchaseInvoice && amount > purchaseInvoice.balanceDue) throw error("Payment exceeds invoice balance");
  if (salesInvoice && amount > salesInvoice.balanceDue) throw error("Receipt exceeds invoice balance");
  const transactionNo = payload.transactionNo || await nextNo(WeavingMoneyTransaction, userId, "transactionNo", type === "receive" ? "RCV" : "PAY");
  if (payload.paymentMethod === "cheque" && (!text(payload.chequeNo) || !text(payload.chequeDueDate))) throw error("Cheque Number and Clearing / Due Date are required");
  const transaction = new WeavingMoneyTransaction({ userId, requestKey: requestKey || null, transactionNo, type, date: payload.date, partyId: party._id, purchaseInvoiceId: purchaseInvoice?._id || payload.purchaseInvoiceId || null, salesInvoiceId: salesInvoice?._id || payload.salesInvoiceId || null, sizingBillId: payload.sizingBillId || null, amount, paymentAccountId: paymentAccount._id, paymentMethod: payload.paymentMethod || paymentAccount.category, description: text(payload.description), attachmentUrl: text(payload.attachmentUrl), attachments: payload.attachments || [], chequeNo: text(payload.chequeNo), chequeBank: text(payload.chequeBank), chequeDate: text(payload.chequeDate), chequeDueDate: text(payload.chequeDueDate), chequeStatus: payload.paymentMethod === "cheque" ? "pending" : "", journalEntryId: partyAccount._id });
  const journal = await createJournal({ userId, date: payload.date, description: payload.description || `${type === "receive" ? "Received from" : "Paid to"} ${party.name}`, sourceType: type === "receive" ? "receive_payment" : "pay_bill", originModule: type === "receive" ? "weaving.receive_payment" : "weaving.pay_bill", referenceId: transaction._id, billNo: transactionNo, lines: type === "receive" ? [{ account: paymentAccount._id, type: "debit", amount }, { account: partyAccount._id, type: "credit", amount }] : [{ account: partyAccount._id, type: "debit", amount }, { account: paymentAccount._id, type: "credit", amount }] });
  transaction.journalEntryId = journal._id; await transaction.save();
  if (purchaseInvoice) { purchaseInvoice.paidAmount = round(purchaseInvoice.paidAmount + amount); purchaseInvoice.balanceDue = round(purchaseInvoice.grandTotal - purchaseInvoice.paidAmount); purchaseInvoice.paymentStatus = purchaseInvoice.balanceDue <= 0 ? "paid" : "partial"; purchaseInvoice.paymentTransactionIds.push(transaction._id); await purchaseInvoice.save(); }
  if (salesInvoice) { const rows = await WeavingMoneyTransaction.find({ userId, salesInvoiceId: salesInvoice._id, type: "receive", status: "posted" }).select("amount").lean(); salesInvoice.paidAmount = round(rows.reduce((sum, row) => sum + row.amount, 0)); salesInvoice.balanceDue = round(Math.max(0, salesInvoice.grandTotal - salesInvoice.paidAmount)); salesInvoice.paymentStatus = salesInvoice.balanceDue <= 0 ? "paid" : salesInvoice.paidAmount > 0 ? "partial" : "unpaid"; await salesInvoice.save(); }
  return transaction;
};

const normalizePurchaseLines = async (userId, payload) => {
  if (!Array.isArray(payload.lines) || !payload.lines.length) throw error("Add at least one purchase line");
  const result = [];
  for (const source of payload.lines) {
    const quantity = round(source.quantityKg ?? source.quantity); const rate = round(source.rate); if (quantity <= 0) throw error("Line quantity must be greater than zero");
    if (payload.purchaseType === "yarn") { const yarn = await WeavingYarn.findOne({ _id: source.yarnId, userId, isActive: true }); if (!yarn) throw error("Valid Yarn is required"); if (source.destinationType !== "direct_sizing" && !await WeavingGodown.exists({ _id: source.godownId, userId, isActive: true })) throw error("Godown is required"); if (source.destinationType === "direct_sizing" && !await WeavingParty.exists({ _id: source.sizingPartyId, userId, isActive: true, isHidden: false, serviceTypes: "sizing" })) throw error("Sizing Party is required"); const quantityLbs = round(source.quantityLbs || quantity * 2.2046226218); const rateBasis = source.rateBasis === "lbs" ? "lbs" : "kg"; const packing = normalizePacking(source, yarn); result.push({ itemKind: "yarn", yarnId: yarn._id, name: yarn.name, quantity, quantityLbs, ...packing, unit: "KG", rate, rateBasis, amount: round((rateBasis === "lbs" ? quantityLbs : quantity) * rate), contractId: source.contractId || null, destinationType: source.destinationType || "godown", godownId: source.godownId || null, sizingPartyId: source.sizingPartyId || null, lotReference: text(source.lotReference) }); }
    else if (payload.purchaseType === "fabric") { const quality = await WeavingFabricQuality.findOne({ _id: source.fabricQualityId, userId, isActive: true }); if (!quality) throw error("Valid Fabric Quality is required"); if (!await WeavingGodown.exists({ _id: source.godownId, userId, isActive: true })) throw error("Godown is required"); result.push({ itemKind: "fabric", fabricQualityId: quality._id, name: quality.name, quantity, unit: "Meter", rate, amount: round(quantity * rate), fabricGrade: ["normal", "b", "rejected", "cut_piece", "waste"].includes(source.fabricGrade) ? source.fabricGrade : "normal", weightKg: round(source.weightKg), thanCount: round(source.thanCount), pieceCount: round(source.pieceCount), godownId: source.godownId }); }
    else { let item = source.itemId ? await WeavingItem.findOne({ _id: source.itemId, userId, isActive: true }) : null; if (!item && source.name) item = await WeavingItem.findOneAndUpdate({ userId, normalizedName: text(source.name).toLowerCase(), category: payload.purchaseType === "parts" ? "part" : "other" }, { $setOnInsert: { userId, name: text(source.name), normalizedName: text(source.name).toLowerCase(), category: payload.purchaseType === "parts" ? "part" : "other", unit: text(source.unit) || "Nos", description: text(source.description), isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true }); if (!item) throw error("Product / Part is required"); result.push({ itemKind: payload.purchaseType === "parts" ? "part" : "other", itemId: item._id, name: item.name, description: text(source.description), quantity, unit: text(source.unit) || item.unit, rate, amount: round(quantity * rate), loomId: source.loomId || null, nature: payload.purchaseType === "parts" ? "expense" : source.nature === "asset" ? "asset" : "expense", debitAccountId: source.debitAccountId || null }); }
  }
  return result;
};

const createFabricPurchase = async (userId, payload) => {
  const requestKey = text(payload.requestKey);
  if (!requestKey) throw error("Request key is required");
  const existing = await WeavingPurchaseInvoice.findOne({ userId, requestKey });
  if (existing) return existing;
  const party = await WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: ["supplier", "both"] } });
  if (!party) throw error("Supplier / Party is required");
  const lines = await normalizePurchaseLines(userId, { ...payload, purchaseType: "fabric" });
  const grandTotal = round(lines.reduce((sum, line) => sum + line.amount, 0));
  const paidNow = round(payload.paidNow);
  if (paidNow < 0 || paidNow > grandTotal) throw error("Paid Now cannot exceed Bill Total");
  const partyAccount = await ensurePartyAccount(userId, party);
  const inventoryAccount = await ensureAccount(userId, "WEAVING_FABRIC_INVENTORY");
  const paymentAccount = paidNow > 0 ? await ensurePaymentAccount(userId, payload.paymentAccountId) : null;
  const purchaseNo = payload.purchaseNo || await nextNo(WeavingPurchaseInvoice, userId, "purchaseNo", "WP");
  const paymentNo = paidNow > 0 ? await nextNo(WeavingMoneyTransaction, userId, "transactionNo", "PAY") : "";
  const creditDays = Math.max(0, Number(payload.creditDays) || 0);
  const calculatedDue = creditDays && payload.purchaseDate ? new Date(`${payload.purchaseDate}T00:00:00.000Z`) : null;
  if (calculatedDue) calculatedDue.setUTCDate(calculatedDue.getUTCDate() + creditDays);
  const touchedAccountIds = [partyAccount._id, inventoryAccount._id, ...(paymentAccount ? [paymentAccount._id] : [])];
  const invoice = await runAtomic(async (session) => {
    const duplicate = await WeavingPurchaseInvoice.findOne({ userId, requestKey }, null, sessionOptions(session));
    if (duplicate) return duplicate;
    const row = await createOne(WeavingPurchaseInvoice, { userId, requestKey, purchaseNo, purchaseDate: payload.purchaseDate, purchaseType: "fabric", yarnSource: "own", partyId: party._id, partyName: party.name, supplierInvoiceNo: text(payload.supplierInvoiceNo), attachmentUrl: text(payload.attachmentUrl), attachments: payload.attachments || [], notes: text(payload.notes), dueDate: text(payload.dueDate) || (calculatedDue ? calculatedDue.toISOString().slice(0, 10) : ""), creditDays, gatePassNo: text(payload.gatePassNo), entryMode: "detailed", lines, grandTotal, paidAmount: 0, balanceDue: grandTotal, paymentStatus: "unpaid" }, session);
    await WeavingFabricMovement.insertMany(row.lines.map((line) => ({ userId, date: payload.purchaseDate, movementType: "purchase_in", category: line.fabricGrade, direction: "in", fabricQualityId: line.fabricQualityId, godownId: line.godownId, ownershipType: "own", meter: line.quantity, weightKg: line.weightKg, thanCount: line.thanCount, pieceCount: line.pieceCount, purchaseInvoiceId: row._id, purchaseLineId: line._id, notes: `Fabric Purchase ${purchaseNo}` })), sessionOptions(session));
    const purchaseJournal = await createOne(JournalEntry, { date: new Date(`${payload.purchaseDate}T00:00:00.000Z`), description: `Purchase ${purchaseNo} - ${party.name}`, createdBy: userId, sourceType: "purchase_invoice", originModule: "weaving.purchase", moduleScope: "weaving", referenceId: row._id, invoiceId: row._id, invoiceModel: "WeavingPurchaseInvoice", billNo: purchaseNo, lines: [{ account: inventoryAccount._id, type: "debit", amount: grandTotal }, { account: partyAccount._id, type: "credit", amount: grandTotal }] }, session);
    row.purchaseJournalId = purchaseJournal._id;
    if (paidNow > 0) {
      const paymentRequestKey = `purchase:${requestKey}:payment`;
      const paymentJournal = await createOne(JournalEntry, { date: new Date(`${payload.purchaseDate}T00:00:00.000Z`), description: `Paid against ${purchaseNo}`, createdBy: userId, sourceType: "pay_bill", originModule: "weaving.pay_bill", moduleScope: "weaving", referenceId: row._id, billNo: paymentNo, lines: [{ account: partyAccount._id, type: "debit", amount: paidNow }, { account: paymentAccount._id, type: "credit", amount: paidNow }] }, session);
      const transaction = await createOne(WeavingMoneyTransaction, { userId, requestKey: paymentRequestKey, transactionNo: paymentNo, type: "pay", date: payload.purchaseDate, partyId: party._id, purchaseInvoiceId: row._id, amount: paidNow, paymentAccountId: paymentAccount._id, paymentMethod: payload.paymentMethod || paymentAccount.category, description: `Paid against ${purchaseNo}`, journalEntryId: paymentJournal._id }, session);
      row.paidAmount = paidNow; row.balanceDue = round(grandTotal - paidNow); row.paymentStatus = row.balanceDue <= 0 ? "paid" : "partial"; row.paymentTransactionIds = [transaction._id];
    }
    await row.save(sessionOptions(session));
    return row;
  });
  await recalculateAccountBalances([...new Set(touchedAccountIds.map(String))]);
  return invoice;
};

const createPurchase = async (userId, payload) => {
  if (payload.purchaseType === "fabric") return createFabricPurchase(userId, payload);
  const requestKey = text(payload.requestKey);
  if (!requestKey) throw error("Request key is required");
  const existing = await WeavingPurchaseInvoice.findOne({ userId, requestKey });
  if (existing) return existing;
  const purchaseType = ["yarn", "fabric", "parts", "other"].includes(payload.purchaseType) ? payload.purchaseType : "other"; const yarnSource = payload.yarnSource === "party" ? "party" : "own";
  const nonFinancialPartyYarn = purchaseType === "yarn" && yarnSource === "party";
  const allowedRoles = nonFinancialPartyYarn ? ["customer", "both"] : ["supplier", "both"];
  const party = await WeavingParty.findOne({ _id: payload.partyId, userId, isActive: true, isHidden: false, role: { $in: allowedRoles } });
  if (!party) throw error(nonFinancialPartyYarn ? "Customer / Party is required for Party-owned Yarn" : "Supplier / Party is required");
  const entryMode = ["yarn", "fabric"].includes(purchaseType) ? "detailed" : payload.entryMode === "detailed" ? "detailed" : "quick";
  const lines = entryMode === "quick" ? [] : await normalizePurchaseLines(userId, { ...payload, purchaseType });
  let quickDebit = null; const quickAmount = entryMode === "quick" ? round(payload.quickAmount) : 0;
  if (entryMode === "quick") { if (quickAmount <= 0) throw error("Bill Amount is required"); const allowedType = payload.quickNature === "asset" ? "Asset" : "Expense"; quickDebit = await Account.findOne({ _id: payload.quickDebitAccountId, userId, moduleScope: "weaving", isActive: true, type: allowedType }); if (!quickDebit) throw error(`Valid ${allowedType} account is required`); }
  const grandTotal = entryMode === "quick" ? quickAmount : round(lines.reduce((s, l) => s + l.amount, 0)); const nonFinancial = purchaseType === "yarn" && yarnSource === "party";
  const paidNow = round(payload.paidNow);
  if (paidNow < 0 || paidNow > grandTotal || (nonFinancial && paidNow > 0)) throw error("Paid Now cannot exceed Bill Total");
  const purchaseNo = payload.purchaseNo || await nextNo(WeavingPurchaseInvoice, userId, "purchaseNo", "WP");
  const creditDays = Math.max(0, Number(payload.creditDays) || 0); const calculatedDue = creditDays && payload.purchaseDate ? new Date(`${payload.purchaseDate}T00:00:00.000Z`) : null; if (calculatedDue) calculatedDue.setUTCDate(calculatedDue.getUTCDate() + creditDays);
  const partyAccount = nonFinancial ? null : await ensurePartyAccount(userId, party);
  const paymentAccount = paidNow > 0 ? await ensurePaymentAccount(userId, payload.paymentAccountId) : null;
  const grouped = new Map();
  if (!nonFinancial) {
    if (entryMode === "quick") grouped.set(String(quickDebit._id), { account: quickDebit._id, type: "debit", amount: grandTotal });
    for (const line of lines) {
      let debit = line.debitAccountId ? await Account.findOne({ _id: line.debitAccountId, userId, moduleScope: "weaving", type: { $in: ["Asset", "Expense"] } }) : null;
      if (!debit) debit = await ensureAccount(userId, purchaseType === "yarn" ? "WEAVING_YARN_INVENTORY" : purchaseType === "parts" ? "WEAVING_MAINTENANCE_EXP" : line.nature === "asset" ? "WEAVING_FIXED_ASSETS" : "WEAVING_OTHER_EXP");
      grouped.set(String(debit._id), { account: debit._id, type: "debit", amount: round((grouped.get(String(debit._id))?.amount || 0) + line.amount) });
    }
  }
  const directGroups = new Map();
  lines.forEach((line) => {
    if (line.destinationType !== "direct_sizing") return;
    const groupKey = `${line.sizingPartyId}:${line.contractId || ""}`;
    if (!directGroups.has(groupKey)) directGroups.set(groupKey, []);
    directGroups.get(groupKey).push(line);
  });
  const firstIssueNo = directGroups.size ? await nextNo(WeavingSizingIssue, userId, "issueNo", "SI") : "";
  const firstIssueSequence = Number(firstIssueNo.match(/(\d+)$/)?.[1] || 1);
  const paymentNo = paidNow > 0 ? await nextNo(WeavingMoneyTransaction, userId, "transactionNo", "PAY") : "";
  const touchedAccountIds = [...grouped.values().map((line) => line.account), ...(partyAccount ? [partyAccount._id] : []), ...(paymentAccount ? [paymentAccount._id] : [])];
  const invoice = await runAtomic(async (session) => {
    const duplicate = await WeavingPurchaseInvoice.findOne({ userId, requestKey }, null, sessionOptions(session));
    if (duplicate) return duplicate;
    const row = await createOne(WeavingPurchaseInvoice, { userId, requestKey, purchaseNo, purchaseDate: payload.purchaseDate, purchaseType, yarnSource, partyId: party._id, partyName: party.name, supplierInvoiceNo: text(payload.supplierInvoiceNo), attachmentUrl: text(payload.attachmentUrl), attachments: payload.attachments || [], notes: text(payload.notes), dueDate: text(payload.dueDate) || (calculatedDue ? calculatedDue.toISOString().slice(0, 10) : ""), creditDays, gatePassNo: text(payload.gatePassNo), entryMode, quickAmount, quickNature: entryMode === "quick" ? (payload.quickNature === "asset" ? "asset" : "expense") : "", quickDebitAccountId: quickDebit?._id || null, lines, grandTotal, paidAmount: paidNow, balanceDue: nonFinancial ? 0 : round(grandTotal - paidNow), paymentStatus: nonFinancial ? "non_financial" : paidNow >= grandTotal ? "paid" : paidNow > 0 ? "partial" : "unpaid" }, session);
    let yarnMovements = [];
    if (purchaseType === "yarn") yarnMovements = await WeavingYarnMovement.insertMany(row.lines.map((line) => ({ userId, yarnId: line.yarnId, date: payload.purchaseDate, movementType: nonFinancial ? "party_inward" : "purchase_in", ownershipType: nonFinancial ? "party" : "own", ownerPartyId: nonFinancial ? party._id : null, purchaseInvoiceId: row._id, contractId: line.contractId, quantityKg: line.quantity, rate: line.rate, destinationType: line.destinationType, godownId: line.godownId, sizingPartyId: line.sizingPartyId, packageType: line.packageType, packageQty: line.packageQty, coneSize: line.coneSize, conesPerPackage: line.conesPerPackage, extraCones: line.extraCones, totalCones: line.totalCones, smallCones: line.smallCones, largeCones: line.largeCones, lotReference: line.lotReference, notes: payload.notes })), sessionOptions(session));
    if (directGroups.size) {
      const movementByLine = new Map(row.lines.map((line, index) => [String(line._id), yarnMovements[index]]));
      const invoiceGroups = new Map();
      row.lines.forEach((line) => {
        if (line.destinationType !== "direct_sizing") return;
        const groupKey = `${line.sizingPartyId}:${line.contractId || ""}`;
        if (!invoiceGroups.has(groupKey)) invoiceGroups.set(groupKey, []);
        invoiceGroups.get(groupKey).push(line);
      });
      let issueIndex = 0;
      for (const invoiceLines of invoiceGroups.values()) {
        const issueNo = `SI-${String(firstIssueSequence + issueIndex).padStart(5, "0")}`;
        issueIndex += 1;
        const issue = await createOne(WeavingSizingIssue, { userId, issueNo, date: payload.purchaseDate, sizingPartyId: invoiceLines[0].sizingPartyId, contractId: invoiceLines[0].contractId || null, gatePassNo: text(payload.gatePassNo), notes: `Direct Purchase ${purchaseNo}`, sourceType: "direct_purchase", sourcePurchaseId: row._id, lines: invoiceLines.map((line) => ({ yarnId: line.yarnId, quantityKg: line.quantity, packageType: line.packageType, packageQty: line.packageQty, coneSize: line.coneSize, conesPerPackage: line.conesPerPackage, extraCones: line.extraCones, totalCones: line.totalCones, smallCones: line.smallCones, largeCones: line.largeCones, lotReference: line.lotReference, sourcePurchaseLineId: line._id, ownershipType: nonFinancial ? "party" : "own", ownerPartyId: nonFinancial ? party._id : null })), movementIds: invoiceLines.map((line) => movementByLine.get(String(line._id))?._id).filter(Boolean) }, session);
        await WeavingYarnMovement.updateMany({ _id: { $in: issue.movementIds }, userId }, { $set: { sizingIssueId: issue._id } }, sessionOptions(session));
        row.sizingIssueIds.push(issue._id);
      }
    }
    if (!nonFinancial) {
      const purchaseJournal = await createOne(JournalEntry, { date: new Date(`${payload.purchaseDate}T00:00:00.000Z`), description: `Purchase ${purchaseNo} - ${party.name}`, createdBy: userId, sourceType: "purchase_invoice", originModule: "weaving.purchase", moduleScope: "weaving", referenceId: row._id, invoiceId: row._id, invoiceModel: "WeavingPurchaseInvoice", billNo: purchaseNo, lines: [...grouped.values(), { account: partyAccount._id, type: "credit", amount: grandTotal }] }, session);
      row.purchaseJournalId = purchaseJournal._id;
      if (paidNow > 0) {
        const paymentJournal = await createOne(JournalEntry, { date: new Date(`${payload.purchaseDate}T00:00:00.000Z`), description: `Paid against ${purchaseNo}`, createdBy: userId, sourceType: "pay_bill", originModule: "weaving.pay_bill", moduleScope: "weaving", referenceId: row._id, billNo: paymentNo, lines: [{ account: partyAccount._id, type: "debit", amount: paidNow }, { account: paymentAccount._id, type: "credit", amount: paidNow }] }, session);
        const payment = await createOne(WeavingMoneyTransaction, { userId, requestKey: `purchase:${requestKey}:payment`, transactionNo: paymentNo, type: "pay", date: payload.purchaseDate, partyId: party._id, purchaseInvoiceId: row._id, amount: paidNow, paymentAccountId: paymentAccount._id, paymentMethod: payload.paymentMethod || paymentAccount.category, description: `Paid against ${purchaseNo}`, journalEntryId: paymentJournal._id }, session);
        row.paymentTransactionIds.push(payment._id);
      }
    }
    await row.save(sessionOptions(session));
    return row;
  });
  if (touchedAccountIds.length) await recalculateAccountBalances([...new Set(touchedAccountIds.map(String))]);
  return invoice;
};

const createReversalInSession = async ({ userId, journalId, date, reason, session }) => {
  if (!journalId) return null;
  const original = await JournalEntry.findOne({ _id: journalId, createdBy: userId, moduleScope: "weaving", isDeleted: false, isReversed: false }, null, sessionOptions(session));
  if (!original) return null;
  const reversal = await createOne(JournalEntry, { date: new Date(`${date}T00:00:00.000Z`), description: reason, createdBy: userId, sourceType: "reversal", originModule: "weaving.reversal", moduleScope: "weaving", referenceId: original.referenceId, invoiceId: original.invoiceId, invoiceModel: original.invoiceModel, billNo: original.billNo, isReversal: true, reversalOf: original._id, lines: original.lines.map((line) => ({ account: line.account, type: line.type === "debit" ? "credit" : "debit", amount: line.amount })) }, session);
  original.isReversed = true;
  await original.save(sessionOptions(session));
  return reversal;
};

const assertPurchaseHasNoDownstreamUse = async (userId, invoice, session = null) => {
  const activePayments = await WeavingMoneyTransaction.find({ userId, purchaseInvoiceId: invoice._id, status: "posted" }, null, sessionOptions(session));
  const automaticPayment = (transaction) => invoice.requestKey && transaction.requestKey === `purchase:${invoice.requestKey}:payment`;
  if (activePayments.some((transaction) => !automaticPayment(transaction))) throw error("Reverse later payments linked to this Purchase before editing or voiding it", 409);
  if (invoice.sizingIssueIds?.length) {
    const downstreamSizing = await WeavingSizingReceipt.exists({ userId, issueId: { $in: invoice.sizingIssueIds }, status: { $ne: "void" } }).session(session || null);
    const returnedSizing = await WeavingYarnMovement.exists({ userId, sizingIssueId: { $in: invoice.sizingIssueIds }, movementType: { $in: ["sizing_receipt", "sizing_return"] }, isVoided: { $ne: true } }).session(session || null);
    if (downstreamSizing || returnedSizing) throw error("This Direct Sizing Purchase has receipts or returns and cannot be changed", 409);
  }
  if (invoice.purchaseType === "yarn") {
    const stockLines = invoice.lines.filter((line) => line.destinationType !== "direct_sizing" && line.godownId);
    if (stockLines.length) {
      const downstream = await WeavingYarnMovement.exists({ userId, createdAt: { $gt: invoice.createdAt }, isVoided: { $ne: true }, movementType: { $in: ["sizing_issue", "sale_out", "transfer_out", "weft_consumption"] }, $or: stockLines.map((line) => ({ yarnId: line.yarnId, sourceGodownId: line.godownId })) }).session(session || null);
      if (downstream) throw error("Purchased Yarn has already been used downstream and cannot be changed", 409);
    }
  }
  if (invoice.purchaseType === "fabric") {
    const downstream = await WeavingFabricMovement.exists({ userId, createdAt: { $gt: invoice.createdAt }, isVoided: { $ne: true }, direction: "out", $or: invoice.lines.map((line) => ({ fabricQualityId: line.fabricQualityId, godownId: line.godownId, category: line.fabricGrade })) }).session(session || null);
    if (downstream) throw error("Purchased Fabric has already been used downstream and cannot be changed", 409);
  }
  return activePayments;
};

const voidPurchase = async (userId, invoiceId, actorId, reason) => {
  const seed = await WeavingPurchaseInvoice.findOne({ _id: invoiceId, userId, status: "posted" });
  if (!seed) throw error("Posted Purchase not found", 404);
  await assertPurchaseHasNoDownstreamUse(userId, seed);
  const touchedAccountIds = [];
  const result = await runAtomic(async (session) => {
    const invoice = await WeavingPurchaseInvoice.findOne({ _id: invoiceId, userId, status: "posted" }, null, sessionOptions(session));
    if (!invoice) throw error("Purchase changed before it could be voided", 409);
    const payments = await assertPurchaseHasNoDownstreamUse(userId, invoice, session);
    const reversalIds = [];
    const purchaseReversal = await createReversalInSession({ userId, journalId: invoice.purchaseJournalId, date: new Date().toISOString().slice(0, 10), reason: `Void ${invoice.purchaseNo}: ${text(reason)}`, session });
    if (purchaseReversal) { reversalIds.push(purchaseReversal._id); touchedAccountIds.push(...purchaseReversal.lines.map((line) => line.account)); }
    for (const payment of payments) {
      const reversal = await createReversalInSession({ userId, journalId: payment.journalEntryId, date: new Date().toISOString().slice(0, 10), reason: `Void payment for ${invoice.purchaseNo}`, session });
      if (reversal) { reversalIds.push(reversal._id); touchedAccountIds.push(...reversal.lines.map((line) => line.account)); }
      payment.status = "void"; payment.voidedAt = new Date(); payment.voidReason = `Source Purchase ${invoice.purchaseNo} voided`; payment.reversalJournalId = reversal?._id || null; await payment.save(sessionOptions(session));
    }
    await Promise.all([
      WeavingYarnMovement.updateMany({ userId, purchaseInvoiceId: invoice._id, isVoided: { $ne: true } }, { $set: { isVoided: true } }, sessionOptions(session)),
      WeavingFabricMovement.updateMany({ userId, purchaseInvoiceId: invoice._id, isVoided: { $ne: true } }, { $set: { isVoided: true } }, sessionOptions(session)),
      WeavingSizingIssue.updateMany({ userId, sourcePurchaseId: invoice._id, status: "posted" }, { $set: { status: "void", voidedAt: new Date() } }, sessionOptions(session)),
    ]);
    invoice.status = "void"; invoice.voidedAt = new Date(); invoice.voidedBy = actorId; invoice.voidReason = text(reason); invoice.balanceDue = 0; invoice.paymentStatus = invoice.paymentStatus === "non_financial" ? "non_financial" : "paid"; invoice.reversalJournalIds.push(...reversalIds);
    await invoice.save(sessionOptions(session));
    return invoice;
  });
  if (touchedAccountIds.length) await recalculateAccountBalances([...new Set(touchedAccountIds.map(String))]);
  return result;
};

const updatePurchase = async (userId, invoiceId, payload, actorId) => {
  const current = await WeavingPurchaseInvoice.findOne({ _id: invoiceId, userId, status: "posted" });
  if (!current) throw error("Posted Purchase not found", 404);
  await assertPurchaseHasNoDownstreamUse(userId, current);
  if (payload.purchaseType && payload.purchaseType !== current.purchaseType) throw error("Purchase Type cannot be changed during edit", 409);
  const revisionKey = `purchase-edit:${current._id}:${Date.now()}:${Math.random()}`;
  const replacementPayload = {
    ...payload,
    purchaseType: current.purchaseType,
    yarnSource: payload.yarnSource || current.yarnSource,
    requestKey: revisionKey,
    purchaseNo: "",
    attachmentUrl: payload.attachmentUrl ?? current.attachmentUrl,
    attachments: payload.attachments?.length ? payload.attachments : current.attachments,
  };
  const replacement = await createPurchase(userId, replacementPayload);
  try {
    await voidPurchase(userId, current._id, actorId, `Edited and replaced by ${replacement.purchaseNo}`);
  } catch (failure) {
    // Standalone Mongo cannot span both version posts; compensate by voiding the new version.
    await voidPurchase(userId, replacement._id, actorId, `Edit rollback: ${failure.message}`);
    throw failure;
  }
  replacement.replacesPurchaseId = current._id;
  await replacement.save();
  current.activeReplacementId = replacement._id;
  await current.save();
  return replacement;
};

module.exports = { ensureAccount, ensurePartyAccount, createJournal, reverseJournal, reconcileOpeningBalance, resolveEffectiveWeavingPartyLedgerJournals, partyBalance, getPartyLedger, mergeParties: costing.withCostingInvalidation(mergeParties, "party_merge"), postMoneyTransaction, createPurchase: costing.withCostingInvalidation(createPurchase, "purchase", (invoice) => ["yarn", "fabric"].includes(invoice?.purchaseType)), updatePurchase: costing.withCostingInvalidation(updatePurchase, "purchase", (invoice) => ["yarn", "fabric"].includes(invoice?.purchaseType)), voidPurchase: costing.withCostingInvalidation(voidPurchase, "purchase", (invoice) => ["yarn", "fabric"].includes(invoice?.purchaseType)), nextNo, round, _test: { buildLedgerSource, calculateEffectivePartyLedger, openingBalanceIsUnchanged, resolveEffectiveWeavingPartyLedgerJournals, createJournal, reverseJournal, normalizePurchaseLines, consolidateJournalLines, mergeRoles, assertPurchaseHasNoDownstreamUse } };
