const mongoose = require("mongoose");

const Account = require("../../models/Account");
const JournalEntry = require("../../models/JournalEntry");
const TravelRefund = require("../../models/TravelRefund");
const TravelVendorReturn = require("../../models/TravelVendorReturn");
const { createPaymentEntry } = require("../../utils/paymentService");
const { createReversalEntry } = require("../../utils/journalReversal");
const { parseBusinessDateTime, getCurrentBusinessTimeInput } = require("../../utils/businessDate");
const { applyModuleScopeFilter, MODULE_SCOPES } = require("../../utils/moduleScope");
const {
  getTravelCustomerBalanceMap,
  getTravelPartyBalanceMap,
  getTravelVendorBalanceMap,
  roundMoney,
} = require("./travelAccountingMetricsService");
const {
  getCustomerJournalIdentity,
  getVendorJournalIdentity,
  resolveTravelCustomerCounterparty,
  resolveTravelVendorCounterparty,
  serializeCounterparty,
} = require("./travelCounterpartyService");
const { clearTravelReportCache } = require("./travelReportCacheService");
const {
  collectJournalAccountIds,
  recalculateTravelSoftDeleteAccounts,
} = require("./travelSoftDeleteService");

const TRAVEL_REFUND_ORIGIN = "travel_refund";
const TRAVEL_VENDOR_RETURN_ORIGIN = "travel_vendor_return";
const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];
const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const toObjectId = (value, label) => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw httpError(400, `Invalid ${label}`);
  }
  return new mongoose.Types.ObjectId(String(value));
};
const cleanString = (value) => String(value || "").trim();
const money = (value, label = "amount") => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) throw httpError(400, `Invalid ${label}`);
  const rounded = roundMoney(amount);
  if (rounded <= 0) throw httpError(400, `Invalid ${label}`);
  return rounded;
};
const normalizePaymentType = (value) => {
  const normalized = cleanString(value || "cash").toLowerCase();
  const paymentType = normalized === "bank" ? "online" : normalized;
  if (!PAYMENT_TYPES.has(paymentType)) throw httpError(400, "Invalid payment type");
  return paymentType;
};
const getSessionQuery = (query, session) => (session ? query.session(session) : query);
const identityKey = (type, id) => `${type}:${String(id || "")}`;
const getSettlementLimit = (total, settled, availableCredit) => {
  const outstanding = Math.max(roundMoney(Number(total || 0) - Number(settled || 0)), 0);
  return {
    outstanding,
    safeMaximum: Math.max(Math.min(outstanding, roundMoney(availableCredit || 0)), 0),
  };
};

