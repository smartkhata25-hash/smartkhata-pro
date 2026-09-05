const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Customer = require("../../models/Customer");
const JournalEntry = require("../../models/JournalEntry");
const Supplier = require("../../models/Supplier");
const TravelBooking = require("../../models/TravelBooking");

const { recalculateAccountBalances } = require("../../utils/accountHelper");
const {
  extractBusinessTime,
  parseBusinessDateTime,
} = require("../../utils/businessDate");

const {
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  MODULE_SCOPES,
} = require("../../utils/moduleScope");

const { createPaymentEntry } = require("../../utils/paymentService");
const {
  getCustomerJournalIdentity,
  getVendorJournalIdentity,
  resolveTravelCustomerCounterparty,
  resolveTravelVendorCounterparty,
} = require("./travelCounterpartyService");

const { resolveTravelInvoiceNumber } = require("./travelInvoiceNumberService");

const TRAVEL_INVOICE_ORIGIN = "travel_invoice";

const POSTING_STATUSES = new Set(["confirmed", "processing", "completed"]);

const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);

const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;

  return error;
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const getSessionQuery = (query, session) =>
  session ? query.session(session) : query;

const resolveInvoiceBusinessDate = (booking) => {
  try {
    return parseBusinessDateTime(
      booking.invoiceDate || booking.confirmedAt || new Date(),
      "",
      {
        defaultTime: "00:00",
        label: "travel invoice date",
      },
    );
  } catch {
    throw createHttpError(400, "Invalid travel invoice date");
  }
};

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
    {
      userId,
      code,
    },
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

