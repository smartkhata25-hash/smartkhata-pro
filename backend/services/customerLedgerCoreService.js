const mongoose = require("mongoose");

const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const JournalEntry = require("../models/JournalEntry");
const RefundInvoice = require("../models/RefundInvoice");
const { MODULE_SCOPES, normalizeModuleScope } = require("../utils/moduleScope");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
} = require("../utils/employeePayrollOrigins");
const {
  buildBusinessDateRange,
  startOfBusinessDay,
} = require("../utils/businessDate");

const TRAVEL_JOURNAL_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
  ...TRAVEL_EMPLOYEE_ORIGIN_VALUES,
  ...TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
]);

const TRAVEL_JOURNAL_SOURCE_TYPES = Object.freeze([
  "travel_booking",
  "travel_customer_advance",
  "travel_vendor_cost",
  "travel_vendor_advance",
  "travel_vendor_return",
  "travel_commission",
  "travel_refund",
  "travel_adjustment",
]);

const SALE_INVOICE_SOURCE_TYPES = Object.freeze([
  "sale_invoice",
  "opening_sale_invoice",
]);

const REFUND_INVOICE_SOURCE_TYPES = Object.freeze([
  "refund_invoice",
  "opening_refund_invoice",
]);

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

const asObjectId = (value) => {
  const id = value ? String(value._id || value) : "";
  return mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(id)
    : null;
};

const getTravelJournalConditions = () => [
  {
    originModule: {
      $in: TRAVEL_JOURNAL_ORIGINS,
    },
  },
  {
    sourceType: {
      $in: TRAVEL_JOURNAL_SOURCE_TYPES,
    },
  },
  {
    sourceType: "reversal",
    originModule: {
      $in: TRAVEL_JOURNAL_ORIGINS,
    },
  },
];

const getCustomerJournalScopeFilter = (moduleScope) => {
  const scope = normalizeModuleScope(moduleScope, MODULE_SCOPES.TRADING);

  if (scope === MODULE_SCOPES.TRAVEL) {
    return {
      $or: getTravelJournalConditions(),
    };
  }

  return {
    $nor: getTravelJournalConditions(),
  };
};

const resolveCustomerSourceLabel = (entry) => {
  if (
    entry.originModule === "travel_receive_payment" &&
    entry.sourceType === "receive_payment"
  ) {
    return "Travel Payment";
  }

  if (
    entry.originModule === "travel_invoice" &&
    entry.sourceType === "receive_payment"
  ) {
    return "Travel Invoice Payment";
  }

  if (
    entry.originModule === "travel_refund" &&
    entry.sourceType === "refund_payment"
  ) {
    return "Travel Refund Payment";
  }

  if (entry.sourceType === "travel_booking") {
    return "Travel Invoice";
  }

  if (entry.sourceType === "travel_refund") {
    return "Travel Refund";
  }

  return entry.sourceType === "sale_invoice"
    ? entry.description?.includes("Discount")
      ? "Discount"
      : entry.description?.includes("Payment")
        ? "Payment"
        : "Sale Invoice"
    : entry.sourceType === "opening_sale_invoice"
      ? "Opening Balance"
      : entry.sourceType === "receive_payment"
        ? "Receive Payment"
        : entry.sourceType === "receive_payment_discount"
          ? "Receive Payment Discount"
          : entry.sourceType === "refund_invoice"
            ? "Refund Invoice"
            : entry.sourceType === "opening_refund_invoice"
              ? "Opening Balance"
              : entry.sourceType === "purchase_invoice"
                ? "Purchase Invoice"
                : entry.sourceType === "opening_purchase_invoice"
                  ? "Opening Balance"
                  : entry.sourceType === "purchase_return"
                    ? "Purchase Return"
                    : entry.sourceType === "opening_purchase_return"
                      ? "Opening Balance"
                      : entry.sourceType === "pay_bill"
                        ? "Pay Bill"
                        : "-";
};

const findCustomerByAccount = (accountObjectId, userObjectId) =>
  Customer.findOne({
    account: accountObjectId,
    createdBy: userObjectId,
  })
    .populate("account")
    .lean();