const getPaymentAccount = async ({ userId, accountId, session }) => {
  const query = Account.findOne(
    applyModuleScopeFilter(
      {
        _id: toObjectId(accountId, "payment account"),
        userId: toObjectId(userId, "user"),
        isActive: { $ne: false },
        type: "Asset",
        category: { $in: PAYMENT_ACCOUNT_CATEGORIES },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  ).select("_id name code category type");
  const account = await getSessionQuery(query, session);
  if (!account) throw httpError(400, "Payment account not found");
  return account;
};

const getCustomerAvailableCredit = async (userId, customer, session) => {
  const map = customer.entityType === "party"
    ? await getTravelPartyBalanceMap(userId, [customer.record], { session })
    : await getTravelCustomerBalanceMap(userId, [customer.record], { session });
  return Math.max(-roundMoney(map.get(String(customer.accountId)) || 0), 0);
};

const getVendorAvailableCredit = async (userId, vendor, session) => {
  const map = vendor.entityType === "party"
    ? await getTravelPartyBalanceMap(userId, [vendor.record], { session })
    : await getTravelVendorBalanceMap(userId, [vendor.record], { session });
  const balance = roundMoney(map.get(String(vendor.accountId)) || 0);
  return vendor.entityType === "party" ? Math.max(balance, 0) : Math.max(-balance, 0);
};

const settlementDate = (body = {}) => {
  const time = cleanString(body.time) || getCurrentBusinessTimeInput();
  let date;
  try {
    date = parseBusinessDateTime(body.date || new Date(), time, {
      defaultTime: "00:00",
      label: "settlement date",
    });
  } catch {
    throw httpError(400, "Invalid settlement date");
  }
  return { date, time };
};

const serializeHistory = (journal) => {
  const lines = journal.lines || [];
  const paymentLine = lines.find((line) => line.paymentType);
  const accountLine = lines.find((line) => {
    const account = line.account || {};
    return account.type === "Asset" && PAYMENT_ACCOUNT_CATEGORIES.includes(account.category);
  }) || paymentLine;
  return {
    _id: journal._id,
    date: journal.date,
    time: journal.time || "",
    amount: roundMoney(paymentLine?.amount || lines[0]?.amount || 0),
    paymentType: paymentLine?.paymentType || "",
    paymentAccount: accountLine?.account || null,
    description: journal.description || "",
    note: journal.note || "",
    billNo: journal.billNo || "",
    isReversed: journal.isReversed === true,
    createdAt: journal.createdAt,
  };
};

const historyQuery = ({ userId, referenceId, originModule, sourceType, identity = null }) => {
  const query = {
    createdBy: toObjectId(userId, "user"),
    referenceId: toObjectId(referenceId, "source"),
    originModule,
    sourceType,
    isDeleted: false,
  };
  if (identity?.entityType === "party") query.partyId = identity.id;
  if (identity?.entityType === "vendor") query.supplierId = identity.id;
  if (identity?.entityType === "customer") query.customerId = identity.id;
  return query;
};

const fetchHistory = async (options) => {
  const journals = await JournalEntry.find(historyQuery(options))
    .populate("lines.account", "name code category type")
    .sort({ date: 1, time: 1, _id: 1 })
    .lean();
  return journals.map(serializeHistory);
};

const getRefundVendorGroups = (refund) => {
  const groups = new Map();
  (refund.refundItems || []).forEach((item) => {
    const isParty = item.vendorType === "party" || Boolean(item.vendorPartyId);
    const id = isParty ? item.vendorPartyId : item.vendorId;
    const amount = roundMoney(item.vendorRecoveryAmount || 0);
    if (!id || amount <= 0) return;
    const entityType = isParty ? "party" : "vendor";
    const key = identityKey(entityType, id);
    const current = groups.get(key) || { entityType, entityId: id, amount: 0, items: [] };
    current.amount = roundMoney(current.amount + amount);
    current.items.push(item);
    groups.set(key, current);
  });
  return [...groups.values()];
};

const getRecoveryReceivedMap = async (userId, refundIds = []) => {
  if (!refundIds.length) return new Map();
  const rows = await JournalEntry.find({
    createdBy: toObjectId(userId, "user"),
    referenceId: { $in: refundIds },
    originModule: TRAVEL_REFUND_ORIGIN,
    sourceType: "purchase_return_payment",
    isDeleted: false,
    isReversed: { $ne: true },
  }).select("referenceId supplierId partyId lines").lean();
  const map = new Map();
  rows.forEach((journal) => {
    const entityType = journal.partyId ? "party" : "vendor";
    const entityId = journal.partyId || journal.supplierId;
    if (!entityId) return;
    const key = `${journal.referenceId}:${identityKey(entityType, entityId)}`;
    const amount = roundMoney(journal.lines?.[0]?.amount || 0);
    map.set(key, roundMoney((map.get(key) || 0) + amount));
  });
  return map;
};

const getOutstandingCustomerRefunds = async ({ userId, query = {} }) => {
  const filter = {
    userId: toObjectId(userId, "user"),
    isDeleted: false,
    isReversed: { $ne: true },
    $expr: { $gt: ["$customerRefundAmount", "$paidBackAmount"] },
  };
  if (query.refundId) filter._id = toObjectId(query.refundId, "refund");
  if (query.customerType === "party" || query.customerPartyId) {
    filter.customerType = "party";
    filter.customerPartyId = toObjectId(query.customerPartyId, "customer party");
  } else if (query.customerId) {
    filter.customerType = { $ne: "party" };
    filter.customerId = toObjectId(query.customerId, "customer");
  }
  const records = await TravelRefund.find(filter)
    .populate("customerId", "name phone email account")
    .populate("customerPartyId", "name phone email account role")
    .populate("originalInvoiceId", "invoiceNumber bookingNumber")
    .sort({ refundDate: -1, _id: -1 })
    .lean();
  return records.map((record) => ({
    ...record,
    outstandingAmount: roundMoney(record.customerRefundAmount - record.paidBackAmount),
  }));
};

const getOutstandingVendorSources = async ({ userId, query = {} }) => {
  const vendorFilter = {};
  let entityType = "";
  let entityId = null;
  if (query.vendorType === "party" || query.vendorPartyId) {
    entityType = "party";
    entityId = toObjectId(query.vendorPartyId, "vendor party");
    vendorFilter.vendorType = "party";
    vendorFilter.vendorPartyId = entityId;
  } else if (query.vendorId) {
    entityType = "vendor";
    entityId = toObjectId(query.vendorId, "vendor");
    vendorFilter.vendorType = { $ne: "party" };
    vendorFilter.vendorId = entityId;
  }
  const sourceFilter = query.sourceId ? { _id: toObjectId(query.sourceId, "source") } : {};
  const [returns, refunds] = await Promise.all([
    query.sourceType === "travel_refund" ? [] : TravelVendorReturn.find({
      userId: toObjectId(userId, "user"), isDeleted: false, isReversed: { $ne: true },
      $expr: { $gt: ["$vendorReturnAmount", "$amountReceivedNow"] },
      ...vendorFilter, ...(!query.sourceType || query.sourceType === "travel_vendor_return" ? sourceFilter : {}),
    }).populate("vendorId", "name phone email account").populate("vendorPartyId", "name phone email account role")
      .populate("originalInvoiceId", "invoiceNumber bookingNumber").lean(),
    query.sourceType === "travel_vendor_return" ? [] : TravelRefund.find({
      userId: toObjectId(userId, "user"), isDeleted: false, isReversed: { $ne: true },
      "refundItems.vendorRecoveryAmount": { $gt: 0 },
      ...(!query.sourceType || query.sourceType === "travel_refund" ? sourceFilter : {}),
    }).populate("refundItems.vendorId", "name phone email account")
      .populate("refundItems.vendorPartyId", "name phone email account role")
      .populate("originalInvoiceId", "invoiceNumber bookingNumber").lean(),
  ]);
  const receivedMap = await getRecoveryReceivedMap(userId, refunds.map((refund) => refund._id));
  const sources = returns.map((record) => ({
    sourceType: TRAVEL_VENDOR_RETURN_ORIGIN,
    sourceId: record._id,
    sourceNumber: record.returnNumber,
    originalInvoiceId: record.originalInvoiceId,
    originalInvoiceNumber: record.originalInvoiceNumber,
    serviceLabel: record.serviceLabel,
    entityType: record.vendorType === "party" ? "party" : "vendor",
    entityId: record.vendorType === "party" ? record.vendorPartyId?._id : record.vendorId?._id,
    counterparty: record.vendorType === "party" ? record.vendorPartyId : record.vendorId,
    totalAmount: roundMoney(record.vendorReturnAmount),
    settledAmount: roundMoney(record.amountReceivedNow),
    outstandingAmount: roundMoney(record.vendorReturnAmount - record.amountReceivedNow),
  }));
  refunds.forEach((refund) => {
    getRefundVendorGroups(refund).forEach((group) => {
      if (entityType && (group.entityType !== entityType || String(group.entityId) !== String(entityId))) return;
      const key = `${refund._id}:${identityKey(group.entityType, group.entityId)}`;
      const settledAmount = roundMoney(receivedMap.get(key) || 0);
      const outstandingAmount = roundMoney(group.amount - settledAmount);
      if (outstandingAmount <= 0) return;
      const first = group.items[0];
      sources.push({
        sourceType: TRAVEL_REFUND_ORIGIN,
        sourceId: refund._id,
        sourceNumber: refund.refundNumber,
        originalInvoiceId: refund.originalInvoiceId,
        originalInvoiceNumber: refund.originalInvoiceNumber,
        serviceLabel: group.items.map((item) => item.title).filter(Boolean).join(", "),
        entityType: group.entityType,
        entityId: group.entityId,
        counterparty: group.entityType === "party" ? first.vendorPartyId : first.vendorId,
        totalAmount: group.amount,
        settledAmount,
        outstandingAmount,
      });
    });
  });
  return sources.sort((a, b) => String(b.sourceId).localeCompare(String(a.sourceId)));
};

const settleCustomerRefund = async ({ userId, actorId, refundId, body = {} }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const refund = await TravelRefund.findOne({
        _id: toObjectId(refundId, "refund"), userId: toObjectId(userId, "user"),
        isDeleted: false, isReversed: { $ne: true },
      }).session(session);
      if (!refund) throw httpError(404, "Travel refund not found");
      const amount = money(body.amount, "refund payment amount");
      const { outstanding } = getSettlementLimit(
        refund.customerRefundAmount,
        refund.paidBackAmount,
        Number.MAX_SAFE_INTEGER,
      );
      if (amount > outstanding) throw httpError(400, "Payment exceeds outstanding customer refund");
      const customer = await resolveTravelCustomerCounterparty({ userId, source: refund, session });
      const availableCredit = roundMoney(await getCustomerAvailableCredit(userId, customer, session));
      if (availableCredit <= 0) throw httpError(400, "No refundable customer credit is currently payable");
      if (amount > availableCredit) throw httpError(400, "Payment exceeds current refundable customer credit");
      const account = await getPaymentAccount({ userId, accountId: body.accountId, session });
      const paymentType = normalizePaymentType(body.paymentType);
      const timing = settlementDate(body);
      const description = [
        `Travel Refund Payment ${refund.refundNumber}`,
        cleanString(body.reference), cleanString(body.notes),
      ].filter(Boolean).join(" - ");
      const journal = await createPaymentEntry({
        userId, referenceId: refund._id, sourceType: "refund_payment",
        originModule: TRAVEL_REFUND_ORIGIN, billNo: refund.refundNumber,
        accountId: account._id, counterPartyAccountId: customer.accountId, amount,
        paymentType, description, ...getCustomerJournalIdentity(customer),
        entryDate: timing.date, entryTime: timing.time, session,
      });
      refund.paidBackAmount = roundMoney(refund.paidBackAmount + amount);
      await refund.save({ session });
      result = {
        refund: refund.toObject(), journalEntryId: journal._id,
        outstandingAmount: roundMoney(refund.customerRefundAmount - refund.paidBackAmount),
        availableCredit, accountIds: collectJournalAccountIds([journal]),
      };
    });
    await recalculateTravelSoftDeleteAccounts(result.accountIds);
    clearTravelReportCache(userId);
    delete result.accountIds;
    return result;
  } finally {
    await session.endSession();
  }
};

