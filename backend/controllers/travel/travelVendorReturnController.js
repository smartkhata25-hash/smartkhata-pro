const mongoose = require("mongoose");

const Account = require("../../models/Account");
const JournalEntry = require("../../models/JournalEntry");
const Party = require("../../models/Party");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");
const TravelRefund = require("../../models/TravelRefund");
const TravelVendorReturn = require("../../models/TravelVendorReturn");
const { createPaymentEntry } = require("../../utils/paymentService");
const { recalculateAccountBalances } = require("../../utils/accountHelper");
const { logActivity } = require("../../utils/activityLogger");
const {
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  MODULE_SCOPES,
} = require("../../utils/moduleScope");
const {
  applyPrimaryAttachmentFields,
  cleanupTravelInvoiceAttachments,
  uploadTravelInvoiceFiles,
} = require("../../services/travel/travelInvoiceAttachmentService");
const { POSTING_STATUSES } = require("../../services/travel/travelInvoiceAccountingService");
const {
  TRAVEL_VENDOR_RETURN_ORIGIN,
  getTravelVendorBalanceMap,
  roundMoney,
} = require("../../services/travel/travelAccountingMetricsService");
const { clearTravelReportCache } = require("../../services/travel/travelReportCacheService");
const {
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../../services/travel/travelSoftDeleteService");
const {
  cleanString,
  createHttpError,
  escapeRegex,
  getActorId,
  getUserId,
  sendError,
} = require("../../services/travel/travelBookingService");
const { generateTravelVendorReturnNumber } = require("../../services/travel/travelVendorReturnNumberService");
const {
  buildTravelPartyRoleQuery,
  getVendorJournalIdentity,
  normalizeVendorCounterpartyInput,
  resolveTravelVendorCounterparty,
} = require("../../services/travel/travelCounterpartyService");

const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);

const toObjectId = (value, label) => {
  if (!value || !mongoose.Types.ObjectId.isValid(String(value))) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const optionalObjectId = (value, label) => {
  if (!value) {
    return null;
  }

  return toObjectId(value, label);
};

const moneyNumber = (value, label, { allowZero = false } = {}) => {
  const numeric = value === "" || value === null || value === undefined ? 0 : Number(value);
  const valid = Number.isFinite(numeric) && (allowZero ? numeric >= 0 : numeric > 0);

  if (!valid) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return roundMoney(numeric);
};

const normalizeDate = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, "Invalid return date");
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

