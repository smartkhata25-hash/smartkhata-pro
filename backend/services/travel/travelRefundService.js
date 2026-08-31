const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Customer = require("../../models/Customer");
const JournalEntry = require("../../models/JournalEntry");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");
const TravelRefund = require("../../models/TravelRefund");
const { recalculateAccountBalances } = require("../../utils/accountHelper");
const {
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  MODULE_SCOPES,
} = require("../../utils/moduleScope");
const { createPaymentEntry } = require("../../utils/paymentService");
const { POSTING_STATUSES, getServiceSummary } = require("./travelInvoiceAccountingService");
const { formatTravelInvoiceAttachments } = require("./travelInvoiceAttachmentService");

const TRAVEL_REFUND_ORIGIN = "travel_refund";
const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error?.name === "ValidationError" || error?.code === 11000) {
    return res.status(400).json({ message: error.message });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({ message: fallbackMessage });
};

const cleanString = (value = "") => String(value || "").trim();

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const moneyNumber = (value, label = "amount") => {
  if (value === "" || value === undefined || value === null) {
    return 0;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return roundMoney(amount);
};

const nullableDate = (value) => {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, "Invalid refund date");
  }

  return date;
};

const formatCurrentTimeInput = () => new Date().toTimeString().slice(0, 5);

const extractTimeFromDateInput = (value) => {
  if (!value || !String(value).includes("T")) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toTimeString().slice(0, 5);
};

const normalizeTimeInput = (value, dateValue = null) =>
  cleanString(value) || extractTimeFromDateInput(dateValue) || formatCurrentTimeInput();

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw createHttpError(400, "Invalid refund payload");
  }
};