const resolveVendorSource = async ({ userId, sourceType, sourceId, body, session }) => {
  if (sourceType === TRAVEL_VENDOR_RETURN_ORIGIN) {
    const record = await TravelVendorReturn.findOne({
      _id: toObjectId(sourceId, "vendor return"), userId: toObjectId(userId, "user"),
      isDeleted: false, isReversed: { $ne: true },
    }).session(session);
    if (!record) throw httpError(404, "Travel vendor return not found");
    const vendor = await resolveTravelVendorCounterparty({ userId, source: record, session });
    return {
      record, vendor, total: roundMoney(record.vendorReturnAmount),
      settled: roundMoney(record.amountReceivedNow), billNo: record.returnNumber,
      originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
    };
  }
  if (sourceType !== TRAVEL_REFUND_ORIGIN) throw httpError(400, "Invalid vendor refund source");
  const record = await TravelRefund.findOne({
    _id: toObjectId(sourceId, "refund"), userId: toObjectId(userId, "user"),
    isDeleted: false, isReversed: { $ne: true },
  }).session(session);
  if (!record) throw httpError(404, "Travel refund not found");
  const vendor = await resolveTravelVendorCounterparty({ userId, source: body, session });
  const group = getRefundVendorGroups(record).find(
    (candidate) => candidate.entityType === vendor.entityType && String(candidate.entityId) === String(vendor.id),
  );
  if (!group) throw httpError(404, "Vendor recovery source not found in this refund");
  const journals = await JournalEntry.find(historyQuery({
    userId, referenceId: record._id, originModule: TRAVEL_REFUND_ORIGIN,
    sourceType: "purchase_return_payment", identity: { entityType: vendor.entityType, id: vendor.id },
  })).session(session).lean();
  const settled = roundMoney(journals.filter((journal) => !journal.isReversed)
    .reduce((sum, journal) => sum + Number(journal.lines?.[0]?.amount || 0), 0));
  return {
    record, vendor, total: group.amount, settled, billNo: record.refundNumber,
    originModule: TRAVEL_REFUND_ORIGIN,
  };
};

