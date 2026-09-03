const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Counter = require("../../models/Counter");
const Customer = require("../../models/Customer");
const JournalEntry = require("../../models/JournalEntry");
const PayBill = require("../../models/PayBill");
const Party = require("../../models/Party");
const ReceivePayment = require("../../models/ReceivePayment");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");
const { createPaymentEntry } = require("../../utils/paymentService");
const { logActivity } = require("../../utils/activityLogger");
const {
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  MODULE_SCOPES,
} = require("../../utils/moduleScope");
const {
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_RECEIVE_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
  getTravelCustomerBalanceMap,
  getTravelPartyBalanceMap,
  getTravelVendorBalanceMap,
  roundMoney,
} = require("../../services/travel/travelAccountingMetricsService");
const {
  cleanString,
  createHttpError,
  escapeRegex,
  getActorId,
  getUserId,
  sendError,
} = require("../../services/travel/travelBookingService");
const {
  clearTravelReportCache,
} = require("../../services/travel/travelReportCacheService");
const {
  buildTravelPartyRoleQuery,
  getCustomerJournalIdentity,
  getVendorJournalIdentity,
  normalizeCustomerCounterpartyInput,
  normalizeVendorCounterpartyInput,
  resolveTravelCustomerCounterparty,
  resolveTravelVendorCounterparty,
  serializeCounterparty,
} = require("../../services/travel/travelCounterpartyService");
const {
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../../services/travel/travelSoftDeleteService");

const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];
const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);
const HISTORY_PAYMENT_TYPES = new Set([
  "cash",
  "online",
  "cheque",
  "bank",
  "other",
]);

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

const moneyNumber = (value, label = "amount") => {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return roundMoney(numeric);
};

const normalizePaymentType = (value = "cash") => {
  const clean = cleanString(value || "cash").toLowerCase();
  const paymentType = clean === "bank" ? "online" : clean;

  if (!PAYMENT_TYPES.has(paymentType)) {
    throw createHttpError(400, "Invalid payment type");
  }

  return paymentType;
};

const normalizeHistoryPaymentType = (value = "") => {
  const clean = cleanString(value).toLowerCase();

  if (!clean) {
    return "";
  }

  return HISTORY_PAYMENT_TYPES.has(clean) ? clean : "";
};

const normalizePaymentDate = (value) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, "Invalid payment date");
  }

  return date;
};