const resolveCustomerAndAccount = async ({
  customerId,
  accountId,
  userObjectId,
  allowAccountIdFallback = false,
}) => {
  let customer = null;

  if (customerId) {
    const customerObjectId = asObjectId(customerId);

    if (!customerObjectId) {
      throw makeHttpError("Invalid customer ID", 400);
    }

    customer = await Customer.findOne({
      _id: customerObjectId,
      createdBy: userObjectId,
    })
      .populate("account")
      .lean();

    if (!customer && allowAccountIdFallback) {
      customer = await findCustomerByAccount(customerObjectId, userObjectId);
    }
  } else if (accountId) {
    const accountObjectId = asObjectId(accountId);

    if (!accountObjectId) {
      throw makeHttpError("Invalid account ID", 400);
    }

    customer = await findCustomerByAccount(accountObjectId, userObjectId);
  }

  if (!customer) {
    throw makeHttpError("Customer not found", 404);
  }

  const accountObjectId = asObjectId(customer.account?._id || customer.account);

  if (!accountObjectId) {
    throw makeHttpError("No account linked with customer", 400);
  }

  return {
    customer,
    accountObjectId,
  };
};

const sumAccountLines = (entries, accountObjectId) => {
  const accountId = accountObjectId.toString();
  const ledger = [];
  let totalDebit = 0;
  let totalCredit = 0;

  for (const entry of entries) {
    for (const line of entry.lines || []) {
      if (line.account?.toString() !== accountId) continue;

      const amount = safeNumber(line.amount);
      const debit = line.type === "debit" ? amount : 0;
      const credit = line.type === "credit" ? amount : 0;

      totalDebit += debit;
      totalCredit += credit;

      ledger.push({
        _id: entry._id,
        date: entry.date,
        time: entry.time || "",
        billNo: entry.billNo || "",
        description: entry.description || "",
        sourceType: entry.sourceType || "",
        originModule: entry.originModule || "",
        sourceLabel: resolveCustomerSourceLabel(entry),
        debit,
        credit,
        paymentType: line.paymentType || entry.paymentType || "-",
        attachmentUrl: entry.attachmentUrl || "",
        attachmentType: entry.attachmentType || "",
        invoiceId: entry.invoiceId || null,
        referenceId: entry.referenceId || null,
      });
    }
  }

  return {
    ledger,
    totalDebit,
    totalCredit,
  };
};

const calculateOpeningBalance = async ({
  accountObjectId,
  moduleScope,
  startDate,
  userObjectId,
}) => {
  if (!startDate) return 0;

  const openingStart = startOfBusinessDay(startDate);

  const result = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: userObjectId,
        isDeleted: false,
        sourceType: {
          $ne: "reversal",
        },
        "lines.account": accountObjectId,
        ...getCustomerJournalScopeFilter(moduleScope),
        date: {
          $lt: openingStart,
        },
      },
    },
    {
      $unwind: "$lines",
    },
    {
      $match: {
        "lines.account": accountObjectId,
      },
    },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [
              {
                $eq: ["$lines.type", "debit"],
              },
              "$lines.amount",
              {
                $multiply: ["$lines.amount", -1],
              },
            ],
          },
        },
      },
    },
  ]);

  return safeNumber(result[0]?.balance);
};