const settleVendorRefund = async ({ userId, actorId, sourceType, sourceId, body = {} }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const source = await resolveVendorSource({ userId, sourceType, sourceId, body, session });
      const amount = money(body.amount, "vendor refund receipt amount");
      const { outstanding } = getSettlementLimit(source.total, source.settled, Number.MAX_SAFE_INTEGER);
      if (amount > outstanding) throw httpError(400, "Receipt exceeds outstanding vendor refund");
      const availableCredit = roundMoney(await getVendorAvailableCredit(userId, source.vendor, session));
      if (availableCredit <= 0) throw httpError(400, "No vendor credit is currently available to receive");
      if (amount > availableCredit) throw httpError(400, "Receipt exceeds current vendor credit");
      const account = await getPaymentAccount({ userId, accountId: body.accountId, session });
      const paymentType = normalizePaymentType(body.paymentType);
      const timing = settlementDate(body);
      const description = [
        `Travel Vendor Refund Receipt ${source.billNo} - ${source.vendor.name}`,
        cleanString(body.reference), cleanString(body.notes),
      ].filter(Boolean).join(" - ");
      const journal = await createPaymentEntry({
        userId, referenceId: source.record._id,
        sourceType: "purchase_return_payment", originModule: source.originModule,
        billNo: source.billNo, accountId: account._id,
        counterPartyAccountId: source.vendor.accountId, amount, paymentType,
        description, ...getVendorJournalIdentity(source.vendor),
        entryDate: timing.date, entryTime: timing.time, session,
      });
      if (source.originModule === TRAVEL_VENDOR_RETURN_ORIGIN) {
        source.record.amountReceivedNow = roundMoney(source.record.amountReceivedNow + amount);
        await source.record.save({ session });
      }
      result = {
        sourceType: source.originModule, sourceId: source.record._id,
        source: source.record.toObject(), journalEntryId: journal._id,
        outstandingAmount: roundMoney(outstanding - amount), availableCredit,
        accountIds: collectJournalAccountIds([journal]),
      };
    });
    await recalculateTravelSoftDeleteAccounts(result.accountIds);
    clearTravelReportCache(userId);
    delete result.accountIds;
    return result;
  } finally {
    await session.endSession();
  }
};