const ensureObjectIdString = (value, label) => {
  if (!value) {
    return "";
  }

  const id = typeof value === "object" ? value._id || value.id : value;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return String(id);
};

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const ensureSystemAccount = async ({
  userId,
  code,
  name,
  type,
  normalBalance,
  category,
  session = null,
}) => {
  const query = Account.findOneAndUpdate(
    { userId, code },
    {
      $set: {
        moduleScope: MODULE_SCOPES.TRAVEL,
      },
      $setOnInsert: {
        userId,
        code,
        name,
        type,
        normalBalance,
        category,
        balance: 0,
        openingBalance: 0,
        isSystem: true,
        isActive: true,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );

  return getSessionQuery(query, session);
};

const getTravelRefundAccount = (userId, session) =>
  ensureSystemAccount({
    userId,
    code: "TRAVEL_REFUND",
    name: "travel refund",
    type: "Expense",
    normalBalance: "debit",
    category: "other_expense",
    session,
  });

const getTravelPenaltyAccount = (userId, session) =>
  ensureSystemAccount({
    userId,
    code: "TRAVEL_PENALTY_INCOME",
    name: "travel penalty income",
    type: "Income",
    normalBalance: "credit",
    category: "other_income",
    session,
  });

const getTravelCostAccount = (userId, session) =>
  ensureSystemAccount({
    userId,
    code: "TRAVEL_COST",
    name: "cost of travel service",
    type: "Expense",
    normalBalance: "debit",
    category: "other_expense",
    session,
  });

const getOriginalInvoice = async ({ userId, originalInvoiceId, session = null }) => {
  const invoiceId = ensureObjectIdString(originalInvoiceId, "travel invoice");

  const query = TravelBooking.findOne({
    _id: invoiceId,
    userId,
    isActive: true,
    isDeleted: false,
    isVoided: { $ne: true },
    status: { $in: [...POSTING_STATUSES] },
    accountingPosted: true,
  }).lean();

  const invoice = await getSessionQuery(query, session);

  if (!invoice) {
    throw createHttpError(404, "Posted travel invoice not found");
  }

  return invoice;
};

const getTravelCustomer = async ({ userId, customerId, session = null }) => {
  const query = Customer.findOne(
    applyModuleScopeFilter(
      {
        _id: customerId,
        createdBy: userId,
        isActive: { $ne: false },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("name phone account moduleScope")
    .lean();

  const customer = await getSessionQuery(query, session);

  if (!customer || !customer.account) {
    throw createHttpError(404, "Customer or customer account not found");
  }

  return customer;
};

const getPaymentAccount = async ({ userId, accountId, paidBackAmount, session = null }) => {
  if (paidBackAmount <= 0) {
    return null;
  }

  const id = ensureObjectIdString(accountId, "payment account");
  const accountQuery = applyModuleScopeFilter(
    {
      _id: id,
      userId,
      isActive: { $ne: false },
      type: "Asset",
      category: { $in: ["cash", "bank", "online", "cheque"] },
    },
    MODULE_SCOPES.TRAVEL,
  );
  const query = Account.findOne(accountQuery)
    .select("_id")
    .lean();

  const account = await getSessionQuery(query, session);

  if (!account) {
    throw createHttpError(400, "Payment account not found");
  }

  return account;
};

const getItemOriginalAmount = (item, invoice) => {
  const grossSale = roundMoney(invoice.sellingTotal);
  const netSale = roundMoney(invoice.netSale || grossSale);
  const ratio = grossSale > 0 ? netSale / grossSale : 1;

  return roundMoney(Number(item.estimatedSellingBase || 0) * ratio);
};

const getItemCostAmount = (item) => {
  const useComponents =
    item.itemType === "umrah_package" &&
    item.umrahDetails?.packageMode === "custom_component_package" &&
    Array.isArray(item.umrahDetails.components) &&
    item.umrahDetails.components.length > 0;

  if (useComponents) {
    return roundMoney(
      item.umrahDetails.components.reduce(
        (sum, component) => sum + Number(component.estimatedCostBase || 0),
        0,
      ),
    );
  }

  return roundMoney(item.estimatedCostBase);
};

const buildInvoiceItemMap = (invoice) => {
  const map = new Map();

  (invoice.bookingItems || []).forEach((item) => {
    const id = String(item._id || "");

    if (!id) {
      return;
    }

    map.set(id, {
      item,
      originalAmount: getItemOriginalAmount(item, invoice),
      costAmount: getItemCostAmount(item),
    });
  });

  return map;
};

const getPriorRefundTotals = async ({ userId, originalInvoiceId, session = null }) => {
  const query = TravelRefund.find({
    userId,
    originalInvoiceId,
    isDeleted: false,
    isReversed: { $ne: true },
  })
    .select("grossRefundAmount vendorRecoveryAmount refundItems")
    .lean();

  const refunds = await getSessionQuery(query, session);
  const byItem = new Map();
  let grossRefunded = 0;
  let vendorRecovered = 0;

  refunds.forEach((refund) => {
    grossRefunded += Number(refund.grossRefundAmount || 0);
    vendorRecovered += Number(refund.vendorRecoveryAmount || 0);

    (refund.refundItems || []).forEach((item) => {
      const id = String(item.bookingItemId || "");

      if (!id) {
        return;
      }

      const current = byItem.get(id) || {
        refundAmount: 0,
        vendorRecoveryAmount: 0,
      };

      current.refundAmount += Number(item.refundAmount || 0);
      current.vendorRecoveryAmount += Number(item.vendorRecoveryAmount || 0);
      byItem.set(id, current);
    });
  });

  return {
    grossRefunded: roundMoney(grossRefunded),
    vendorRecovered: roundMoney(vendorRecovered),
    byItem,
  };
};

const buildFullRefundItems = ({ invoice, itemMap, priorTotals }) =>
  [...itemMap.entries()]
    .map(([id, row]) => {
      const previous = priorTotals.byItem.get(id) || {};
      const remaining = roundMoney(row.originalAmount - Number(previous.refundAmount || 0));

      if (remaining <= 0) {
        return null;
      }

      return {
        bookingItemId: id,
        title: row.item.title || row.item.description || "Travel Service",
        itemType: row.item.itemType || "service",
        originalAmount: row.originalAmount,
        refundAmount: remaining,
        vendorId: row.item.vendorId || null,
        vendorRecoveryAmount: 0,
      };
    })
    .filter(Boolean);

const normalizeRefundItems = ({ body, invoice, priorTotals }) => {
  const refundMode = cleanString(body.refundMode || "partial").toLowerCase();
  const itemMap = buildInvoiceItemMap(invoice);

  if (refundMode === "full") {
    return buildFullRefundItems({ invoice, itemMap, priorTotals });
  }

  const rawItems = parseJsonField(body.refundItems, []);

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return [];
  }

  return rawItems
    .map((rawItem) => {
      const bookingItemId = ensureObjectIdString(rawItem.bookingItemId, "travel service item");
      const row = itemMap.get(bookingItemId);

      if (!row) {
        throw createHttpError(400, "Refund item does not belong to the original invoice");
      }

      const previous = priorTotals.byItem.get(bookingItemId) || {};
      const remaining = roundMoney(row.originalAmount - Number(previous.refundAmount || 0));
      const refundAmount = moneyNumber(rawItem.refundAmount, "refund amount");
      const vendorRecoveryAmount = moneyNumber(
        rawItem.vendorRecoveryAmount,
        "vendor recovery amount",
      );
      const vendorId = ensureObjectIdString(
        rawItem.vendorId || row.item.vendorId,
        "vendor",
      ) || null;

      if (refundAmount <= 0 && vendorRecoveryAmount <= 0) {
        return null;
      }

      if (refundAmount > remaining) {
        throw createHttpError(
          400,
          `Refund amount exceeds remaining refundable amount for ${row.item.title || "service item"}`,
        );
      }

      if (vendorRecoveryAmount > 0 && !vendorId) {
        throw createHttpError(400, "Vendor is required when vendor recovery is entered");
      }

      if (
        vendorRecoveryAmount >
        roundMoney(row.costAmount - Number(previous.vendorRecoveryAmount || 0))
      ) {
        throw createHttpError(
          400,
          `Vendor recovery exceeds remaining service cost for ${row.item.title || "service item"}`,
        );
      }

      return {
        bookingItemId,
        title: cleanString(rawItem.title) || row.item.title || row.item.description || "Travel Service",
        itemType: row.item.itemType || "service",
        originalAmount: row.originalAmount,
        refundAmount,
        vendorId,
        vendorRecoveryAmount,
      };
    })
    .filter(Boolean);
};

const getRefundMode = (value = "partial") => {
  const mode = cleanString(value).toLowerCase();

  return ["full", "partial", "items"].includes(mode) ? mode : "partial";
};

const buildRefundPayload = async ({ body = {}, userId, session = null }) => {
  const invoice = await getOriginalInvoice({
    userId,
    originalInvoiceId: body.originalInvoiceId,
    session,
  });
  const priorTotals = await getPriorRefundTotals({
    userId,
    originalInvoiceId: invoice._id,
    session,
  });
  const refundItems = normalizeRefundItems({ body, invoice, priorTotals });
  const refundMode = getRefundMode(body.refundMode);
  const grossRefundAmount = roundMoney(
    refundItems.length > 0
      ? refundItems.reduce((sum, item) => sum + Number(item.refundAmount || 0), 0)
      : moneyNumber(body.grossRefundAmount || body.refundAmount, "refund amount"),
  );
  const penaltyAmount = moneyNumber(body.penaltyAmount, "penalty amount");
  const customerRefundAmount = roundMoney(grossRefundAmount - penaltyAmount);
  const vendorRecoveryAmount = roundMoney(
    refundItems.reduce((sum, item) => sum + Number(item.vendorRecoveryAmount || 0), 0),
  );
  const paidBackAmount = moneyNumber(body.paidBackAmount || body.paidAmount, "paid back amount");
  const paymentType =
    paidBackAmount > 0 ? cleanString(body.paymentType || "cash").toLowerCase() : "credit";
  const accountId =
    paidBackAmount > 0 ? ensureObjectIdString(body.accountId, "payment account") : null;
  const refundDate = nullableDate(body.refundDate) || new Date();
  const refundTime = normalizeTimeInput(body.refundTime || body.time, body.refundDate);

  if (grossRefundAmount <= 0) {
    throw createHttpError(400, "Refund amount is required");
  }

  if (penaltyAmount > grossRefundAmount) {
    throw createHttpError(400, "Penalty cannot exceed refund amount");
  }

  if (customerRefundAmount <= 0 && paidBackAmount > 0) {
    throw createHttpError(400, "Paid back amount cannot be greater than customer refund");
  }

  if (paidBackAmount > customerRefundAmount) {
    throw createHttpError(400, "Paid back amount cannot exceed customer refund amount");
  }

  const refundableRemaining = roundMoney(
    Number(invoice.netSale || invoice.sellingTotal || 0) - priorTotals.grossRefunded,
  );

  if (grossRefundAmount > refundableRemaining) {
    throw createHttpError(400, "Refund exceeds remaining refundable invoice amount");
  }

  const vendorRecoveryRemaining = roundMoney(
    Number(invoice.costTotal || 0) - priorTotals.vendorRecovered,
  );

  if (vendorRecoveryAmount > vendorRecoveryRemaining) {
    throw createHttpError(400, "Vendor recovery exceeds remaining invoice cost");
  }

  if (paidBackAmount > 0 && !PAYMENT_TYPES.has(paymentType)) {
    throw createHttpError(400, "Invalid payment type");
  }

  const [customer, paymentAccount] = await Promise.all([
    getTravelCustomer({ userId, customerId: invoice.customerId, session }),
    getPaymentAccount({ userId, accountId, paidBackAmount, session }),
  ]);

  return {
    invoice,
    customer,
    paymentAccount,
    data: {
      originalInvoiceId: invoice._id,
      originalInvoiceNumber: invoice.invoiceNumber || invoice.bookingNumber || "",
      refundDate,
      customerId: invoice.customerId,
      refundMode,
      refundItems,
      grossRefundAmount,
      penaltyAmount,
      customerRefundAmount,
      vendorRecoveryAmount,
      paidBackAmount,
      paymentType,
      accountId,
      refundTime,
      notes: cleanString(body.notes),
    },
  };
};

const loadVendorAccounts = async ({ refundItems, userId, session = null }) => {
  const vendorIds = [
    ...new Set(
      refundItems
        .filter((item) => Number(item.vendorRecoveryAmount || 0) > 0)
        .map((item) => item.vendorId)
        .filter(Boolean)
        .map(String),
    ),
  ];

  if (vendorIds.length === 0) {
    return new Map();
  }

  const query = Supplier.find(
    applySupplierModuleScopeFilter(
      {
        _id: { $in: vendorIds },
        userId,
        isDeleted: false,
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("name account moduleScope isTravelVendor travelVendorType")
    .lean();

  const vendors = await getSessionQuery(query, session);
  const vendorMap = new Map(vendors.map((vendor) => [String(vendor._id), vendor]));

  vendorIds.forEach((vendorId) => {
    const vendor = vendorMap.get(vendorId);

    if (!vendor || !vendor.account) {
      throw createHttpError(400, "Vendor account not found for recovery");
    }
  });

  return vendorMap;
};

const groupVendorRecoveries = async ({ refundItems, userId, session = null }) => {
  const vendorMap = await loadVendorAccounts({ refundItems, userId, session });
  const grouped = new Map();

  refundItems.forEach((item) => {
    const amount = roundMoney(item.vendorRecoveryAmount);

    if (amount <= 0) {
      return;
    }

    const vendor = vendorMap.get(String(item.vendorId));
    const current = grouped.get(String(item.vendorId)) || {
      vendor,
      amount: 0,
    };

    current.amount = roundMoney(current.amount + amount);
    grouped.set(String(item.vendorId), current);
  });

  return [...grouped.values()];
};

const collectJournalAccountIds = (journals = []) => {
  const ids = new Set();

  journals.forEach((journal) => {
    (journal?.lines || []).forEach((line) => {
      if (line?.account) {
        ids.add(String(line.account));
      }
    });
  });

  return [...ids];
};

const postTravelRefundAccounting = async ({
  refund,
  invoice,
  customer,
  paymentAccount,
  userId,
  session = null,
}) => {
  const [refundAccount, penaltyAccount, costAccount] = await Promise.all([
    getTravelRefundAccount(userId, session),
    refund.penaltyAmount > 0 ? getTravelPenaltyAccount(userId, session) : Promise.resolve(null),
    refund.vendorRecoveryAmount > 0 ? getTravelCostAccount(userId, session) : Promise.resolve(null),
  ]);
  const refundNumber = refund.refundNumber;
  const serviceSummary = getServiceSummary(invoice);
  const refundDate = refund.refundDate || new Date();
  const refundTime = cleanString(refund.refundTime) || refundDate.toTimeString().slice(0, 5);
  const journals = [];

  const customerLines = [
    {
      account: new mongoose.Types.ObjectId(refundAccount._id),
      type: "debit",
      amount: roundMoney(refund.grossRefundAmount),
    },
  ];

  if (roundMoney(refund.customerRefundAmount) > 0) {
    customerLines.push({
      account: new mongoose.Types.ObjectId(customer.account),
      type: "credit",
      amount: roundMoney(refund.customerRefundAmount),
    });
  }

  if (roundMoney(refund.penaltyAmount) > 0 && penaltyAccount) {
    customerLines.push({
      account: new mongoose.Types.ObjectId(penaltyAccount._id),
      type: "credit",
      amount: roundMoney(refund.penaltyAmount),
    });
  }

  const customerJournal = new JournalEntry({
    date: refundDate,
    time: refundTime,
    description: `Travel Refund ${refundNumber} for ${invoice.invoiceNumber || invoice.bookingNumber} - ${serviceSummary}`,
    sourceType: "travel_refund",
    originModule: TRAVEL_REFUND_ORIGIN,
    referenceId: refund._id,
    invoiceId: invoice._id,
    invoiceModel: "TravelBooking",
    billNo: refundNumber,
    createdBy: userId,
    customerId: refund.customerId,
    attachmentUrl: refund.attachmentUrl || "",
    attachmentType: refund.attachmentType || "",
    lines: customerLines,
  });

  await customerJournal.save({ session });
  journals.push(customerJournal);
  refund.customerJournalEntryId = customerJournal._id;

  if (roundMoney(refund.vendorRecoveryAmount) > 0 && costAccount) {
    const recoveries = await groupVendorRecoveries({
      refundItems: refund.refundItems || [],
      userId,
      session,
    });
    const totalRecovery = roundMoney(
      recoveries.reduce((sum, recovery) => sum + Number(recovery.amount || 0), 0),
    );

    if (totalRecovery !== roundMoney(refund.vendorRecoveryAmount)) {
      throw createHttpError(400, "Vendor recovery requires valid vendor rows");
    }

    const vendorJournal = new JournalEntry({
      date: refundDate,
      time: refundTime,
      description: `Travel Vendor Recovery ${refundNumber} for ${invoice.invoiceNumber || invoice.bookingNumber}`,
      sourceType: "travel_refund",
      originModule: TRAVEL_REFUND_ORIGIN,
      referenceId: refund._id,
      invoiceId: invoice._id,
      invoiceModel: "TravelBooking",
      billNo: refundNumber,
      createdBy: userId,
      supplierId: recoveries.length === 1 ? recoveries[0].vendor._id : null,
      attachmentUrl: refund.attachmentUrl || "",
      attachmentType: refund.attachmentType || "",
      lines: [
        ...recoveries.map((recovery) => ({
          account: new mongoose.Types.ObjectId(recovery.vendor.account),
          type: "debit",
          amount: roundMoney(recovery.amount),
        })),
        {
          account: new mongoose.Types.ObjectId(costAccount._id),
          type: "credit",
          amount: totalRecovery,
        },
      ],
    });

    await vendorJournal.save({ session });
    journals.push(vendorJournal);
    refund.vendorJournalEntryId = vendorJournal._id;
  }

  if (roundMoney(refund.paidBackAmount) > 0 && paymentAccount) {
    const paymentJournal = await createPaymentEntry({
      userId,
      referenceId: refund._id,
      sourceType: "refund_payment",
      originModule: TRAVEL_REFUND_ORIGIN,
      billNo: refundNumber,
      accountId: paymentAccount._id,
      counterPartyAccountId: customer.account,
      amount: roundMoney(refund.paidBackAmount),
      paymentType: refund.paymentType,
      description: `Travel Refund Payment ${refundNumber}`,
      customerId: refund.customerId,
      entryDate: refundDate,
      entryTime: refundTime,
      session,
    });

    journals.push(paymentJournal);
    refund.paymentJournalEntryId = paymentJournal._id;
  }

  await refund.save({ session });

  return collectJournalAccountIds(journals);
};

const reserveTravelRefundAmounts = async ({
  invoice,
  refundData,
  userId,
  session = null,
}) => {
  const netSale = roundMoney(invoice.netSale || invoice.sellingTotal);
  const costTotal = roundMoney(invoice.costTotal);
  const grossRefundAmount = roundMoney(refundData.grossRefundAmount);
  const customerRefundAmount = roundMoney(refundData.customerRefundAmount);
  const vendorRecoveryAmount = roundMoney(refundData.vendorRecoveryAmount);

  const lockedInvoice = await TravelBooking.findOneAndUpdate(
    {
      _id: invoice._id,
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
      accountingPosted: true,
      $expr: {
        $and: [
          {
            $lte: [
              { $add: [{ $ifNull: ["$refundedAmount", 0] }, grossRefundAmount] },
              netSale,
            ],
          },
          {
            $lte: [
              {
                $add: [
                  { $ifNull: ["$vendorRecoveredAmount", 0] },
                  vendorRecoveryAmount,
                ],
              },
              costTotal,
            ],
          },
        ],
      },
    },
    {
      $inc: {
        refundedAmount: grossRefundAmount,
        customerRefundedAmount: customerRefundAmount,
        vendorRecoveredAmount: vendorRecoveryAmount,
        refundCount: 1,
      },
    },
    {
      new: true,
      session,
    },
  );

  if (!lockedInvoice) {
    throw createHttpError(400, "Refund exceeds remaining invoice amount");
  }

  return lockedInvoice;
};

const serializeTravelRefund = (refund) => {
  if (!refund) {
    return refund;
  }

  const plain = refund.toObject ? refund.toObject() : { ...refund };

  return {
    ...plain,
    attachments: formatTravelInvoiceAttachments(plain),
  };
};

const recalculateTravelRefundAccounts = async (accountIds = []) => {
  try {
    await recalculateAccountBalances(accountIds);
  } catch (error) {
    console.error("Travel refund balance recalculation failed:", error.message);
  }
};

module.exports = {
  TRAVEL_REFUND_ORIGIN,
  buildRefundPayload,
  createHttpError,
  getOriginalInvoice,
  reserveTravelRefundAmounts,
  recalculateTravelRefundAccounts,
  sendError,
  serializeTravelRefund,
  postTravelRefundAccounting,
};
