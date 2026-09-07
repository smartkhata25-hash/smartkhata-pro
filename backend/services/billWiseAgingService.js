const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const JournalEntry = require("../models/JournalEntry");
const Party = require("../models/Party");
const RefundInvoice = require("../models/RefundInvoice");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
} = require("../utils/moduleScope");
const {
  getBusinessDateKey,
  nextBusinessDayStart,
} = require("../utils/businessDate");

const ENTITY_TYPES = Object.freeze({
  CUSTOMER: "customer",
  PARTY: "party",
});

const ADJUSTMENT_SOURCE_TYPES = Object.freeze([
  "receive_payment",
  "receive_payment_discount",
  "adjustment",
]);

const SALE_INVOICE_SOURCE_TYPES = Object.freeze([
  "sale_invoice",
  "opening_sale_invoice",
]);

const REFUND_INVOICE_SOURCE_TYPES = Object.freeze([
  "refund_invoice",
  "opening_refund_invoice",
]);

const TRAVEL_ORIGIN_PREFIX = "travel_";
const MONEY_EPSILON = 0.004;

const INVOICE_SELECT_FIELDS = [
  "billNo",
  "invoiceDate",
  "invoiceTime",
  "dueDate",
  "totalAmount",
  "status",
  "isOpening",
  "createdAt",
].join(" ");

const REFUND_SELECT_FIELDS = [
  "billNo",
  "invoiceDate",
  "invoiceTime",
  "totalAmount",
  "originalInvoiceId",
  "isOpening",
  "createdAt",
].join(" ");

const makeHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const safeNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const roundMoney = (value) => {
  const rounded = Math.round((safeNumber(value) + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const normalizeTime = (value) => {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "00:00";

  const hour = String(Math.min(Math.max(Number(match[1]), 0), 23)).padStart(
    2,
    "0",
  );
  const minute = String(Math.min(Math.max(Number(match[2]), 0), 59)).padStart(
    2,
    "0",
  );

  return `${hour}:${minute}`;
};

const getSafeDateKey = (value, fallback = "") => {
  try {
    return getBusinessDateKey(value, {
      fallback,
      allowEmpty: !fallback,
      label: "bill-wise aging date",
    });
  } catch {
    if (!fallback) return "";
    try {
      return getBusinessDateKey(fallback, {
        allowEmpty: true,
        label: "bill-wise aging fallback date",
      });
    } catch {
      return "";
    }
  }
};

const dateKeyToUtcNoon = (key) => {
  const [year, month, day] = String(key || "")
    .split("-")
    .map(Number);

  if (!year || !month || !day) return null;

  return Date.UTC(year, month - 1, day, 12);
};

const diffBusinessDays = (fromKey, toKey) => {
  const from = dateKeyToUtcNoon(fromKey);
  const to = dateKeyToUtcNoon(toKey);

  if (from === null || to === null) return 0;

  return Math.floor((to - from) / (24 * 60 * 60 * 1000));
};

const compareAgingEvents = (a, b) => {
  const dateCompare = String(a.dateKey || "").localeCompare(
    String(b.dateKey || ""),
  );
  if (dateCompare !== 0) return dateCompare;

  const timeCompare = normalizeTime(a.time).localeCompare(normalizeTime(b.time));
  if (timeCompare !== 0) return timeCompare;

  const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  if (createdA !== createdB) return createdA - createdB;

  return String(a.id || "").localeCompare(String(b.id || ""));
};

const getBucketKey = (days) => {
  const safeDays = Math.max(0, safeNumber(days));

  if (safeDays <= 30) return "days0to30";
  if (safeDays <= 60) return "days31to60";
  if (safeDays <= 90) return "days61to90";
  return "days90plus";
};

const isTradingJournalEntry = (entry = {}) => {
  const originModule = String(entry.originModule || "").trim().toLowerCase();
  const sourceType = String(entry.sourceType || "").trim().toLowerCase();

  return (
    !originModule.startsWith(TRAVEL_ORIGIN_PREFIX) &&
    !sourceType.startsWith(TRAVEL_ORIGIN_PREFIX)
  );
};

const getAccountLineAmount = (entry, accountId, lineType) => {
  const accountKey = String(accountId || "");

  return (entry.lines || []).reduce((sum, line) => {
    if (String(line.account || "") !== accountKey) return sum;
    if (line.type !== lineType) return sum;

    return sum + safeNumber(line.amount);
  }, 0);
};

const getReferencedDocumentIds = (entry = {}) => {
  const ids = new Set();

  [entry.referenceId, entry.invoiceId].forEach((value) => {
    const id = value ? String(value) : "";
    if (mongoose.Types.ObjectId.isValid(id)) {
      ids.add(id);
    }
  });

  return [...ids];
};

const getEntityConfig = (entityType) => {
  if (entityType === ENTITY_TYPES.CUSTOMER) {
    return {
      idParam: "customerId",
      entityLabel: "Customer",
      invoiceField: "customerId",
      refundField: "customerId",
      ownerField: "createdBy",
      model: Customer,
    };
  }

  if (entityType === ENTITY_TYPES.PARTY) {
    return {
      idParam: "partyId",
      entityLabel: "Party",
      invoiceField: "partyId",
      refundField: "partyId",
      ownerField: "userId",
      model: Party,
    };
  }

  throw makeHttpError("Invalid aging ledger entity type", 400);
};

const loadTradingEntity = async ({ entityType, entityId, userObjectId }) => {
  if (!mongoose.Types.ObjectId.isValid(entityId)) {
    throw makeHttpError("Invalid entity ID", 400);
  }

  const config = getEntityConfig(entityType);
  const entityObjectId = new mongoose.Types.ObjectId(entityId);
  const query = {
    _id: entityObjectId,
    [config.ownerField]: userObjectId,
    isActive: true,
  };

  if (entityType === ENTITY_TYPES.PARTY) {
    query.isDeleted = false;
  }

  const entity = await config.model
    .findOne(applyModuleScopeFilter(query, MODULE_SCOPES.TRADING))
    .populate("account")
    .lean();

  if (!entity) {
    throw makeHttpError(`${config.entityLabel} not found`, 404);
  }

  const account = entity.account?._id || entity.account;

  if (!account || !mongoose.Types.ObjectId.isValid(account)) {
    throw makeHttpError(`${config.entityLabel} linked account not found`, 404);
  }

  return {
    entity,
    entityObjectId,
    accountObjectId: new mongoose.Types.ObjectId(account),
    config,
  };
};

const buildInvoiceRows = ({ invoices, asOfDateKey }) =>
  invoices
    .map((invoice) => {
      const originalAmount = roundMoney(invoice.totalAmount);
      if (originalAmount <= MONEY_EPSILON) return null;

      const invoiceDateKey = getSafeDateKey(
        invoice.invoiceDate,
        invoice.createdAt || new Date(),
      );
      const dueDateKey = invoice.dueDate
        ? getSafeDateKey(invoice.dueDate, "")
        : "";
      const basisKey = dueDateKey || invoiceDateKey;
      const rawDays = diffBusinessDays(basisKey, asOfDateKey);
      const days = Math.max(0, rawDays);

      return {
        id: String(invoice._id),
        invoiceId: invoice._id,
        billNo: invoice.billNo || "",
        invoiceDate: invoice.invoiceDate,
        invoiceDateKey,
        invoiceTime: normalizeTime(invoice.invoiceTime),
        dueDate: invoice.dueDate || null,
        dueDateKey,
        days,
        daysType: dueDateKey ? "overdue" : "age",
        bucket: getBucketKey(days),
        originalAmount,
        paidAdjusted: 0,
        outstanding: originalAmount,
        status: invoice.status || "",
        isOpening: invoice.isOpening === true,
        createdAt: invoice.createdAt || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) =>
      compareAgingEvents({
        dateKey: a.invoiceDateKey,
        time: a.invoiceTime,
        createdAt: a.createdAt,
        id: a.id,
      }, {
        dateKey: b.invoiceDateKey,
        time: b.invoiceTime,
        createdAt: b.createdAt,
        id: b.id,
      }),
    );

const applyAmountToRow = (row, amount) => {
  const available = roundMoney(row.originalAmount - row.paidAdjusted);
  const applied = Math.min(available, roundMoney(amount));

  if (applied <= MONEY_EPSILON) {
    return roundMoney(amount);
  }

  row.paidAdjusted = roundMoney(row.paidAdjusted + applied);
  row.outstanding = roundMoney(row.originalAmount - row.paidAdjusted);

  return roundMoney(amount - applied);
};

const applyExplicitEvents = ({ events, rowMap }) => {
  [...events].sort(compareAgingEvents).forEach((event) => {
    const row = rowMap.get(String(event.targetInvoiceId || ""));
    if (!row) return;

    applyAmountToRow(row, event.amount);
  });
};

const applyGenericEventsFifo = ({ rows, events }) => {
  const timeline = [
    ...rows.map((row) => ({
      kind: "invoice",
      row,
      dateKey: row.invoiceDateKey,
      time: row.invoiceTime,
      createdAt: row.createdAt,
      id: row.id,
    })),
    ...events.map((event) => ({
      ...event,
      kind: "credit",
    })),
  ].sort(compareAgingEvents);

  const openRows = [];
  let unappliedCredit = 0;

  const applyCredit = (amount) => {
    let remaining = roundMoney(amount);

    for (const row of openRows) {
      if (remaining <= MONEY_EPSILON) break;
      remaining = applyAmountToRow(row, remaining);
    }

    return remaining;
  };

  for (const event of timeline) {
    if (event.kind === "invoice") {
      openRows.push(event.row);

      if (unappliedCredit > MONEY_EPSILON) {
        unappliedCredit = applyCredit(unappliedCredit);
      }

      continue;
    }

    const remaining = applyCredit(event.amount);
    unappliedCredit = roundMoney(unappliedCredit + remaining);
  }
};

const fetchCustomerJournalDocumentIds = async ({
  accountObjectId,
  asOfEnd,
  lineType,
  sourceTypes,
  userObjectId,
}) => {
  const entries = await JournalEntry.find({
    createdBy: userObjectId,
    isDeleted: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true },
    sourceType: { $in: sourceTypes },
    date: { $lt: asOfEnd },
    "lines.account": accountObjectId,
  })
    .select(
      [
        "sourceType",
        "originModule",
        "referenceId",
        "invoiceId",
        "lines.account",
        "lines.type",
        "lines.amount",
      ].join(" "),
    )
    .lean();

  const ids = new Set();

  for (const entry of entries) {
    if (!isTradingJournalEntry(entry)) continue;

    const amount = roundMoney(
      getAccountLineAmount(entry, accountObjectId, lineType),
    );

    if (amount <= MONEY_EPSILON) continue;

    getReferencedDocumentIds(entry).forEach((id) => ids.add(id));
  }

  return ids;
};

const fetchAgingInvoices = async ({
  accountObjectId,
  asOfEnd,
  config,
  entityObjectId,
  entityType,
  userObjectId,
}) => {
  const invoices = await Invoice.find({
    createdBy: userObjectId,
    isDeleted: { $ne: true },
    [config.invoiceField]: entityObjectId,
    invoiceDate: { $lt: asOfEnd },
  })
    .select(INVOICE_SELECT_FIELDS)
    .sort({
      invoiceDate: 1,
      invoiceTime: 1,
      createdAt: 1,
      _id: 1,
    })
    .lean();

  if (entityType !== ENTITY_TYPES.CUSTOMER) {
    return invoices;
  }

  const invoiceMap = new Map(
    invoices.map((invoice) => [String(invoice._id), invoice]),
  );
  const journalInvoiceIds = await fetchCustomerJournalDocumentIds({
    accountObjectId,
    asOfEnd,
    lineType: "debit",
    sourceTypes: SALE_INVOICE_SOURCE_TYPES,
    userObjectId,
  });
  const missingInvoiceIds = [...journalInvoiceIds].filter(
    (id) => !invoiceMap.has(id),
  );

  if (missingInvoiceIds.length > 0) {
    const legacyInvoices = await Invoice.find({
      _id: {
        $in: missingInvoiceIds.map((id) => new mongoose.Types.ObjectId(id)),
      },
      createdBy: userObjectId,
      isDeleted: { $ne: true },
      invoiceDate: { $lt: asOfEnd },
    })
      .select(INVOICE_SELECT_FIELDS)
      .sort({
        invoiceDate: 1,
        invoiceTime: 1,
        createdAt: 1,
        _id: 1,
      })
      .lean();

    for (const invoice of legacyInvoices) {
      invoiceMap.set(String(invoice._id), invoice);
    }
  }

  return [...invoiceMap.values()];
};

const fetchPaymentEvents = async ({
  accountObjectId,
  asOfEnd,
  invoiceIdSet,
  userObjectId,
}) => {
  const entries = await JournalEntry.find({
    createdBy: userObjectId,
    isDeleted: { $ne: true },
    isReversed: { $ne: true },
    isReversal: { $ne: true },
    sourceType: { $in: ADJUSTMENT_SOURCE_TYPES },
    date: { $lt: asOfEnd },
    "lines.account": accountObjectId,
  })
    .select(
      [
        "date",
        "time",
        "sourceType",
        "originModule",
        "referenceId",
        "billNo",
        "createdAt",
        "lines.account",
        "lines.type",
        "lines.amount",
      ].join(" "),
    )
    .sort({
      date: 1,
      time: 1,
      createdAt: 1,
      _id: 1,
    })
    .lean();

  const explicitEvents = [];
  const genericEvents = [];

  for (const entry of entries) {
    if (!isTradingJournalEntry(entry)) continue;

    const amount = roundMoney(
      getAccountLineAmount(entry, accountObjectId, "credit"),
    );

    if (amount <= MONEY_EPSILON) continue;

    const referenceId = entry.referenceId ? String(entry.referenceId) : "";
    const event = {
      id: String(entry._id),
      amount,
      date: entry.date,
      dateKey: getSafeDateKey(entry.date, entry.createdAt || new Date()),
      time: normalizeTime(entry.time),
      createdAt: entry.createdAt || null,
      billNo: entry.billNo || "",
      sourceType: entry.sourceType || "",
      originModule: entry.originModule || "",
    };

    if (
      entry.sourceType === "receive_payment" &&
      referenceId &&
      invoiceIdSet.has(referenceId)
    ) {
      explicitEvents.push({
        ...event,
        targetInvoiceId: referenceId,
      });

      continue;
    }

    genericEvents.push(event);
  }

  return {
    explicitEvents,
    genericEvents,
  };
};

const fetchRefundEvents = async ({
  accountObjectId,
  entityObjectId,
  entityType,
  config,
  asOfEnd,
  invoiceIdSet,
  userObjectId,
}) => {
  const primaryRefunds = await RefundInvoice.find({
    createdBy: userObjectId,
    isDeleted: { $ne: true },
    [config.refundField]: entityObjectId,
    invoiceDate: { $lt: asOfEnd },
  })
    .select(REFUND_SELECT_FIELDS)
    .sort({
      invoiceDate: 1,
      invoiceTime: 1,
      createdAt: 1,
      _id: 1,
    })
    .lean();

  let refunds = primaryRefunds;

  if (entityType === ENTITY_TYPES.CUSTOMER) {
    const refundMap = new Map(
      primaryRefunds.map((refund) => [String(refund._id), refund]),
    );
    const journalRefundIds = await fetchCustomerJournalDocumentIds({
      accountObjectId,
      asOfEnd,
      lineType: "credit",
      sourceTypes: REFUND_INVOICE_SOURCE_TYPES,
      userObjectId,
    });
    const missingRefundIds = [...journalRefundIds].filter(
      (id) => !refundMap.has(id),
    );

    if (missingRefundIds.length > 0) {
      const legacyRefunds = await RefundInvoice.find({
        _id: {
          $in: missingRefundIds.map((id) => new mongoose.Types.ObjectId(id)),
        },
        createdBy: userObjectId,
        isDeleted: { $ne: true },
        invoiceDate: { $lt: asOfEnd },
        $or: [
          { [config.refundField]: { $exists: false } },
          { [config.refundField]: null },
        ],
      })
        .select(REFUND_SELECT_FIELDS)
        .sort({
          invoiceDate: 1,
          invoiceTime: 1,
          createdAt: 1,
          _id: 1,
        })
        .lean();

      for (const refund of legacyRefunds) {
        refundMap.set(String(refund._id), refund);
      }
    }

    refunds = [...refundMap.values()];
  }

  const explicitEvents = [];
  const genericEvents = [];

  for (const refund of refunds) {
    const amount = roundMoney(refund.totalAmount);
    if (amount <= MONEY_EPSILON) continue;

    const originalInvoiceId = refund.originalInvoiceId
      ? String(refund.originalInvoiceId)
      : "";
    const event = {
      id: String(refund._id),
      amount,
      date: refund.invoiceDate,
      dateKey: getSafeDateKey(refund.invoiceDate, refund.createdAt || new Date()),
      time: normalizeTime(refund.invoiceTime),
      createdAt: refund.createdAt || null,
      billNo: refund.billNo || "",
      sourceType: refund.isOpening ? "opening_refund_invoice" : "refund_invoice",
      originModule: "refund_invoice",
    };

    if (originalInvoiceId && invoiceIdSet.has(originalInvoiceId)) {
      explicitEvents.push({
        ...event,
        targetInvoiceId: originalInvoiceId,
      });

      continue;
    }

    genericEvents.push(event);
  }

  return {
    explicitEvents,
    genericEvents,
  };
};

const summarizeRows = (rows) => {
  const buckets = {
    days0to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
  };

  let originalTotal = 0;
  let paidAdjustedTotal = 0;
  let totalOutstanding = 0;

  for (const row of rows) {
    originalTotal += safeNumber(row.originalAmount);
    paidAdjustedTotal += safeNumber(row.paidAdjusted);
    totalOutstanding += safeNumber(row.outstanding);
    buckets[row.bucket] = roundMoney(
      safeNumber(buckets[row.bucket]) + safeNumber(row.outstanding),
    );
  }

  return {
    originalTotal: roundMoney(originalTotal),
    paidAdjustedTotal: roundMoney(paidAdjustedTotal),
    totalOutstanding: roundMoney(totalOutstanding),
    buckets,
    billCount: rows.length,
  };
};

const getBillWiseReceivableAging = async ({
  entityType,
  entityId,
  userId,
  asOfDate,
}) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw makeHttpError("Invalid user ID", 401);
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const asOfDateKey = getSafeDateKey(asOfDate || new Date(), new Date());
  const asOfEnd = nextBusinessDayStart(asOfDateKey);
  const { entity, entityObjectId, accountObjectId, config } =
    await loadTradingEntity({
      entityType,
      entityId,
      userObjectId,
    });

  const invoices = await fetchAgingInvoices({
    accountObjectId,
    asOfEnd,
    config,
    entityObjectId,
    entityType,
    userObjectId,
  });

  const rows = buildInvoiceRows({
    invoices,
    asOfDateKey,
  });
  const rowMap = new Map(rows.map((row) => [row.id, row]));
  const invoiceIdSet = new Set(rows.map((row) => row.id));

  const paymentEvents = await fetchPaymentEvents({
    accountObjectId,
    asOfEnd,
    invoiceIdSet,
    userObjectId,
  });
  const refundEvents = await fetchRefundEvents({
    accountObjectId,
    entityObjectId,
    entityType,
    config,
    asOfEnd,
    invoiceIdSet,
    userObjectId,
  });

  applyExplicitEvents({
    events: [...paymentEvents.explicitEvents, ...refundEvents.explicitEvents],
    rowMap,
  });

  applyGenericEventsFifo({
    rows,
    events: [...paymentEvents.genericEvents, ...refundEvents.genericEvents],
  });

  const outstandingRows = rows
    .map((row) => ({
      ...row,
      paidAdjusted: roundMoney(row.paidAdjusted),
      outstanding: roundMoney(row.originalAmount - row.paidAdjusted),
    }))
    .filter((row) => row.outstanding > MONEY_EPSILON)
    .map((row) => ({
      invoiceId: row.id,
      billNo: row.billNo,
      invoiceDate: row.invoiceDate,
      invoiceDateKey: row.invoiceDateKey,
      dueDate: row.dueDate,
      dueDateKey: row.dueDateKey,
      days: row.days,
      daysType: row.daysType,
      bucket: row.bucket,
      originalAmount: row.originalAmount,
      paidAdjusted: row.paidAdjusted,
      outstanding: row.outstanding,
      status: row.status,
      isOpening: row.isOpening,
    }));

  return {
    entityType,
    moduleScope: MODULE_SCOPES.TRADING,
    asOfDate: asOfDateKey,
    entity: {
      _id: String(entity._id),
      name: entity.name || "-",
      phone: entity.phone || "",
      role: entity.role || "",
    },
    rows: outstandingRows,
    summary: summarizeRows(outstandingRows),
  };
};

module.exports = {
  ENTITY_TYPES,
  getBillWiseReceivableAging,
};