const reverseSettlement = async ({ userId, actorId, sourceType, sourceId, journalId, kind }) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const originModule = sourceType;
      const expectedSourceType = kind === "customer" ? "refund_payment" : "purchase_return_payment";
      const journal = await JournalEntry.findOne({
        _id: toObjectId(journalId, "journal"), createdBy: toObjectId(userId, "user"),
        referenceId: toObjectId(sourceId, "source"), originModule,
        sourceType: expectedSourceType, isDeleted: false, isReversed: { $ne: true },
      }).session(session);
      if (!journal) throw httpError(404, "Active settlement journal not found");
      const amount = roundMoney(journal.lines?.[0]?.amount || 0);
      const reversal = await createReversalEntry(journal, userId, {
        session, originModule, referenceId: journal.referenceId,
        customerId: journal.customerId, supplierId: journal.supplierId, partyId: journal.partyId,
        billNo: journal.billNo, description: `Reversal - ${journal.description || journal.billNo}`,
      });
      let source;
      if (kind === "customer") {
        source = await TravelRefund.findOne({ _id: sourceId, userId, isDeleted: false }).session(session);
        if (!source) throw httpError(404, "Travel refund not found");
        source.paidBackAmount = Math.max(roundMoney(source.paidBackAmount - amount), 0);
        if (String(source.paymentJournalEntryId || "") === String(journal._id)) source.paymentJournalEntryId = null;
        await source.save({ session });
      } else if (originModule === TRAVEL_VENDOR_RETURN_ORIGIN) {
        source = await TravelVendorReturn.findOne({ _id: sourceId, userId, isDeleted: false }).session(session);
        if (!source) throw httpError(404, "Travel vendor return not found");
        source.amountReceivedNow = Math.max(roundMoney(source.amountReceivedNow - amount), 0);
        if (String(source.paymentJournalEntryId || "") === String(journal._id)) source.paymentJournalEntryId = null;
        await source.save({ session });
      }
      result = {
        source, reversalJournalEntryId: reversal._id,
        accountIds: collectJournalAccountIds([journal, reversal]),
      };
    });
    await recalculateTravelSoftDeleteAccounts(result.accountIds);
    clearTravelReportCache(userId);
    delete result.accountIds;
    return result;
  } finally {
    await session.endSession();
  }
};