const normalizePaymentType = (value = "cash") => {
  const paymentType = cleanString(value || "cash").toLowerCase() === "bank"
    ? "online"
    : cleanString(value || "cash").toLowerCase();

  if (!PAYMENT_TYPES.has(paymentType)) {
    throw createHttpError(400, "Invalid payment type");
  }

  return paymentType;
};

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const getTravelCostAccount = async (userId, session = null) => {
  const userObjectId = toObjectId(userId, "user");
  const query = Account.findOneAndUpdate(
    {
      userId: userObjectId,
      code: "TRAVEL_COST",
    },
    {
      $set: {
        moduleScope: MODULE_SCOPES.TRAVEL,
      },
      $setOnInsert: {
        userId: userObjectId,
        name: "cost of travel service",
        type: "Expense",
        normalBalance: "debit",
        code: "TRAVEL_COST",
        category: "other_expense",
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

const getPaymentAccount = async ({ userId, accountId, amountReceivedNow, session = null }) => {
  if (amountReceivedNow <= 0) {
    return null;
  }

  const account = await getSessionQuery(
    Account.findOne(
      applyModuleScopeFilter(
        {
          _id: toObjectId(accountId, "payment account"),
          userId: toObjectId(userId, "user"),
          isActive: { $ne: false },
          type: "Asset",
          category: { $in: ["cash", "bank", "online", "cheque"] },
        },
        MODULE_SCOPES.TRAVEL,
      ),
    ).select("_id name code category type"),
    session,
  );

  if (!account) {
    throw createHttpError(400, "Payment account not found");
  }

  return account;
};

const getVendorMatchKey = (vendor = {}) =>
  vendor.vendorType === "party"
    ? `party:${vendor.vendorPartyId || ""}`
    : `vendor:${vendor.vendorId || ""}`;

const collectVendorCostRows = (invoice, vendor) => {
  const rows = [];
  const vendorKey = getVendorMatchKey(vendor);

  (invoice.bookingItems || []).forEach((item) => {
    const useComponents =
      item.itemType === "umrah_package" &&
      item.umrahDetails?.packageMode === "custom_component_package" &&
      Array.isArray(item.umrahDetails.components) &&
      item.umrahDetails.components.length > 0;

    if (useComponents) {
      item.umrahDetails.components.forEach((component) => {
        if (
          getVendorMatchKey({
            vendorType: component.vendorType === "party" ? "party" : "vendor",
            vendorId: component.vendorId,
            vendorPartyId: component.vendorPartyId,
          }) !== vendorKey
        ) {
          return;
        }

        rows.push({
          id: component._id,
          label: component.label || component.componentType || item.title || "Travel service",
          amount: roundMoney(component.estimatedCostBase || 0),
        });
      });

      return;
    }

    if (
      getVendorMatchKey({
        vendorType: item.vendorType === "party" ? "party" : "vendor",
        vendorId: item.vendorId,
        vendorPartyId: item.vendorPartyId,
      }) !== vendorKey
    ) {
      return;
    }

    rows.push({
      id: item._id,
      label: item.title || item.itemType || "Travel service",
      amount: roundMoney(item.estimatedCostBase || 0),
    });
  });

  return rows.filter((row) => row.amount > 0);
};

const sumPriorRefundRecoveries = async ({
  userId,
  invoiceId,
  vendorId,
  vendorType = "vendor",
  vendorPartyId = null,
  bookingItemId = null,
  session = null,
}) => {
  if (!invoiceId) {
    return 0;
  }

  const refunds = await getSessionQuery(
    TravelRefund.find({
      userId: toObjectId(userId, "user"),
      originalInvoiceId: invoiceId,
      isDeleted: false,
      isReversed: { $ne: true },
    }).select("refundItems"),
    session,
  ).lean();

  return roundMoney(
    refunds.reduce((sum, refund) => {
      const itemSum = (refund.refundItems || []).reduce((itemTotal, item) => {
        const sameVendor =
          getVendorMatchKey({
            vendorType: item.vendorType === "party" ? "party" : "vendor",
            vendorId: item.vendorId,
            vendorPartyId: item.vendorPartyId,
          }) ===
          getVendorMatchKey({
            vendorType,
            vendorId,
            vendorPartyId,
          });
        const sameItem =
          !bookingItemId || String(item.bookingItemId || "") === String(bookingItemId);

        return sameVendor && sameItem
          ? itemTotal + Number(item.vendorRecoveryAmount || 0)
          : itemTotal;
      }, 0);

      return sum + itemSum;
    }, 0),
  );
};

const sumPriorVendorReturns = async ({
  userId,
  invoiceId,
  vendorId,
  vendorType = "vendor",
  vendorPartyId = null,
  bookingItemId = null,
  session = null,
}) => {
  if (!invoiceId) {
    return 0;
  }

  const query = {
    userId: toObjectId(userId, "user"),
    originalInvoiceId: invoiceId,
    isDeleted: false,
    isReversed: { $ne: true },
  };

  if (vendorType === "party") {
    query.vendorPartyId = vendorPartyId;
  } else {
    query.vendorId = vendorId;
  }

  if (bookingItemId) {
    query.$or = [{ bookingItemId }, { bookingItemId: null }];
  }

  const rows = await getSessionQuery(
    TravelVendorReturn.find(query).select("vendorReturnAmount"),
    session,
  ).lean();

  return roundMoney(
    rows.reduce((sum, row) => sum + Number(row.vendorReturnAmount || 0), 0),
  );
};

const buildReturnPayload = async ({ body, userId, session = null }) => {
  const vendorCounterparty = normalizeVendorCounterpartyInput(body);
  const vendorId = vendorCounterparty.vendorId
    ? toObjectId(vendorCounterparty.vendorId, "vendor")
    : null;
  const vendorPartyId = vendorCounterparty.vendorPartyId
    ? toObjectId(vendorCounterparty.vendorPartyId, "party")
    : null;
  const originalInvoiceId = optionalObjectId(body.originalInvoiceId, "travel invoice");
  const bookingItemId = optionalObjectId(body.bookingItemId, "travel service");
  const returnDate = normalizeDate(body.returnDate || body.date);
  const returnTime = normalizeTimeInput(body.returnTime || body.time, body.returnDate || body.date);
  const vendorReturnAmount = moneyNumber(body.vendorReturnAmount, "vendor return amount");
  const amountReceivedNow = moneyNumber(body.amountReceivedNow, "amount received now", {
    allowZero: true,
  });
  const paymentType = amountReceivedNow > 0
    ? normalizePaymentType(body.paymentType)
    : "credit";
  const notes = cleanString(body.notes || body.description);

  if (amountReceivedNow > vendorReturnAmount) {
    throw createHttpError(400, "Amount received now cannot exceed vendor return amount");
  }

  const vendor = await resolveTravelVendorCounterparty({
    userId,
    source: vendorCounterparty,
    session,
  });

  let invoice = null;
  let originalCost = moneyNumber(body.originalCost, "original cost", { allowZero: true });
  let originalInvoiceNumber = cleanString(body.originalInvoiceNumber).toUpperCase();
  let serviceLabel = cleanString(body.serviceLabel);

  if (originalInvoiceId) {
    invoice = await getSessionQuery(
      TravelBooking.findOne({
        _id: originalInvoiceId,
        userId: toObjectId(userId, "user"),
        isActive: true,
        isDeleted: false,
        isVoided: { $ne: true },
        accountingPosted: true,
        status: { $in: [...POSTING_STATUSES] },
      }).select("bookingNumber invoiceNumber bookingItems serviceType costTotal"),
      session,
    ).lean();

    if (!invoice) {
      throw createHttpError(404, "Posted travel invoice not found");
    }

    const rows = collectVendorCostRows(invoice, {
      vendorType: vendor.vendorType,
      vendorId,
      vendorPartyId,
    });
    const selectedRows = bookingItemId
      ? rows.filter((row) => String(row.id || "") === String(bookingItemId))
      : rows;
    const eligibleCost = roundMoney(
      selectedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
    );

    if (eligibleCost <= 0) {
      throw createHttpError(400, "Selected vendor has no eligible cost on this invoice");
    }

    const priorRefundRecovery = await sumPriorRefundRecoveries({
      userId,
      invoiceId: invoice._id,
      vendorId,
      vendorType: vendor.vendorType,
      vendorPartyId,
      bookingItemId,
      session,
    });
    const priorVendorReturns = await sumPriorVendorReturns({
      userId,
      invoiceId: invoice._id,
      vendorId,
      vendorType: vendor.vendorType,
      vendorPartyId,
      bookingItemId,
      session,
    });
    const availableReturn = roundMoney(
      eligibleCost - priorRefundRecovery - priorVendorReturns,
    );

    if (vendorReturnAmount > availableReturn) {
      throw createHttpError(400, "Vendor return exceeds remaining eligible vendor cost");
    }

    originalCost = originalCost > 0 ? originalCost : eligibleCost;
    originalInvoiceNumber = invoice.invoiceNumber || invoice.bookingNumber || originalInvoiceNumber;
    serviceLabel =
      serviceLabel ||
      (selectedRows.length === 1 ? selectedRows[0].label : invoice.serviceType || "Travel service");
  } else if (originalCost > 0 && vendorReturnAmount > originalCost) {
    throw createHttpError(400, "Vendor return cannot exceed original cost");
  }

  const balanceMap = await getTravelVendorBalanceMap(userId, [vendor], { session });
  const currentVendorBalance = roundMoney(
    balanceMap.get(String(vendor.accountId)) || 0,
  );
  const balanceAfterReturnCredit = roundMoney(currentVendorBalance - vendorReturnAmount);
  const availableVendorCredit = Math.max(-balanceAfterReturnCredit, 0);

  if (amountReceivedNow > availableVendorCredit) {
    throw createHttpError(
      400,
      "Amount received now can only settle an existing vendor credit after the return",
    );
  }

  const paymentAccount = await getPaymentAccount({
    userId,
    accountId: body.accountId || body.account,
    amountReceivedNow,
    session,
  });

  return {
    vendor,
    invoice,
    paymentAccount,
    data: {
      vendorId,
      vendorType: vendor.vendorType,
      vendorPartyId,
      originalInvoiceId: invoice?._id || null,
      originalInvoiceNumber,
      bookingItemId: bookingItemId || null,
      serviceLabel,
      originalCost,
      vendorReturnAmount,
      vendorPenaltyAmount: roundMoney(
        Math.max(moneyNumber(body.vendorPenaltyAmount, "vendor penalty", { allowZero: true }), 0) ||
          Math.max(originalCost - vendorReturnAmount, 0),
      ),
      amountReceivedNow,
      paymentType,
      accountId: paymentAccount?._id || null,
      returnDate,
      returnTime,
      notes,
    },
  };
};

const postVendorReturnAccounting = async ({
  vendorReturn,
  vendor,
  paymentAccount,
  userId,
  session = null,
}) => {
  const travelCostAccount = await getTravelCostAccount(userId, session);
  const returnDate = vendorReturn.returnDate || new Date();
  const returnTime = cleanString(vendorReturn.returnTime) || returnDate.toTimeString().slice(0, 5);
  const journals = [];

  const costJournal = new JournalEntry({
    date: returnDate,
    time: returnTime,
    description: `Travel Vendor Return ${vendorReturn.returnNumber} - ${vendor.name}`,
    sourceType: "travel_vendor_return",
    originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
    referenceId: vendorReturn._id,
    invoiceId: vendorReturn.originalInvoiceId || null,
    invoiceModel: vendorReturn.originalInvoiceId ? "TravelBooking" : null,
    billNo: vendorReturn.returnNumber,
    createdBy: userId,
    ...getVendorJournalIdentity(vendor),
    attachmentUrl: vendorReturn.attachmentUrl || "",
    attachmentType: vendorReturn.attachmentType || "",
    lines: [
      {
        account: vendor.accountId,
        type: "debit",
        amount: roundMoney(vendorReturn.vendorReturnAmount),
      },
      {
        account: travelCostAccount._id,
        type: "credit",
        amount: roundMoney(vendorReturn.vendorReturnAmount),
      },
    ],
  });

  await costJournal.save({ session });
  journals.push(costJournal);
  vendorReturn.costJournalEntryId = costJournal._id;

  if (roundMoney(vendorReturn.amountReceivedNow) > 0 && paymentAccount) {
    const paymentJournal = await createPaymentEntry({
      userId,
      referenceId: vendorReturn._id,
      sourceType: "purchase_return_payment",
      originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
      billNo: vendorReturn.returnNumber,
      accountId: paymentAccount._id,
      counterPartyAccountId: vendor.accountId,
      amount: roundMoney(vendorReturn.amountReceivedNow),
      paymentType: vendorReturn.paymentType,
      description: `Travel Vendor Return Receipt ${vendorReturn.returnNumber}`,
      ...getVendorJournalIdentity(vendor),
      entryDate: returnDate,
      entryTime: returnTime,
      session,
    });

    journals.push(paymentJournal);
    vendorReturn.paymentJournalEntryId = paymentJournal._id;
  }

  await vendorReturn.save({ session });

  return [
    ...new Set(
      journals.flatMap((journal) =>
        (journal.lines || []).map((line) => String(line.account)).filter(Boolean),
      ),
    ),
  ];
};

const serializeVendorReturn = (record) => {
  if (!record) {
    return record;
  }

  const plain = record.toObject ? record.toObject() : { ...record };
  const vendor =
    plain.vendorType === "party" && plain.vendorPartyId
      ? plain.vendorPartyId
      : plain.vendorId;

  return {
    ...plain,
    vendor,
    returnId: plain._id,
    invoiceNumber: plain.originalInvoiceNumber,
  };
};

const addAndClause = (query, clause) => {
  query.$and = [...(query.$and || []), clause];
};

const buildReturnDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) {
    return null;
  }

  const range = {};

  if (fromDate) {
    const start = normalizeDate(fromDate);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (toDate) {
    const end = normalizeDate(toDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
};

const findTravelVendorsForSearch = async (userId, search) => {
  const safeSearch = escapeRegex(search);

  const [vendors, parties] = await Promise.all([
    Supplier.find(
      applySupplierModuleScopeFilter(
        {
          userId: toObjectId(userId, "user"),
          isDeleted: false,
          $or: [
            { name: { $regex: safeSearch, $options: "i" } },
            { phone: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
            { contactPerson: { $regex: safeSearch, $options: "i" } },
          ],
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id")
      .limit(50)
      .lean(),
    Party.find({
      ...buildTravelPartyRoleQuery(toObjectId(userId, "user"), "supplier"),
      $or: [
        { name: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ],
    })
      .select("_id")
      .limit(50)
      .lean(),
  ]);

  return {
    vendorIds: vendors.map((vendor) => vendor._id),
    partyIds: parties.map((party) => party._id),
  };
};

exports.getTravelVendorReturns = async (req, res) => {
  try {
    const userId = getUserId(req);
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const search = cleanString(req.query.search);
    const returnNumber = cleanString(req.query.returnNumber);
    const originalInvoice = cleanString(
      req.query.originalInvoice || req.query.originalInvoiceNumber,
    );
    const vendorFilter = normalizeVendorCounterpartyInput(req.query);
    const vendorId = vendorFilter.vendorId
      ? toObjectId(vendorFilter.vendorId, "vendor")
      : null;
    const vendorPartyId = vendorFilter.vendorPartyId
      ? toObjectId(vendorFilter.vendorPartyId, "party")
      : null;
    const receivedStatus = cleanString(req.query.receivedStatus).toLowerCase();
    const dateRange = buildReturnDateRange(req.query.fromDate, req.query.toDate);
    const query = {
      userId,
      isDeleted: false,
      isReversed: { $ne: true },
    };

    if (returnNumber) {
      query.returnNumber = { $regex: escapeRegex(returnNumber), $options: "i" };
    }

    if (originalInvoice) {
      query.originalInvoiceNumber = {
        $regex: escapeRegex(originalInvoice),
        $options: "i",
      };
    }

    if (vendorPartyId) {
      query.vendorPartyId = vendorPartyId;
    } else if (vendorId) {
      query.vendorId = vendorId;
    }

    if (dateRange) {
      query.returnDate = dateRange;
    }

    if (receivedStatus === "received") {
      addAndClause(query, {
        $expr: { $gte: ["$amountReceivedNow", "$vendorReturnAmount"] },
      });
    } else if (receivedStatus === "outstanding") {
      addAndClause(query, {
        vendorReturnAmount: { $gt: 0 },
        $expr: { $lt: ["$amountReceivedNow", "$vendorReturnAmount"] },
      });
    } else if (receivedStatus === "partial") {
      addAndClause(query, {
        amountReceivedNow: { $gt: 0 },
        $expr: { $lt: ["$amountReceivedNow", "$vendorReturnAmount"] },
      });
    } else if (receivedStatus === "credit") {
      addAndClause(query, {
        vendorReturnAmount: { $gt: 0 },
        amountReceivedNow: { $lte: 0 },
      });
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const matchingVendors = await findTravelVendorsForSearch(userId, search);

      addAndClause(query, {
        $or: [
          { returnNumber: { $regex: safeSearch, $options: "i" } },
          { originalInvoiceNumber: { $regex: safeSearch, $options: "i" } },
          { serviceLabel: { $regex: safeSearch, $options: "i" } },
          { notes: { $regex: safeSearch, $options: "i" } },
          { vendorId: { $in: matchingVendors.vendorIds } },
          { vendorPartyId: { $in: matchingVendors.partyIds } },
        ],
      });
    }

    const [records, total] = await Promise.all([
      TravelVendorReturn.find(query)
        .populate("vendorId", "name phone travelVendorType moduleScope")
        .populate("vendorPartyId", "name phone email role moduleScope")
        .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
        .populate("accountId", "name code category type")
        .sort({ returnDate: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      TravelVendorReturn.countDocuments(query),
    ]);

    return res.json({
      data: records.map(serializeVendorReturn),
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor returns fetch failed");
  }
};

exports.getTravelVendorReturnById = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid vendor return ID" });
    }

    const record = await TravelVendorReturn.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
      isReversed: { $ne: true },
    })
      .populate("vendorId", "name phone travelVendorType moduleScope")
      .populate("vendorPartyId", "name phone email role moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType bookingItems")
      .populate("accountId", "name code category type")
      .lean();

    if (!record) {
      return res.status(404).json({ message: "Travel vendor return not found" });
    }

    return res.json(serializeVendorReturn(record));
  } catch (error) {
    return sendError(res, error, "Travel vendor return fetch failed");
  }
};

exports.getTravelVendorReturnInvoices = async (req, res) => {
  try {
    const userId = getUserId(req);
    const vendorFilter = normalizeVendorCounterpartyInput(req.query);
    const vendorId = vendorFilter.vendorId
      ? toObjectId(vendorFilter.vendorId, "vendor")
      : null;
    const vendorPartyId = vendorFilter.vendorPartyId
      ? toObjectId(vendorFilter.vendorPartyId, "party")
      : null;
    const search = cleanString(req.query.search);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const query = {
      userId,
      isActive: true,
      isDeleted: false,
      isVoided: { $ne: true },
      accountingPosted: true,
      status: { $in: [...POSTING_STATUSES] },
    };

    if (vendorPartyId) {
      query.$or = [
        { "bookingItems.vendorPartyId": vendorPartyId },
        { "bookingItems.umrahDetails.components.vendorPartyId": vendorPartyId },
      ];
    } else if (vendorId) {
      query.$or = [
        { "bookingItems.vendorId": vendorId },
        { "bookingItems.umrahDetails.components.vendorId": vendorId },
      ];
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const searchOr = [
        { bookingNumber: { $regex: safeSearch, $options: "i" } },
        { invoiceNumber: { $regex: safeSearch, $options: "i" } },
        { "bookingItems.title": { $regex: safeSearch, $options: "i" } },
      ];

      query.$and = [...(query.$and || []), { $or: searchOr }];
    }

    const invoices = await TravelBooking.find(query)
      .select("bookingNumber invoiceNumber invoiceDate serviceType bookingItems costTotal")
      .sort({ invoiceDate: -1, updatedAt: -1, _id: -1 })
      .limit(limit)
      .lean();

    return res.json(
      invoices.map((invoice) => {
        const costRows = vendorId
          ? collectVendorCostRows(invoice, {
              vendorType: "vendor",
              vendorId,
            })
          : vendorPartyId
            ? collectVendorCostRows(invoice, {
                vendorType: "party",
                vendorPartyId,
              })
          : [];
        const eligibleCost = roundMoney(
          costRows.reduce((sum, row) => sum + Number(row.amount || 0), 0),
        );

        return {
          ...invoice,
          invoiceId: invoice._id,
          invoiceNumber: invoice.invoiceNumber || invoice.bookingNumber,
          eligibleCost,
          serviceLabel:
            costRows.length === 1
              ? costRows[0].label
              : invoice.serviceType || "Travel service",
        };
      }),
    );
  } catch (error) {
    return sendError(res, error, "Travel vendor return invoice fetch failed");
  }
};

exports.createTravelVendorReturn = async (req, res) => {
  const session = await mongoose.startSession();
  let uploadedAttachments = [];
  let vendorReturn = null;
  let accountIds = [];
  let transactionCommitted = false;

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);

    await buildReturnPayload({ body: req.body, userId });
    uploadedAttachments = await uploadTravelInvoiceFiles(
      req.files,
      userId,
      "travel-vendor-returns",
    );

    await session.withTransaction(async () => {
      const built = await buildReturnPayload({
        body: req.body,
        userId,
        session,
      });
      const returnNumber = await generateTravelVendorReturnNumber(
        userId,
        built.data.returnDate,
        session,
      );

      vendorReturn = new TravelVendorReturn({
        ...built.data,
        userId,
        returnNumber,
        createdBy: actorId,
      });

      applyPrimaryAttachmentFields(vendorReturn, uploadedAttachments);
      await vendorReturn.save({ session });

      accountIds = await postVendorReturnAccounting({
        vendorReturn,
        vendor: built.vendor,
        paymentAccount: built.paymentAccount,
        userId,
        session,
      });
    });
    transactionCommitted = true;

    await recalculateAccountBalances(accountIds);
    clearTravelReportCache(userId);

    try {
      await logActivity({
        req,
        action: "create",
        module: "travel.vendorReturns",
        entityType: "TravelVendorReturn",
        entityId: vendorReturn._id,
        title: `Travel Vendor Return ${vendorReturn.returnNumber}`,
        billNo: vendorReturn.returnNumber,
        description: `Travel vendor return ${vendorReturn.returnNumber} created`,
        after: vendorReturn,
      });
    } catch (logError) {
      console.error("Travel vendor return activity log failed:", logError.message);
    }

    const populated = await TravelVendorReturn.findById(vendorReturn._id)
      .populate("vendorId", "name phone travelVendorType moduleScope")
      .populate("vendorPartyId", "name phone email role moduleScope")
      .populate("originalInvoiceId", "bookingNumber invoiceNumber serviceType")
      .populate("accountId", "name code category type")
      .lean();

    return res.status(201).json(serializeVendorReturn(populated));
  } catch (error) {
    if (!transactionCommitted) {
      await cleanupTravelInvoiceAttachments(uploadedAttachments);
    }

    return sendError(res, error, "Travel vendor return create failed");
  } finally {
    await session.endSession();
  }
};

exports.reverseTravelVendorReturn = async (req, res) => {
  const session = await mongoose.startSession();
  let vendorReturn = null;
  let before = null;
  let accountIds = [];

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const reason = getSoftDeleteReason(req, "Travel vendor return corrected");

    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(400).json({ message: "Invalid vendor return ID" });
    }

    await session.withTransaction(async () => {
      vendorReturn = await TravelVendorReturn.findOne({
        _id: req.params.id,
        userId,
        isDeleted: false,
        isReversed: { $ne: true },
      }).session(session);

      if (!vendorReturn) {
        throw Object.assign(new Error("Travel vendor return not found"), {
          statusCode: 404,
        });
      }

      before = vendorReturn.toObject();

      const reversalResult = await reverseTravelJournals({
        userId,
        referenceId: vendorReturn._id,
        originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
        sourceTypes: ["travel_vendor_return", "purchase_return_payment"],
        session,
        reason,
      });

      if (reversalResult.journals.length === 0) {
        throw Object.assign(
          new Error("Travel vendor return journals were not found for reversal"),
          { statusCode: 409 },
        );
      }

      accountIds = reversalResult.accountIds;
      vendorReturn.isDeleted = true;
      vendorReturn.deletedAt = new Date();
      vendorReturn.deletedBy = actorId;
      vendorReturn.deleteReason = reason;
      vendorReturn.isReversed = true;
      vendorReturn.reversedAt = new Date();
      vendorReturn.reversedBy = actorId;
      vendorReturn.reversalJournalEntryIds = reversalResult.reversalIds;

      await vendorReturn.save({ session });
    });

    await recalculateTravelSoftDeleteAccounts(accountIds);
    clearTravelReportCache(userId);

    try {
      await logActivity({
        req,
        action: "reverse",
        module: "travel.vendorReturns",
        entityType: "TravelVendorReturn",
        entityId: vendorReturn._id,
        title: `Travel Vendor Return ${vendorReturn.returnNumber}`,
        billNo: vendorReturn.returnNumber,
        description: `Travel vendor return ${vendorReturn.returnNumber} reversed and archived`,
        before,
        after: {
          isDeleted: vendorReturn.isDeleted,
          isReversed: vendorReturn.isReversed,
          reversalJournalEntryIds: vendorReturn.reversalJournalEntryIds,
          deleteReason: vendorReturn.deleteReason,
        },
      });
    } catch (logError) {
      console.error("Travel vendor return reverse activity log failed:", logError.message);
    }

    return res.json({
      message: "Travel vendor return reversed and archived successfully",
      vendorReturn,
      reversed: true,
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor return delete failed");
  } finally {
    await session.endSession();
  }
};