const getCustomerLedgerCore = async ({
  customerId,
  accountId,
  userId,
  startDate,
  endDate,
  moduleScope = "",
  allowAccountIdFallback = false,
}) => {
  const userObjectId = asObjectId(userId);

  if (!userObjectId) {
    throw makeHttpError("Invalid user ID", 401);
  }

  const { customer, accountObjectId } = await resolveCustomerAndAccount({
    customerId,
    accountId,
    userObjectId,
    allowAccountIdFallback,
  });

  const matchFilter = {
    createdBy: userObjectId,
    isDeleted: false,
    sourceType: {
      $ne: "reversal",
    },
    "lines.account": accountObjectId,
    ...getCustomerJournalScopeFilter(moduleScope),
  };

  const ledgerDateRange = buildBusinessDateRange({
    startDate,
    endDate,
  }).date;

  if (ledgerDateRange) {
    matchFilter.date = ledgerDateRange;
  }

  const [openingBalance, entries] = await Promise.all([
    calculateOpeningBalance({
      accountObjectId,
      moduleScope,
      startDate,
      userObjectId,
    }),
    JournalEntry.find(matchFilter)
      .select(
        [
          "date",
          "time",
          "billNo",
          "description",
          "sourceType",
          "originModule",
          "lines",
          "paymentType",
          "attachmentUrl",
          "attachmentType",
          "invoiceId",
          "referenceId",
        ].join(" "),
      )
      .sort({
        date: 1,
        time: 1,
        _id: 1,
      })
      .lean(),
  ]);

  const { ledger, totalDebit, totalCredit } = sumAccountLines(
    entries,
    accountObjectId,
  );

  let runningBalance = safeNumber(openingBalance);

  for (const row of ledger) {
    runningBalance += safeNumber(row.debit) - safeNumber(row.credit);
    row.balance = runningBalance;
    row.runningBalance = Number(runningBalance.toFixed(2));
  }

  return {
    customer,
    customerId: customer._id,
    customerName: customer.name || "-",
    isActive: customer.isActive,
    hiddenReason: customer.hiddenReason || null,
    accountId: accountObjectId.toString(),
    accountObjectId,
    userObjectId,
    moduleScope: normalizeModuleScope(moduleScope, MODULE_SCOPES.TRADING),
    openingBalance: safeNumber(openingBalance),
    totalDebit: safeNumber(totalDebit),
    totalCredit: safeNumber(totalCredit),
    closingBalance: safeNumber(runningBalance),
    ledger,
  };
};

const getLedgerDocumentId = (row = {}) => {
  const value = row.invoiceId || row.referenceId;
  const id = value ? String(value) : "";
  return mongoose.Types.ObjectId.isValid(id) ? id : "";
};

const enrichCustomerLedgerRows = async ({ ledger = [], userId }) => {
  const userObjectId = asObjectId(userId);

  if (!userObjectId || !Array.isArray(ledger) || ledger.length === 0) {
    return Array.isArray(ledger) ? ledger : [];
  }

  const saleInvoiceIds = new Set();
  const refundInvoiceIds = new Set();

  for (const row of ledger) {
    const documentId = getLedgerDocumentId(row);
    if (!documentId) continue;

    if (SALE_INVOICE_SOURCE_TYPES.includes(row.sourceType)) {
      saleInvoiceIds.add(documentId);
    }

    if (REFUND_INVOICE_SOURCE_TYPES.includes(row.sourceType)) {
      refundInvoiceIds.add(documentId);
    }
  }

  const [invoices, refunds] = await Promise.all([
    saleInvoiceIds.size
      ? Invoice.find({
          _id: {
            $in: [...saleInvoiceIds].map((id) => new mongoose.Types.ObjectId(id)),
          },
          createdBy: userObjectId,
          isDeleted: { $ne: true },
        })
          .select("items totalAmount")
          .populate("items.productId", "name")
          .lean()
      : [],
    refundInvoiceIds.size
      ? RefundInvoice.find({
          _id: {
            $in: [...refundInvoiceIds].map(
              (id) => new mongoose.Types.ObjectId(id),
            ),
          },
          createdBy: userObjectId,
          isDeleted: { $ne: true },
        })
          .select("items totalAmount")
          .populate("items.productId", "name")
          .lean()
      : [],
  ]);

  const invoiceMap = new Map(
    invoices.map((invoice) => [invoice._id.toString(), invoice]),
  );
  const refundMap = new Map(
    refunds.map((refund) => [refund._id.toString(), refund]),
  );

  return ledger.map((row) => {
    const documentId = getLedgerDocumentId(row);
    const source = SALE_INVOICE_SOURCE_TYPES.includes(row.sourceType)
      ? invoiceMap.get(documentId)
      : REFUND_INVOICE_SOURCE_TYPES.includes(row.sourceType)
        ? refundMap.get(documentId)
        : null;

    if (!source) {
      return {
        ...row,
        items: [],
      };
    }

    return {
      ...row,
      invoiceTotal: safeNumber(source.totalAmount),
      items: Array.isArray(source.items)
        ? source.items.map((item) => ({
            productName: item.productId?.name || "Product",
            quantity: safeNumber(item.quantity),
            rate: safeNumber(item.price),
            total: safeNumber(item.total),
          }))
        : [],
    };
  });
};

module.exports = {
  enrichCustomerLedgerRows,
  getCustomerJournalScopeFilter,
  getCustomerLedgerCore,
  resolveCustomerSourceLabel,
};