const getOutstandingSummary = async (userId) => {
  const [customerRefunds, vendorSources] = await Promise.all([
    getOutstandingCustomerRefunds({ userId }),
    getOutstandingVendorSources({ userId }),
  ]);
  const customers = new Map();
  customerRefunds.forEach((refund) => {
    const entityType = refund.customerType === "party" ? "party" : "customer";
    const entityId = entityType === "party" ? refund.customerPartyId?._id : refund.customerId?._id;
    if (!entityId) return;
    const key = identityKey(entityType, entityId);
    const row = customers.get(key) || { entityType, entityId, outstandingAmount: 0, count: 0 };
    row.outstandingAmount = roundMoney(row.outstandingAmount + refund.outstandingAmount);
    row.count += 1;
    customers.set(key, row);
  });
  const vendors = new Map();
  vendorSources.forEach((source) => {
    const key = identityKey(source.entityType, source.entityId);
    const row = vendors.get(key) || {
      entityType: source.entityType, entityId: source.entityId, outstandingAmount: 0, count: 0,
    };
    row.outstandingAmount = roundMoney(row.outstandingAmount + source.outstandingAmount);
    row.count += 1;
    vendors.set(key, row);
  });
  return { customers: [...customers.values()], vendors: [...vendors.values()] };
};

module.exports = {
  TRAVEL_REFUND_ORIGIN,
  TRAVEL_VENDOR_RETURN_ORIGIN,
  fetchHistory,
  getOutstandingCustomerRefunds,
  getOutstandingSummary,
  getOutstandingVendorSources,
  reverseSettlement,
  settleCustomerRefund,
  settleVendorRefund,
  _test: { getRefundVendorGroups, getSettlementLimit, identityKey },
};