const buildDateRange = (fromDate, toDate) => {
  if (!fromDate && !toDate) {
    return null;
  }

  const range = {};

  if (fromDate) {
    const start = normalizePaymentDate(fromDate);
    start.setHours(0, 0, 0, 0);
    range.$gte = start;
  }

  if (toDate) {
    const end = normalizePaymentDate(toDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return range;
};

const padDatePart = (value) => String(value).padStart(2, "0");

const formatDateInput = (date, rawValue = "") => {
  const clean = cleanString(rawValue);
  const dateMatch = clean.match(/^(\d{4}-\d{2}-\d{2})/);

  if (dateMatch) {
    return dateMatch[1];
  }

  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
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
  cleanString(value) ||
  extractTimeFromDateInput(dateValue) ||
  formatCurrentTimeInput();

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const buildDescription = (prefix, reference, notes) =>
  [prefix, cleanString(reference), cleanString(notes)]
    .filter(Boolean)
    .join(" - ");

const getPagedQueryOptions = (query = {}) => {
  const page = Math.max(Number(query.page || 1), 1);
  const limit = Math.min(Math.max(Number(query.limit || 50), 1), 100);

  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

const buildPaymentAccount = (journal, lineType) => {
  const line = (journal.lines || []).find(
    (entryLine) => entryLine.type === lineType,
  );

  return {
    account: line?.account || null,
    amount: Number(line?.amount || 0),
    paymentType: normalizeHistoryPaymentType(line?.paymentType),
  };
};

const mapRecordById = (records = []) =>
  new Map(records.map((record) => [String(record._id), record]));

const findTravelCustomersForSearch = async (userId, search) => {
  if (!search) {
    return {
      customerIds: [],
      partyIds: [],
    };
  }

  const safeSearch = escapeRegex(search);

  const [customers, parties] = await Promise.all([
    Customer.find(
      applyModuleScopeFilter(
        {
          createdBy: toObjectId(userId, "user"),
          isActive: { $ne: false },
          $or: [
            { name: { $regex: safeSearch, $options: "i" } },
            { phone: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
          ],
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id")
      .limit(50)
      .lean(),
    Party.find({
      ...buildTravelPartyRoleQuery(toObjectId(userId, "user"), "customer"),
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
    customerIds: customers.map((customer) => customer._id),
    partyIds: parties.map((party) => party._id),
  };
};

const findTravelVendorsForSearch = async (userId, search) => {
  if (!search) {
    return {
      vendorIds: [],
      partyIds: [],
    };
  }

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

const findTravelInvoicesForSearch = async (userId, search) => {
  if (!search) {
    return [];
  }

  const safeSearch = escapeRegex(search);

  return TravelBooking.find({
    userId: toObjectId(userId, "user"),
    isActive: true,
    isDeleted: false,
    isVoided: { $ne: true },
    $or: [
      { bookingNumber: { $regex: safeSearch, $options: "i" } },
      { invoiceNumber: { $regex: safeSearch, $options: "i" } },
      { notes: { $regex: safeSearch, $options: "i" } },
      { internalNotes: { $regex: safeSearch, $options: "i" } },
    ],
  })
    .select("_id")
    .limit(50)
    .lean();
};

const generateTravelPaymentNumber = async ({
  userId,
  date = new Date(),
  counterType,
  prefix,
}) => {
  const parsedDate = new Date(date);
  const year = Number.isNaN(parsedDate.getTime())
    ? new Date().getFullYear()
    : parsedDate.getFullYear();

  const counter = await Counter.findOneAndUpdate(
    {
      userId,
      type: `${counterType}_${year}`,
    },
    {
      $inc: { seq: 1 },
      $setOnInsert: {
        userId,
        type: `${counterType}_${year}`,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: false,
    },
  );

  return `${prefix}-${year}-${String(counter.seq).padStart(5, "0")}`;
};

exports.getTravelReceivePayments = async (req, res) => {
  try {
    const userId = getUserId(req);
    const objectUserId = toObjectId(userId, "user");
    const { page, limit, skip } = getPagedQueryOptions(req.query);
    const search = cleanString(req.query.search);
    const customerFilter = normalizeCustomerCounterpartyInput(req.query);
    const customerId = optionalObjectId(customerFilter.customerId, "customer");
    const customerPartyId = optionalObjectId(
      customerFilter.customerPartyId,
      "party",
    );
    const accountId = optionalObjectId(
      req.query.accountId || req.query.account,
      "payment account",
    );
    const dateRange = buildDateRange(req.query.fromDate, req.query.toDate);
    const paymentType = normalizeHistoryPaymentType(req.query.paymentType);
    const query = {
      createdBy: objectUserId,
      isDeleted: false,
      isReversed: { $ne: true },
      sourceType: "receive_payment",
      originModule: {
        $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
      },
    };

    if (customerPartyId) {
      query.partyId = customerPartyId;
    } else if (customerId) {
      query.customerId = customerId;
    }

    if (accountId) {
      query["lines.account"] = accountId;
    }

    if (dateRange) {
      query.date = dateRange;
    }

    if (paymentType) {
      query["lines.paymentType"] =
        paymentType === "bank" ? "online" : paymentType;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const [matchingCustomers, matchingInvoices] = await Promise.all([
        findTravelCustomersForSearch(userId, search),
        findTravelInvoicesForSearch(userId, search),
      ]);

      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { billNo: { $regex: safeSearch, $options: "i" } },
            { description: { $regex: safeSearch, $options: "i" } },
            {
              customerId: {
                $in: matchingCustomers.customerIds,
              },
            },
            {
              partyId: {
                $in: matchingCustomers.partyIds,
              },
            },
            {
              referenceId: {
                $in: matchingInvoices.map((invoice) => invoice._id),
              },
            },
          ],
        },
      ];
    }

    const [journals, total] = await Promise.all([
      JournalEntry.find(query)
        .select(
          "date time description billNo originModule referenceId customerId partyId lines createdAt",
        )
        .populate("customerId", "name phone email moduleScope")
        .populate("partyId", "name phone email role moduleScope")
        .populate("lines.account", "name code category type")
        .sort({ date: -1, time: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JournalEntry.countDocuments(query),
    ]);

    const standalonePaymentIds = journals
      .filter(
        (journal) => journal.originModule === TRAVEL_RECEIVE_PAYMENT_ORIGIN,
      )
      .map((journal) => journal.referenceId)
      .filter(Boolean);
    const invoiceIds = journals
      .filter((journal) => journal.originModule === TRAVEL_INVOICE_ORIGIN)
      .map((journal) => journal.referenceId)
      .filter(Boolean);

    const [payments, invoices] = await Promise.all([
      standalonePaymentIds.length
        ? ReceivePayment.find({
            _id: { $in: standalonePaymentIds },
            userId: objectUserId,
            isDeleted: false,
            isReversed: { $ne: true },
          })
            .select(
              "customer partyId date time amount finalAmount paymentType billNo account description originModule",
            )
            .populate("customer", "name phone email moduleScope")
            .populate("partyId", "name phone email role moduleScope")
            .populate("account", "name code category type")
            .lean()
        : [],
      invoiceIds.length
        ? TravelBooking.find({
            _id: { $in: invoiceIds },
            userId: objectUserId,
            isActive: true,
            isDeleted: false,
            isVoided: { $ne: true },
          })
            .select(
              "bookingNumber invoiceNumber customerType customerId customerPartyId accountId paymentType notes",
            )
            .populate("customerId", "name phone email moduleScope")
            .populate("customerPartyId", "name phone email role moduleScope")
            .populate("accountId", "name code category type")
            .lean()
        : [],
    ]);

    const paymentMap = mapRecordById(payments);
    const invoiceMap = mapRecordById(invoices);

    res.set("Cache-Control", "private, no-cache");

    return res.json({
      data: journals.map((journal) => {
        const payment = paymentMap.get(String(journal.referenceId || ""));
        const invoice = invoiceMap.get(String(journal.referenceId || ""));
        const paymentLine = buildPaymentAccount(journal, "debit");
        const customer =
          payment?.partyId ||
          payment?.customer ||
          journal.partyId ||
          journal.customerId ||
          invoice?.customerPartyId ||
          invoice?.customerId ||
          null;
        const paymentAccount =
          payment?.account || invoice?.accountId || paymentLine.account;

        return {
          _id: journal._id,
          journalEntryId: journal._id,
          sourceRecordId:
            payment?._id || invoice?._id || journal.referenceId || null,
          originModule: journal.originModule,
          date: payment?.date || journal.date,
          time: payment?.time || journal.time || "",
          receiptNumber: payment?.billNo || journal.billNo || "",
          referenceNo: payment?.billNo || journal.billNo || "",
          customer,
          invoiceId: invoice?._id || null,
          invoiceNo: invoice?.invoiceNumber || invoice?.bookingNumber || "",
          paymentMethod:
            normalizeHistoryPaymentType(payment?.paymentType) ||
            paymentLine.paymentType ||
            "",
          paymentAccount,
          amount: roundMoney(
            paymentLine.amount || payment?.finalAmount || payment?.amount || 0,
          ),
          notes: payment?.description || journal.description || "",
        };
      }),
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error, "Travel receive payments fetch failed");
  }
};

exports.getTravelVendorPayments = async (req, res) => {
  try {
    const userId = getUserId(req);
    const objectUserId = toObjectId(userId, "user");
    const { page, limit, skip } = getPagedQueryOptions(req.query);
    const search = cleanString(req.query.search);
    const vendorFilter = normalizeVendorCounterpartyInput(req.query);
    const vendorId = optionalObjectId(vendorFilter.vendorId, "vendor");
    const vendorPartyId = optionalObjectId(vendorFilter.vendorPartyId, "party");
    const accountId = optionalObjectId(
      req.query.accountId || req.query.account,
      "payment account",
    );
    const dateRange = buildDateRange(req.query.fromDate, req.query.toDate);
    const paymentType = normalizeHistoryPaymentType(req.query.paymentType);
    const query = {
      createdBy: objectUserId,
      isDeleted: false,
      isReversed: { $ne: true },
      sourceType: "pay_bill",
      originModule: {
        $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_VENDOR_PAYMENT_ORIGIN],
      },
    };

    if (vendorPartyId) {
      query.partyId = vendorPartyId;
    } else if (vendorId) {
      query.supplierId = vendorId;
    }

    if (accountId) {
      query["lines.account"] = accountId;
    }

    if (dateRange) {
      query.date = dateRange;
    }

    if (paymentType) {
      query["lines.paymentType"] =
        paymentType === "bank" ? "online" : paymentType;
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      const matchingVendors = await findTravelVendorsForSearch(userId, search);

      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            { billNo: { $regex: safeSearch, $options: "i" } },
            { description: { $regex: safeSearch, $options: "i" } },
            {
              supplierId: { $in: matchingVendors.vendorIds },
            },
            {
              partyId: { $in: matchingVendors.partyIds },
            },
          ],
        },
      ];
    }

    const [journals, total] = await Promise.all([
      JournalEntry.find(query)
        .select(
          "date time description billNo originModule referenceId supplierId partyId lines createdAt",
        )
        .populate("supplierId", "name phone email travelVendorType moduleScope")
        .populate("partyId", "name phone email role moduleScope")
        .populate("lines.account", "name code category type")
        .sort({ date: -1, time: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      JournalEntry.countDocuments(query),
    ]);

    const standalonePaymentIds = journals
      .filter(
        (journal) => journal.originModule === TRAVEL_VENDOR_PAYMENT_ORIGIN,
      )
      .map((journal) => journal.referenceId)
      .filter(Boolean);

    const invoiceIds = journals
      .filter((journal) => journal.originModule === TRAVEL_INVOICE_ORIGIN)
      .map((journal) => journal.referenceId)
      .filter(Boolean);

    const [bills, invoices] = await Promise.all([
      standalonePaymentIds.length
        ? PayBill.find({
            _id: { $in: standalonePaymentIds },
            userId: objectUserId,
            isDeleted: false,
            isReversed: { $ne: true },
            originModule: TRAVEL_VENDOR_PAYMENT_ORIGIN,
          })
            .select(
              "supplier partyId date time amount finalAmount paymentType billNo account description originModule",
            )
            .populate(
              "supplier",
              "name phone email travelVendorType moduleScope",
            )
            .populate("partyId", "name phone email role moduleScope")
            .populate("account", "name code category type")
            .lean()
        : [],

      invoiceIds.length
        ? TravelBooking.find({
            _id: { $in: invoiceIds },
            userId: objectUserId,
            isActive: true,
            isDeleted: false,
            isVoided: { $ne: true },
          })
            .select(
              "bookingNumber invoiceNumber vendorPaymentAccountId vendorPaymentType",
            )
            .populate("vendorPaymentAccountId", "name code category type")
            .lean()
        : [],
    ]);

    const billMap = mapRecordById(bills);
    const invoiceMap = mapRecordById(invoices);

    res.set("Cache-Control", "private, no-cache");

    return res.json({
      data: journals.map((journal) => {
        const bill = billMap.get(String(journal.referenceId || ""));
        const invoice = invoiceMap.get(String(journal.referenceId || ""));
        const paymentLine = buildPaymentAccount(journal, "credit");
        const vendor = bill?.partyId || bill?.supplier || journal.partyId || journal.supplierId || null;

        return {
          _id: journal._id,
          journalEntryId: journal._id,
          sourceRecordId: bill?._id || journal.referenceId || null,
          originModule: journal.originModule,
          date: bill?.date || journal.date,
          time: bill?.time || journal.time || "",
          paymentNumber: bill?.billNo || journal.billNo || "",
          referenceNo: bill?.billNo || journal.billNo || "",
          vendor,
          invoiceNo: invoice?.invoiceNumber || invoice?.bookingNumber || "",
          paymentMethod:
            normalizeHistoryPaymentType(bill?.paymentType) ||
            paymentLine.paymentType ||
            "",
          paymentAccount:
            bill?.account ||
            invoice?.vendorPaymentAccountId ||
            paymentLine.account,
          amount: roundMoney(
            paymentLine.amount || bill?.finalAmount || bill?.amount || 0,
          ),
          notes: bill?.description || journal.description || "",
        };
      }),
      total,
      page,
      limit,
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor payments fetch failed");
  }
};

const getPaymentAccount = async (userId, accountId) => {
  const account = await Account.findOne(
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
  )
    .select("_id name code category type")
    .lean();

  if (!account) {
    throw createHttpError(400, "Payment account not found");
  }

  return account;
};

exports.createTravelReceivePayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const amount = moneyNumber(req.body.amount, "payment amount");
    const paymentType = normalizePaymentType(req.body.paymentType);
    const paymentDate = normalizePaymentDate(req.body.date);
    const time = normalizeTimeInput(req.body.time, req.body.date);
    const notes = cleanString(req.body.notes || req.body.description);
    const reference = cleanString(req.body.reference || req.body.referenceNo);

    const [customer, paymentAccount] = await Promise.all([
      resolveTravelCustomerCounterparty({
        userId: toObjectId(userId, "user"),
        source: req.body,
      }),
      getPaymentAccount(userId, req.body.accountId || req.body.account),
    ]);

    if (!customer || !customer.accountId) {
      throw createHttpError(404, "Travel customer account not found");
    }

    const billNo = await generateTravelPaymentNumber({
      userId,
      date: paymentDate,
      counterType: "travel_receive_payment",
      prefix: "TRP",
    });
    const description = buildDescription(
      `Travel Receive Payment ${billNo}`,
      reference,
      notes,
    );

    const payment = await ReceivePayment.create({
      customer: customer.customerId,
      partyId: customer.partyId,
      date: formatDateInput(paymentDate, req.body.date),
      time,
      amount,
      discountAmount: 0,
      finalAmount: amount,
      previousBalance: null,
      paymentType,
      billNo,
      account: paymentAccount._id,
      description,
      originModule: TRAVEL_RECEIVE_PAYMENT_ORIGIN,
      userId,
    });

    const journal = await createPaymentEntry({
      userId,
      referenceId: payment._id,
      sourceType: "receive_payment",
      originModule: TRAVEL_RECEIVE_PAYMENT_ORIGIN,
      billNo,
      accountId: paymentAccount._id,
      counterPartyAccountId: customer.accountId,
      amount,
      paymentType,
      description,
      ...getCustomerJournalIdentity(customer),
      entryDate: paymentDate,
      entryTime: time,
    });

    payment.journalEntryId = journal._id;
    await payment.save();

    const balanceMap =
      customer.entityType === "party"
        ? await getTravelPartyBalanceMap(userId, [customer.record])
        : await getTravelCustomerBalanceMap(userId, [customer.record]);
    const accountId = String(customer.accountId);
    const balance = roundMoney(balanceMap.get(accountId) || 0);

    try {
      await logActivity({
        req,
        action: "create",
        module: "travel.payments",
        entityType: "ReceivePayment",
        entityId: payment._id,
        title: `Travel Receive Payment ${billNo}`,
        billNo,
        description,
        after: payment,
        createdBy: actorId,
      });
    } catch (logError) {
      console.error(
        "Travel receive payment activity log failed:",
        logError.message,
      );
    }

    clearTravelReportCache(userId);

    return res.status(201).json({
      payment,
      journalEntryId: journal._id,
      customer: serializeCounterparty(customer),
      balance,
      currentReceivable: Math.max(balance, 0),
      customerCredit: Math.max(-balance, 0),
    });
  } catch (error) {
    return sendError(res, error, "Travel receive payment failed");
  }
};

exports.createTravelVendorPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const amount = moneyNumber(req.body.amount, "payment amount");
    const paymentType = normalizePaymentType(req.body.paymentType);
    const paymentDate = normalizePaymentDate(req.body.date);
    const time = normalizeTimeInput(req.body.time, req.body.date);
    const notes = cleanString(req.body.notes || req.body.description);
    const reference = cleanString(req.body.reference || req.body.referenceNo);

    const [vendor, paymentAccount] = await Promise.all([
      resolveTravelVendorCounterparty({
        userId: toObjectId(userId, "user"),
        source: req.body,
      }),
      getPaymentAccount(userId, req.body.accountId || req.body.account),
    ]);

    if (!vendor || !vendor.accountId) {
      throw createHttpError(404, "Travel vendor account not found");
    }

    const billNo = await generateTravelPaymentNumber({
      userId,
      date: paymentDate,
      counterType: "travel_vendor_payment",
      prefix: "TVP",
    });
    const description = buildDescription(
      `Travel Vendor Payment ${billNo}`,
      reference,
      notes,
    );

    const bill = await PayBill.create({
      supplier: vendor.supplierId,
      partyId: vendor.partyId,
      date: formatDateInput(paymentDate, req.body.date),
      time,
      billNo,
      amount,
      discountAmount: 0,
      finalAmount: amount,
      paymentType,
      account: paymentAccount._id,
      description,
      originModule: TRAVEL_VENDOR_PAYMENT_ORIGIN,
      userId,
    });

    const journal = await createPaymentEntry({
      userId,
      referenceId: bill._id,
      sourceType: "pay_bill",
      originModule: TRAVEL_VENDOR_PAYMENT_ORIGIN,
      billNo,
      accountId: paymentAccount._id,
      counterPartyAccountId: vendor.accountId,
      amount,
      paymentType,
      description,
      ...getVendorJournalIdentity(vendor),
      entryDate: paymentDate,
      entryTime: time,
    });

    bill.journalEntryId = journal._id;
    await bill.save();

    const balanceMap =
      vendor.entityType === "party"
        ? await getTravelPartyBalanceMap(userId, [vendor.record])
        : await getTravelVendorBalanceMap(userId, [vendor.record]);
    const accountId = String(vendor.accountId);
    const balance = roundMoney(balanceMap.get(accountId) || 0);
    const payableBalance =
      vendor.entityType === "party" ? roundMoney(-balance) : balance;

    try {
      await logActivity({
        req,
        action: "create",
        module: "travel.vendorPayments",
        entityType: "PayBill",
        entityId: bill._id,
        title: `Travel Vendor Payment ${billNo}`,
        billNo,
        description,
        after: bill,
        createdBy: actorId,
      });
    } catch (logError) {
      console.error(
        "Travel vendor payment activity log failed:",
        logError.message,
      );
    }

    clearTravelReportCache(userId);

    return res.status(201).json({
      payment: bill,
      journalEntryId: journal._id,
      vendor: serializeCounterparty(vendor),
      balance,
      currentPayable: Math.max(payableBalance, 0),
      vendorCredit: Math.max(-payableBalance, 0),
    });
  } catch (error) {
    return sendError(res, error, "Travel vendor payment failed");
  }
};

const reverseStandaloneTravelPayment = async ({
  req,
  res,
  Model,
  recordLabel,
  recordField,
  originModule,
  sourceType,
  activityModule,
  notFoundMessage,
  failureMessage,
}) => {
  const session = await mongoose.startSession();
  let record = null;
  let before = null;
  let accountIds = [];

  try {
    const userId = getUserId(req);
    const actorId = getActorId(req);
    const objectUserId = toObjectId(userId, "user");
    const recordId = toObjectId(req.params.id, recordLabel);
    const reason = getSoftDeleteReason(req, `${recordLabel} corrected`);

    await session.withTransaction(async () => {
      record = await getSessionQuery(
        Model.findOne({
          _id: recordId,
          userId: objectUserId,
          isDeleted: false,
          originModule,
        }),
        session,
      );

      if (!record) {
        throw Object.assign(new Error(notFoundMessage), { statusCode: 404 });
      }

      before = record.toObject();

      const reversalResult = await reverseTravelJournals({
        userId: objectUserId,
        referenceId: record._id,
        originModule,
        sourceTypes: [sourceType],
        session,
        reason,
      });

      if (reversalResult.journals.length === 0) {
        throw Object.assign(
          new Error(`${recordLabel} journal was not found for reversal`),
          { statusCode: 409 },
        );
      }

      accountIds = reversalResult.accountIds;
      record.isDeleted = true;
      record.deletedAt = new Date();
      record.deletedBy = actorId;
      record.deleteReason = reason;
      record.isReversed = true;
      record.reversedAt = new Date();
      record.reversedBy = actorId;
      record.reversalJournalEntryIds = reversalResult.reversalIds;

      await record.save({ session });
    });

    await recalculateTravelSoftDeleteAccounts(accountIds);
    clearTravelReportCache(userId);

    try {
      await logActivity({
        req,
        action: "reverse",
        module: activityModule,
        entityType: Model.modelName,
        entityId: record._id,
        title: `${recordLabel} ${record.billNo || record._id}`,
        billNo: record.billNo || "",
        description: `${recordLabel} ${record.billNo || record._id} reversed and archived`,
        before,
        after: {
          isDeleted: record.isDeleted,
          isReversed: record.isReversed,
          reversalJournalEntryIds: record.reversalJournalEntryIds,
          deleteReason: record.deleteReason,
        },
      });
    } catch (logError) {
      console.error(
        `${recordLabel} reverse activity log failed:`,
        logError.message,
      );
    }

    return res.json({
      message: `${recordLabel} reversed and archived successfully`,
      [recordField]: record,
      reversed: true,
    });
  } catch (error) {
    return sendError(res, error, failureMessage);
  } finally {
    await session.endSession();
  }
};

exports.reverseTravelReceivePayment = (req, res) =>
  reverseStandaloneTravelPayment({
    req,
    res,
    Model: ReceivePayment,
    recordLabel: "Travel receive payment",
    recordField: "payment",
    originModule: TRAVEL_RECEIVE_PAYMENT_ORIGIN,
    sourceType: "receive_payment",
    activityModule: "travel.payments",
    notFoundMessage: "Travel receive payment not found",
    failureMessage: "Travel receive payment delete failed",
  });

exports.reverseTravelVendorPayment = (req, res) =>
  reverseStandaloneTravelPayment({
    req,
    res,
    Model: PayBill,
    recordLabel: "Travel vendor payment",
    recordField: "payment",
    originModule: TRAVEL_VENDOR_PAYMENT_ORIGIN,
    sourceType: "pay_bill",
    activityModule: "travel.vendorPayments",
    notFoundMessage: "Travel vendor payment not found",
    failureMessage: "Travel vendor payment delete failed",
  });