const getTravelSalesAccount = (userId, session) =>
  ensureSystemAccount({
    userId,
    code: "TRAVEL_SALES",
    name: "travel sales",
    type: "Income",
    normalBalance: "credit",
    category: "service",
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

const getTravelDiscountAccount = (userId, session) =>
  ensureSystemAccount({
    userId,
    code: "TRAVEL_DISCOUNT",
    name: "travel discount",
    type: "Expense",
    normalBalance: "debit",
    category: "discount",
    session,
  });

const serviceTypeLabel = (itemType = "") =>
  String(itemType || "service")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getServiceSummary = (booking) => {
  const labels = (booking.bookingItems || [])
    .map(
      (item) =>
        item.title || item.description || serviceTypeLabel(item.itemType),
    )
    .filter(Boolean);

  const uniqueLabels = [...new Set(labels)];

  if (uniqueLabels.length === 0) {
    return "Travel Service";
  }

  if (uniqueLabels.length <= 2) {
    return uniqueLabels.join(" + ");
  }

  return `${uniqueLabels.slice(0, 2).join(" + ")} +${uniqueLabels.length - 2}`;
};

const normalizePaymentType = (value = "") => {
  const clean = String(value || "")
    .trim()
    .toLowerCase();

  return clean === "bank" ? "online" : clean;
};

const assertConfirmedInvoiceIsPostable = (booking) => {
  const grossSale = roundMoney(booking.sellingTotal);

  const discountAmount = roundMoney(booking.discountAmount);

  const netSale = roundMoney(booking.netSale ?? grossSale - discountAmount);

  const receivedAmount = roundMoney(booking.receivedAmount);

  const totalCost = roundMoney(booking.costTotal);

  const vendorPaidTotal = roundMoney(booking.vendorPaidTotal);

  if (netSale <= 0) {
    throw createHttpError(
      400,
      "Confirmed travel invoice must have a positive net sale",
    );
  }

  if (discountAmount > grossSale) {
    throw createHttpError(400, "Discount cannot exceed gross sale");
  }

  if (receivedAmount > netSale) {
    throw createHttpError(400, "Received amount cannot exceed net invoice");
  }

  if (vendorPaidTotal > totalCost) {
    throw createHttpError(
      400,
      "Vendor paid amount cannot exceed total travel cost",
    );
  }

  if (receivedAmount > 0) {
    if (!booking.accountId) {
      throw createHttpError(
        400,
        "Payment account is required when received amount is greater than zero",
      );
    }

    const paymentType = normalizePaymentType(booking.paymentType);

    if (!PAYMENT_TYPES.has(paymentType)) {
      throw createHttpError(400, "Invalid payment type");
    }
  }

  if (vendorPaidTotal > 0) {
    if (!booking.vendorPaymentAccountId) {
      throw createHttpError(
        400,
        "Vendor payment account is required when vendor paid amount is greater than zero",
      );
    }

    const vendorPaymentType = normalizePaymentType(booking.vendorPaymentType);

    if (!PAYMENT_TYPES.has(vendorPaymentType)) {
      throw createHttpError(400, "Invalid vendor payment type");
    }
  }
};

const getPaymentAccountById = async ({ accountId, userId, session, label }) => {
  if (!accountId) {
    return null;
  }

  const accountQuery = applyModuleScopeFilter(
    {
      _id: accountId,
      userId,
      isActive: {
        $ne: false,
      },
      type: "Asset",
      category: {
        $in: PAYMENT_ACCOUNT_CATEGORIES,
      },
    },
    MODULE_SCOPES.TRAVEL,
  );

  const query = Account.findOne(accountQuery)
    .select("_id name code category type")
    .lean();

  const account = await getSessionQuery(query, session);

  if (!account) {
    throw createHttpError(400, `${label} not found`);
  }

  return account;
};

const getTravelPaymentAccount = async ({ booking, userId, session }) => {
  if (!booking.accountId || roundMoney(booking.receivedAmount) <= 0) {
    return null;
  }

  return getPaymentAccountById({
    accountId: booking.accountId,
    userId,
    session,
    label: "Payment account",
  });
};

const getTravelVendorPaymentAccount = async ({ booking, userId, session }) => {
  if (
    !booking.vendorPaymentAccountId ||
    roundMoney(booking.vendorPaidTotal) <= 0
  ) {
    return null;
  }

  return getPaymentAccountById({
    accountId: booking.vendorPaymentAccountId,
    userId,
    session,
    label: "Vendor payment account",
  });
};

const pushVendorCostRow = ({
  rows,
  vendorId,
  vendorType = "vendor",
  vendorPartyId = null,
  costAmount,
  paidAmount,
  description,
}) => {
  const cost = roundMoney(costAmount);

  const paid = roundMoney(paidAmount);

  if (cost <= 0) {
    if (paid > 0) {
      throw createHttpError(
        400,
        `Vendor payment cannot exist without vendor cost: ${
          description || "Travel service"
        }`,
      );
    }

    return;
  }

  if (!vendorId && !vendorPartyId) {
    throw createHttpError(
      400,
      `Vendor is required for cost row: ${description || "Travel service"}`,
    );
  }

  if (paid > cost) {
    throw createHttpError(
      400,
      `Vendor paid amount cannot exceed cost for ${
        description || "Travel service"
      }`,
    );
  }

  rows.push({
    vendorType: vendorType === "party" ? "party" : "vendor",
    vendorId: vendorId ? String(vendorId) : null,
    vendorPartyId: vendorPartyId ? String(vendorPartyId) : null,
    amount: cost,
    paidAmount: paid,
    description,
  });
};

const collectVendorCostRows = (booking) => {
  const rows = [];

  (booking.bookingItems || []).forEach((item) => {
    const useComponents =
      item.itemType === "umrah_package" &&
      item.umrahDetails?.packageMode === "custom_component_package" &&
      Array.isArray(item.umrahDetails?.components) &&
      item.umrahDetails.components.length > 0;

    if (useComponents) {
      item.umrahDetails.components.forEach((component) => {
        pushVendorCostRow({
          rows,
          vendorId: component.vendorId,
          vendorType: component.vendorType,
          vendorPartyId: component.vendorPartyId,
          costAmount: component.estimatedCostBase,
          paidAmount: component.estimatedVendorPaidBase,
          description:
            component.label || serviceTypeLabel(component.componentType),
        });
      });

      return;
    }

    pushVendorCostRow({
      rows,
      vendorId: item.vendorId,
      vendorType: item.vendorType,
      vendorPartyId: item.vendorPartyId,
      costAmount: item.estimatedCostBase,
      paidAmount: item.estimatedVendorPaidBase,
      description: item.title || serviceTypeLabel(item.itemType),
    });
  });

  return rows;
};

const getVendorCostKey = (row = {}) =>
  row.vendorType === "party"
    ? `party:${row.vendorPartyId || ""}`
    : `vendor:${row.vendorId || ""}`;

const loadVendorAccounts = async ({ costRows, userId, session }) => {
  const vendorMap = new Map();

  await Promise.all(
    costRows.map(async (row) => {
      const key = getVendorCostKey(row);

      if (vendorMap.has(key)) {
        return;
      }

      const vendor = await resolveTravelVendorCounterparty({
        userId,
        source: row,
        session,
      });

      vendorMap.set(key, vendor);
    }),
  );

  return vendorMap;
};

const groupVendorCosts = async ({ booking, userId, session }) => {
  const costRows = collectVendorCostRows(booking);

  const vendorMap = await loadVendorAccounts({
    costRows,
    userId,
    session,
  });

  const grouped = new Map();

  costRows.forEach((row) => {
    const key = getVendorCostKey(row);
    const vendor = vendorMap.get(key);

    const current = grouped.get(key) || {
      vendor,
      vendorType: row.vendorType,
      amount: 0,
      paidAmount: 0,
      descriptions: [],
    };

    current.amount = roundMoney(current.amount + row.amount);

    current.paidAmount = roundMoney(current.paidAmount + row.paidAmount);

    current.descriptions.push(row.description);

    grouped.set(key, current);
  });

  return [...grouped.values()].filter((row) => roundMoney(row.amount) > 0);
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

const buildAccountingSnapshot = (source = {}) =>
  JSON.stringify({
    customerType: source.customerType || "customer",

    customerId: String(source.customerId || ""),

    customerPartyId: String(source.customerPartyId || ""),

    baseCurrency: source.baseCurrency || "",

    sellingTotal: roundMoney(source.sellingTotal),

    costTotal: roundMoney(source.costTotal),

    discountAmount: roundMoney(source.discountAmount),

    netSale: roundMoney(source.netSale),

    receivedAmount: roundMoney(source.receivedAmount),

    paymentType: source.paymentType || "",

    accountId: String(source.accountId || ""),

    vendorPaidTotal: roundMoney(source.vendorPaidTotal),

    vendorPaymentType: source.vendorPaymentType || "",

    vendorPaymentAccountId: String(source.vendorPaymentAccountId || ""),

    items: (source.bookingItems || []).map((item) => ({
      itemType: item.itemType || "",

      serviceId: String(item.serviceId || ""),

      vendorType: item.vendorType || "vendor",

      vendorId: String(item.vendorId || ""),

      vendorPartyId: String(item.vendorPartyId || ""),

      title: item.title || "",

      sellingPrice: roundMoney(item.sellingPrice),

      sellingCurrency: item.sellingCurrency || "",

      costPrice: roundMoney(item.costPrice),

      costCurrency: item.costCurrency || "",

      estimatedSellingBase: roundMoney(item.estimatedSellingBase),

      estimatedCostBase: roundMoney(item.estimatedCostBase),

      vendorPaidAmount: roundMoney(item.vendorPaidAmount),

      estimatedVendorPaidBase: roundMoney(item.estimatedVendorPaidBase),

      components: (item.umrahDetails?.components || []).map((component) => ({
        vendorType: component.vendorType || "vendor",

        vendorId: String(component.vendorId || ""),

        vendorPartyId: String(component.vendorPartyId || ""),

        serviceId: String(component.serviceId || ""),

        label: component.label || "",

        sellingPrice: roundMoney(component.sellingPrice),

        sellingCurrency: component.sellingCurrency || "",

        costPrice: roundMoney(component.costPrice),

        costCurrency: component.costCurrency || "",

        estimatedSellingBase: roundMoney(component.estimatedSellingBase),

        estimatedCostBase: roundMoney(component.estimatedCostBase),

        vendorPaidAmount: roundMoney(component.vendorPaidAmount),

        estimatedVendorPaidBase: roundMoney(component.estimatedVendorPaidBase),
      })),
    })),
  });

const assertAccountingEditsAllowed = (booking, payload) => {
  if (!booking?.accountingPosted) {
    return;
  }

  if (payload.status === "cancelled") {
    throw createHttpError(
      400,
      "Posted travel invoices cannot be cancelled. Use the Travel Refund flow for reversals.",
    );
  }

  if (buildAccountingSnapshot(booking) !== buildAccountingSnapshot(payload)) {
    throw createHttpError(
      400,
      "Confirmed travel invoice accounting is locked. Use adjustment/refund flow for financial changes.",
    );
  }
};

const postTravelInvoiceAccounting = async ({
  booking,
  userId,
  actorId = null,
  session = null,
}) => {
  if (
    !booking ||
    !POSTING_STATUSES.has(String(booking.status || "").toLowerCase())
  ) {
    return {
      posted: false,
      accountIds: [],
    };
  }

  if (booking.accountingPosted && booking.journalEntryId) {
    return {
      posted: false,
      accountIds: [],
    };
  }

  const existingSalesJournal = await getSessionQuery(
    JournalEntry.findOne({
      createdBy: userId,
      referenceId: booking._id,
      sourceType: "travel_booking",
      isDeleted: false,
    }).select("_id billNo lines"),
    session,
  );

  if (existingSalesJournal) {
    const invoiceNumber =
      existingSalesJournal.billNo ||
      booking.invoiceNumber ||
      booking.bookingNumber;

    booking.invoiceNumber = invoiceNumber;

    booking.bookingNumber = invoiceNumber;

    booking.invoiceNumberLockedAt = booking.invoiceNumberLockedAt || new Date();

    booking.accountingPosted = true;

    booking.accountingStatus = "posted";

    booking.journalEntryId = existingSalesJournal._id;

    booking.accountingPostedAt = booking.accountingPostedAt || new Date();

    booking.accountingPostedBy =
      booking.accountingPostedBy || actorId || booking.createdBy;

    await booking.save({
      session,
    });

    return {
      posted: false,
      accountIds: collectJournalAccountIds([existingSalesJournal]),
    };
  }

  assertConfirmedInvoiceIsPostable(booking);

  const invoiceDate = resolveInvoiceBusinessDate(booking);

  const locked = await TravelBooking.findOneAndUpdate(
    {
      _id: booking._id,
      userId,
      accountingPosted: {
        $ne: true,
      },
      accountingStatus: {
        $ne: "posting",
      },
    },
    {
      $set: {
        accountingStatus: "posting",
      },
    },
    {
      new: true,
      session,
    },
  );

  if (!locked) {
    return {
      posted: false,
      accountIds: [],
    };
  }

  const invoiceNumber = await resolveTravelInvoiceNumber({
    booking,
    userId,
    date: invoiceDate,
    session,
  });

  const [
    customerCounterparty,
    paymentAccount,
    vendorPaymentAccount,
    salesAccount,
    costAccount,
    discountAccount,
  ] = await Promise.all([
    resolveTravelCustomerCounterparty({
      userId,
      source: booking,
      session,
    }),

    getTravelPaymentAccount({
      booking,
      userId,
      session,
    }),

    getTravelVendorPaymentAccount({
      booking,
      userId,
      session,
    }),

    getTravelSalesAccount(userId, session),

    getTravelCostAccount(userId, session),

    roundMoney(booking.discountAmount) > 0
      ? getTravelDiscountAccount(userId, session)
      : Promise.resolve(null),
  ]);

  const serviceSummary = getServiceSummary(booking);

  const grossSale = roundMoney(booking.sellingTotal);

  const discountAmount = roundMoney(booking.discountAmount);

  const netSale = roundMoney(booking.netSale ?? grossSale - discountAmount);

  const receivedAmount = roundMoney(booking.receivedAmount);

  const vendorPaidTotal = roundMoney(booking.vendorPaidTotal);

  const invoiceTime = extractBusinessTime(invoiceDate) || "00:00";

  const journals = [];
  const customerJournalIdentity = getCustomerJournalIdentity(
    customerCounterparty,
  );

  const saleLines = [
    {
      account: new mongoose.Types.ObjectId(customerCounterparty.accountId),
      type: "debit",
      amount: netSale,
    },
  ];

  if (discountAmount > 0 && discountAccount) {
    saleLines.push({
      account: new mongoose.Types.ObjectId(discountAccount._id),
      type: "debit",
      amount: discountAmount,
    });
  }

  saleLines.push({
    account: new mongoose.Types.ObjectId(salesAccount._id),
    type: "credit",
    amount: grossSale,
  });

  const salesJournal = new JournalEntry({
    date: invoiceDate,
    time: invoiceTime,
    description: `Travel Invoice ${invoiceNumber} - ${serviceSummary}`,
    sourceType: "travel_booking",
    originModule: TRAVEL_INVOICE_ORIGIN,
    referenceId: booking._id,
    invoiceId: booking._id,
    invoiceModel: "TravelBooking",
    billNo: invoiceNumber,
    createdBy: userId,
    ...customerJournalIdentity,
    attachmentUrl: booking.attachmentUrl || "",
    attachmentType: booking.attachmentType || "",
    lines: saleLines,
  });

  await salesJournal.save({
    session,
  });

  journals.push(salesJournal);

  const vendorCosts = await groupVendorCosts({
    booking,
    userId,
    session,
  });

  if (vendorCosts.length > 0) {
    const totalCost = roundMoney(
      vendorCosts.reduce(
        (sum, vendorCost) => sum + roundMoney(vendorCost.amount),
        0,
      ),
    );

    const groupedPaidTotal = roundMoney(
      vendorCosts.reduce(
        (sum, vendorCost) => sum + roundMoney(vendorCost.paidAmount),
        0,
      ),
    );

    if (Math.abs(groupedPaidTotal - vendorPaidTotal) > 0.01) {
      throw createHttpError(
        400,
        "Vendor payment total does not match invoice vendor payment rows",
      );
    }

    const vendorCostLines = [
      {
        account: new mongoose.Types.ObjectId(costAccount._id),
        type: "debit",
        amount: totalCost,
      },

      ...vendorCosts.map((vendorCost) => ({
        account: new mongoose.Types.ObjectId(vendorCost.vendor.accountId),
        type: "credit",
        amount: roundMoney(vendorCost.amount),
      })),
    ];

    const vendorJournal = new JournalEntry({
      date: invoiceDate,
      time: invoiceTime,
      description: `Travel Vendor Cost ${invoiceNumber} - ${serviceSummary}`,
      sourceType: "travel_vendor_cost",
      originModule: TRAVEL_INVOICE_ORIGIN,
      referenceId: booking._id,
      invoiceId: booking._id,
      invoiceModel: "TravelBooking",
      billNo: invoiceNumber,
      createdBy: userId,
      ...(vendorCosts.length === 1
        ? getVendorJournalIdentity(vendorCosts[0].vendor)
        : {}),
      attachmentUrl: booking.attachmentUrl || "",
      attachmentType: booking.attachmentType || "",
      lines: vendorCostLines,
    });

    await vendorJournal.save({
      session,
    });

    journals.push(vendorJournal);

    booking.vendorCostJournalEntryIds = [vendorJournal._id];

    const vendorPaymentJournals = [];

    if (vendorPaidTotal > 0) {
      if (!vendorPaymentAccount) {
        throw createHttpError(400, "Vendor payment account not found");
      }

      for (const vendorCost of vendorCosts) {
        const paidAmount = roundMoney(vendorCost.paidAmount);

        if (paidAmount <= 0) {
          continue;
        }

        if (paidAmount > roundMoney(vendorCost.amount)) {
          throw createHttpError(
            400,
            `Vendor paid amount cannot exceed cost for ${
              vendorCost.vendor?.name || "vendor"
            }`,
          );
        }

        const paymentJournal = await createPaymentEntry({
          userId,

          referenceId: booking._id,

          sourceType: "pay_bill",

          originModule: TRAVEL_INVOICE_ORIGIN,

          billNo: invoiceNumber,

          accountId: vendorPaymentAccount._id,

          counterPartyAccountId: vendorCost.vendor.accountId,

          amount: paidAmount,

          paymentType: normalizePaymentType(booking.vendorPaymentType),

          description: `Travel Vendor Payment ${invoiceNumber} - ${
            vendorCost.vendor?.name ||
            vendorCost.descriptions?.join(" + ") ||
            "Vendor"
          }`,

          ...getVendorJournalIdentity(vendorCost.vendor),

          entryDate: invoiceDate,

          entryTime: invoiceTime,

          session,
        });

        vendorPaymentJournals.push(paymentJournal);

        journals.push(paymentJournal);
      }
    }

    booking.vendorPaymentJournalEntryIds = vendorPaymentJournals.map(
      (journal) => journal._id,
    );
  } else {
    if (vendorPaidTotal > 0) {
      throw createHttpError(
        400,
        "Vendor payment cannot be posted because no vendor cost exists",
      );
    }

    booking.vendorCostJournalEntryIds = [];

    booking.vendorPaymentJournalEntryIds = [];
  }

  if (receivedAmount > 0 && paymentAccount) {
    const paymentJournal = await createPaymentEntry({
      userId,

      referenceId: booking._id,

      sourceType: "receive_payment",

      originModule: TRAVEL_INVOICE_ORIGIN,

      billNo: invoiceNumber,

      accountId: paymentAccount._id,

      counterPartyAccountId: customerCounterparty.accountId,

      amount: receivedAmount,

      paymentType: normalizePaymentType(booking.paymentType),

      description: `Travel Invoice Payment ${invoiceNumber}`,

      ...customerJournalIdentity,

      entryDate: invoiceDate,

      entryTime: invoiceTime,

      session,
    });

    journals.push(paymentJournal);

    booking.paymentJournalEntryId = paymentJournal._id;
  } else {
    booking.paymentJournalEntryId = null;
  }

  booking.invoiceNumber = invoiceNumber;

  booking.bookingNumber = invoiceNumber;

  booking.invoiceNumberLockedAt = booking.invoiceNumberLockedAt || new Date();

  booking.invoiceDate = invoiceDate;

  booking.netSale = netSale;

  booking.customerDue = roundMoney(Math.max(netSale - receivedAmount, 0));

  booking.vendorPaidTotal = vendorPaidTotal;

  booking.vendorPayable = roundMoney(
    Math.max(roundMoney(booking.costTotal) - vendorPaidTotal, 0),
  );

  booking.grossProfit = roundMoney(netSale - roundMoney(booking.costTotal));

  booking.estimatedProfit = booking.grossProfit;

  booking.accountingPosted = true;

  booking.accountingStatus = "posted";

  booking.accountingPostedAt = new Date();

  booking.accountingPostedBy = actorId || booking.createdBy;

  booking.journalEntryId = salesJournal._id;

  await booking.save({
    session,
  });

  return {
    posted: true,
    accountIds: collectJournalAccountIds(journals),
  };
};

const recalculateTravelAccountingAccounts = async (accountIds = []) => {
  try {
    await recalculateAccountBalances(accountIds);
  } catch (error) {
    console.error(
      "Travel accounting balance recalculation failed:",
      error.message,
    );
  }
};

module.exports = {
  POSTING_STATUSES,
  TRAVEL_INVOICE_ORIGIN,

  assertAccountingEditsAllowed,

  getServiceSummary,

  postTravelInvoiceAccounting,

  recalculateTravelAccountingAccounts,
};
