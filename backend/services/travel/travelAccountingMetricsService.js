const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Customer = require("../../models/Customer");
const JournalEntry = require("../../models/JournalEntry");
const Party = require("../../models/Party");
const Supplier = require("../../models/Supplier");

const {
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  MODULE_SCOPES,
} = require("../../utils/moduleScope");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
  TRAVEL_BUSINESS_VALUE_ORIGINS,
} = require("../../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGINS,
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
} = require("../../utils/employeePayrollOrigins");
const {
  TRAVEL_PARTY_OPENING_ORIGIN,
  buildTravelPartyRoleQuery,
} = require("./travelCounterpartyService");
const {
  getEmployeeFinancialSummary,
} = require("../employee/employeeAccountingService");

const TRAVEL_INVOICE_ORIGIN = "travel_invoice";
const TRAVEL_REFUND_ORIGIN = "travel_refund";
const TRAVEL_RECEIVE_PAYMENT_ORIGIN = "travel_receive_payment";
const TRAVEL_VENDOR_PAYMENT_ORIGIN = "travel_vendor_payment";
const TRAVEL_VENDOR_RETURN_ORIGIN = "travel_vendor_return";
const TRAVEL_EXPENSE_ORIGIN = "travel_expense";
const TRAVEL_CUSTOMER_OPENING_ORIGIN = "travel_customer_opening_balance";
const TRAVEL_VENDOR_OPENING_ORIGIN = "travel_vendor_opening_balance";
const TRAVEL_EXPENSE_ORIGINS = Object.freeze([
  TRAVEL_EXPENSE_ORIGIN,
  TRAVEL_EMPLOYEE_ORIGINS.SALARY,
]);
const TRAVEL_EMPLOYEE_CASH_OUT_ORIGINS = Object.freeze([
  TRAVEL_EMPLOYEE_ORIGINS.SALARY_PAYMENT,
  TRAVEL_EMPLOYEE_ORIGINS.ADVANCE,
  TRAVEL_EMPLOYEE_ORIGINS.LOAN,
]);
const TRAVEL_EMPLOYEE_CASH_IN_ORIGINS = Object.freeze([
  TRAVEL_EMPLOYEE_ORIGINS.ADVANCE_RECOVERY,
  TRAVEL_EMPLOYEE_ORIGINS.LOAN_RECOVERY,
]);

const TRAVEL_PARTY_BALANCE_ORIGINS = Object.freeze([
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_REFUND_ORIGIN,
  TRAVEL_RECEIVE_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_RETURN_ORIGIN,
  TRAVEL_PARTY_OPENING_ORIGIN,
]);

const CASH_ACCOUNT_CATEGORIES = Object.freeze(["cash"]);

const BANK_ACCOUNT_CATEGORIES = Object.freeze([
  "bank",
  "online",
  "wallet",
  "cheque",
]);

const PAYMENT_ACCOUNT_CATEGORIES = Object.freeze([
  ...CASH_ACCOUNT_CATEGORIES,
  ...BANK_ACCOUNT_CATEGORIES,
  "cheque",
]);

const TRAVEL_PROFIT_ACCOUNT_CODES = Object.freeze([
  "TRAVEL_SALES",
  "TRAVEL_DISCOUNT",
  "TRAVEL_REFUND",
  "TRAVEL_PENALTY_INCOME",
  "TRAVEL_COST",
]);

const TRAVEL_VENDOR_PAYMENT_ORIGINS = Object.freeze([
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
]);

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const roundMoney = (value = 0) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTravelCustomerJournalFilter = () => ({
  $or: [
    {
      sourceType: "travel_booking",
    },
    {
      sourceType: "travel_refund",
    },
    {
      sourceType: "travel_adjustment",
      originModule: TRAVEL_CUSTOMER_OPENING_ORIGIN,
    },
    {
      sourceType: "receive_payment",
      originModule: {
        $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
      },
    },
    {
      sourceType: "refund_payment",
      originModule: TRAVEL_REFUND_ORIGIN,
    },
    {
      sourceType: "reversal",
      originModule: {
        $in: [
          TRAVEL_INVOICE_ORIGIN,
          TRAVEL_REFUND_ORIGIN,
          TRAVEL_RECEIVE_PAYMENT_ORIGIN,
        ],
      },
    },
  ],
});

const getTravelVendorJournalFilter = () => ({
  $or: [
    {
      sourceType: "travel_vendor_cost",
    },
    {
      sourceType: "travel_refund",
    },
    {
      sourceType: "travel_vendor_return",
    },
    {
      sourceType: "travel_adjustment",
      originModule: TRAVEL_VENDOR_OPENING_ORIGIN,
    },
    {
      sourceType: "pay_bill",
      originModule: {
        $in: TRAVEL_VENDOR_PAYMENT_ORIGINS,
      },
    },
    {
      sourceType: "purchase_return_payment",
      originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
    },
    {
      sourceType: "reversal",
      originModule: {
        $in: [
          TRAVEL_INVOICE_ORIGIN,
          TRAVEL_REFUND_ORIGIN,
          TRAVEL_VENDOR_PAYMENT_ORIGIN,
          TRAVEL_VENDOR_RETURN_ORIGIN,
        ],
      },
    },
  ],
});

const getTravelPartyJournalFilter = () => ({
  originModule: {
    $in: TRAVEL_PARTY_BALANCE_ORIGINS,
  },
});

const getTravelProfitJournalFilter = () => ({
  sourceType: {
    $in: [
      "travel_booking",
      "travel_vendor_cost",
      "travel_refund",
      "travel_vendor_return",
    ],
  },
});

const aggregateAccountLines = async ({
  userId,
  accountIds = [],
  journalFilter = {},
  session = null,
}) => {
  const ids = accountIds
    .filter(Boolean)
    .map((accountId) => toObjectId(accountId));

  if (ids.length === 0) {
    return [];
  }

  const pipeline = [
    {
      $match: {
        createdBy: toObjectId(userId),
        isDeleted: false,
        isReversed: {
          $ne: true,
        },
        sourceType: {
          $ne: "reversal",
        },
        "lines.account": {
          $in: ids,
        },
        ...journalFilter,
      },
    },
    {
      $unwind: "$lines",
    },
    {
      $match: {
        "lines.account": {
          $in: ids,
        },
      },
    },
    {
      $group: {
        _id: "$lines.account",
        debit: {
          $sum: {
            $cond: [
              {
                $eq: ["$lines.type", "debit"],
              },
              "$lines.amount",
              0,
            ],
          },
        },
        credit: {
          $sum: {
            $cond: [
              {
                $eq: ["$lines.type", "credit"],
              },
              "$lines.amount",
              0,
            ],
          },
        },
      },
    },
  ];

  const aggregate = JournalEntry.aggregate(pipeline);

  return session ? aggregate.session(session) : aggregate;
};

const getTravelCustomerBalanceMap = async (
  userId,
  customers = [],
  options = {},
) => {
  const accountIds = customers
    .map((customer) => customer.account?._id || customer.account)
    .filter(Boolean);

  const rows = await aggregateAccountLines({
    userId,
    accountIds,
    journalFilter: getTravelCustomerJournalFilter(),
    session: options.session || null,
  });

  return new Map(
    rows.map((row) => [
      String(row._id),
      roundMoney(Number(row.debit || 0) - Number(row.credit || 0)),
    ]),
  );
};

const getTravelVendorBalanceMap = async (
  userId,
  vendors = [],
  options = {},
) => {
  const accountIds = vendors
    .map((vendor) => vendor.account?._id || vendor.account)
    .filter(Boolean);

  const rows = await aggregateAccountLines({
    userId,
    accountIds,
    journalFilter: getTravelVendorJournalFilter(),
    session: options.session || null,
  });

  return new Map(
    rows.map((row) => [
      String(row._id),
      roundMoney(Number(row.credit || 0) - Number(row.debit || 0)),
    ]),
  );
};

const getTravelPartyBalanceMap = async (
  userId,
  parties = [],
  options = {},
) => {
  const accountIds = parties
    .map((party) => party.account?._id || party.account)
    .filter(Boolean);

  const rows = await aggregateAccountLines({
    userId,
    accountIds,
    journalFilter: getTravelPartyJournalFilter(),
    session: options.session || null,
  });

  return new Map(
    rows.map((row) => [
      String(row._id),
      roundMoney(Number(row.debit || 0) - Number(row.credit || 0)),
    ]),
  );
};

const getTravelCustomerBalanceTotals = async (userId) => {
  const [customers, parties] = await Promise.all([
    Customer.find(
      applyModuleScopeFilter(
        {
          createdBy: toObjectId(userId),
          isActive: {
            $ne: false,
          },
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id name phone account")
      .lean(),
    Party.find(buildTravelPartyRoleQuery(toObjectId(userId), "customer"))
      .select("_id name phone role account")
      .lean(),
  ]);

  const [balanceMap, partyBalanceMap] = await Promise.all([
    getTravelCustomerBalanceMap(userId, customers),
    getTravelPartyBalanceMap(userId, parties),
  ]);

  let customerDue = 0;
  let customerCredit = 0;

  const receivableDetails = [];
  const customerCreditDetails = [];

  customers.forEach((customer) => {
    const accountId = String(customer.account || "");

    const balance = roundMoney(balanceMap.get(accountId) || 0);

    if (balance > 0) {
      customerDue += balance;

      receivableDetails.push({
        entityId: customer._id,
        accountId: customer.account,
        entityType: "customer",
        name: customer.name || "-",
        phone: customer.phone || "",
        amount: balance,
      });
    } else if (balance < 0) {
      const credit = Math.abs(balance);

      customerCredit += credit;

      customerCreditDetails.push({
        entityId: customer._id,
        accountId: customer.account,
        entityType: "customer",
        name: customer.name || "-",
        phone: customer.phone || "",
        amount: credit,
      });
    }
  });

  parties.forEach((party) => {
    const accountId = String(party.account || "");

    const balance = roundMoney(partyBalanceMap.get(accountId) || 0);

    if (balance > 0) {
      customerDue += balance;

      receivableDetails.push({
        entityId: party._id,
        accountId: party.account,
        entityType: "party",
        role: party.role || "both",
        name: party.name || "-",
        phone: party.phone || "",
        amount: balance,
      });
    }
  });

  receivableDetails.sort(
    (left, right) => Number(right.amount || 0) - Number(left.amount || 0),
  );

  customerCreditDetails.sort(
    (left, right) => Number(right.amount || 0) - Number(left.amount || 0),
  );

  return {
    customerDue: roundMoney(customerDue),

    customerCredit: roundMoney(customerCredit),

    totalReceivable: roundMoney(customerDue),

    receivableDetails,
    customerCreditDetails,
  };
};

const getTravelVendorBalanceTotals = async (userId) => {
  const [vendors, parties] = await Promise.all([
    Supplier.find(
      applySupplierModuleScopeFilter(
        {
          userId: toObjectId(userId),
          isDeleted: false,
        },
        MODULE_SCOPES.TRAVEL,
      ),
    )
      .select("_id name phone account")
      .lean(),
    Party.find(buildTravelPartyRoleQuery(toObjectId(userId), "supplier"))
      .select("_id name phone role account")
      .lean(),
  ]);

  const [balanceMap, partyBalanceMap] = await Promise.all([
    getTravelVendorBalanceMap(userId, vendors),
    getTravelPartyBalanceMap(userId, parties),
  ]);

  let vendorPayable = 0;
  let vendorCredit = 0;

  const payableDetails = [];
  const vendorCreditDetails = [];

  vendors.forEach((vendor) => {
    const accountId = String(vendor.account || "");

    const balance = roundMoney(balanceMap.get(accountId) || 0);

    if (balance > 0) {
      vendorPayable += balance;

      payableDetails.push({
        entityId: vendor._id,
        accountId: vendor.account,
        entityType: "supplier",
        name: vendor.name || "-",
        phone: vendor.phone || "",
        amount: balance,
      });
    } else if (balance < 0) {
      const credit = Math.abs(balance);

      vendorCredit += credit;

      vendorCreditDetails.push({
        entityId: vendor._id,
        accountId: vendor.account,
        entityType: "supplier",
        name: vendor.name || "-",
        phone: vendor.phone || "",
        amount: credit,
      });
    }
  });

  parties.forEach((party) => {
    const accountId = String(party.account || "");

    const balance = roundMoney(partyBalanceMap.get(accountId) || 0);

    if (balance < 0) {
      const payable = Math.abs(balance);

      vendorPayable += payable;

      payableDetails.push({
        entityId: party._id,
        accountId: party.account,
        entityType: "party",
        role: party.role || "both",
        name: party.name || "-",
        phone: party.phone || "",
        amount: payable,
      });
    }
  });

  payableDetails.sort(
    (left, right) => Number(right.amount || 0) - Number(left.amount || 0),
  );

  vendorCreditDetails.sort(
    (left, right) => Number(right.amount || 0) - Number(left.amount || 0),
  );

  return {
    vendorPayable: roundMoney(vendorPayable),

    vendorCredit: roundMoney(vendorCredit),

    totalPayable: roundMoney(vendorPayable),

    payableDetails,
    vendorCreditDetails,
  };
};

const getTravelProfitTotals = async (userId) => {
  const accounts = await Account.find(
    applyModuleScopeFilter(
      {
        userId: toObjectId(userId),
        code: {
          $in: TRAVEL_PROFIT_ACCOUNT_CODES,
        },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id code")
    .lean();

  const accountIds = accounts.map((account) => account._id);

  const accountCodeById = new Map(
    accounts.map((account) => [String(account._id), account.code]),
  );

  const rows = await aggregateAccountLines({
    userId,
    accountIds,
    journalFilter: getTravelProfitJournalFilter(),
  });

  const totalsByCode = new Map();

  rows.forEach((row) => {
    const code = accountCodeById.get(String(row._id));

    if (!code) {
      return;
    }

    totalsByCode.set(code, {
      debit: Number(row.debit || 0),
      credit: Number(row.credit || 0),
    });
  });

  const creditBalance = (code) => {
    const row = totalsByCode.get(code) || {};

    return roundMoney(Number(row.credit || 0) - Number(row.debit || 0));
  };

  const debitBalance = (code) => {
    const row = totalsByCode.get(code) || {};

    return roundMoney(Number(row.debit || 0) - Number(row.credit || 0));
  };

  const sales = creditBalance("TRAVEL_SALES");

  const penalties = creditBalance("TRAVEL_PENALTY_INCOME");

  const discounts = debitBalance("TRAVEL_DISCOUNT");

  const refunds = debitBalance("TRAVEL_REFUND");

  const netTravelCost = debitBalance("TRAVEL_COST");

  const netTravelRevenue = roundMoney(sales + penalties - discounts - refunds);

  return {
    sales,
    penalties,
    discounts,
    refunds,

    netTravelRevenue,

    totalSales: netTravelRevenue,

    netTravelCost,

    grossProfit: roundMoney(netTravelRevenue - netTravelCost),
  };
};

const getTravelExpenseTotals = async (userId) => {
  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: toObjectId(userId),

        isDeleted: false,

        isReversed: {
          $ne: true,
        },

        sourceType: "expense",

        originModule: {
          $in: TRAVEL_EXPENSE_ORIGINS,
        },
      },
    },

    {
      $unwind: "$lines",
    },

    {
      $match: {
        "lines.type": "debit",
      },
    },

    {
      $lookup: {
        from: "accounts",
        localField: "lines.account",
        foreignField: "_id",
        as: "account",
      },
    },

    {
      $unwind: "$account",
    },

    {
      $match: {
        "account.userId": toObjectId(userId),

        "account.type": "Expense",
      },
    },

    {
      $group: {
        _id: null,
        total: {
          $sum: "$lines.amount",
        },
      },
    },
  ]);

  return {
    travelExpenses: roundMoney(rows[0]?.total || 0),
  };
};

const getActualCashBankPosition = async (userId) => {
  const accounts = await Account.find(
    applyModuleScopeFilter(
      {
        userId: toObjectId(userId),

        type: "Asset",

        category: {
          $in: PAYMENT_ACCOUNT_CATEGORIES,
        },

        isActive: {
          $ne: false,
        },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id name code category")
    .sort({
      category: 1,
      name: 1,
    })
    .lean();

  const accountIds = accounts.map((account) => account._id);

  if (accountIds.length === 0) {
    return {
      cashInHand: 0,
      bankBalance: 0,
      cashAccounts: [],
      bankAccounts: [],
    };
  }

  const rows = await aggregateAccountLines({
    userId,
    accountIds,

    journalFilter: {
      $or: [
        {
          sourceType: "receive_payment",

          originModule: {
            $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
          },
        },

        {
          sourceType: "refund_payment",

          originModule: TRAVEL_REFUND_ORIGIN,
        },

        {
          sourceType: "pay_bill",

          originModule: {
            $in: TRAVEL_VENDOR_PAYMENT_ORIGINS,
          },
        },

        {
          sourceType: "purchase_return_payment",

          originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
        },

        {
          sourceType: "expense",

          originModule: TRAVEL_EXPENSE_ORIGIN,
        },

        {
          originModule: {
            $in: TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
          },
        },

        {
          originModule: {
            $in: TRAVEL_EMPLOYEE_ORIGIN_VALUES,
          },
        },
      ],
    },
  });

  const balanceByAccountId = new Map(
    rows.map((row) => [
      String(row._id),

      roundMoney(Number(row.debit || 0) - Number(row.credit || 0)),
    ]),
  );

  const summarizeAccount = (account) => ({
    _id: account._id,

    name: account.name || "",

    code: account.code || "",

    category: account.category || "",

    balance: roundMoney(balanceByAccountId.get(String(account._id)) || 0),
  });

  const cashAccounts = accounts
    .filter((account) => CASH_ACCOUNT_CATEGORIES.includes(account.category))
    .map(summarizeAccount);

  const bankAccounts = accounts
    .filter((account) => BANK_ACCOUNT_CATEGORIES.includes(account.category))
    .map(summarizeAccount);

  const cashInHand = cashAccounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0,
  );

  const bankBalance = bankAccounts.reduce(
    (sum, account) => sum + Number(account.balance || 0),
    0,
  );

  return {
    cashInHand: roundMoney(cashInHand),

    bankBalance: roundMoney(bankBalance),

    cashAccounts,
    bankAccounts,
  };
};

const getTravelCashMovementTotals = async (userId) => {
  const paymentAccounts = await Account.find(
    applyModuleScopeFilter(
      {
        userId: toObjectId(userId),

        type: "Asset",

        category: {
          $in: PAYMENT_ACCOUNT_CATEGORIES,
        },

        isActive: {
          $ne: false,
        },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .lean();

  const paymentAccountIds = paymentAccounts.map((account) => account._id);

  if (paymentAccountIds.length === 0) {
    return {
      received: 0,
      refundPaid: 0,
      vendorPayments: 0,
      vendorReturnCashReceived: 0,
      travelExpensePaid: 0,
      employeePayrollCashIn: 0,
      employeePayrollCashOut: 0,
      businessValueCashIn: 0,
      businessValueCashOut: 0,
      travelCashIn: 0,
      travelCashOut: 0,
      netTravelCashMovement: 0,
    };
  }

  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: toObjectId(userId),

        isDeleted: false,

        isReversed: {
          $ne: true,
        },

        "lines.account": {
          $in: paymentAccountIds,
        },

        $or: [
          {
            sourceType: "receive_payment",

            originModule: {
              $in: [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN],
            },
          },

          {
            sourceType: "refund_payment",

            originModule: TRAVEL_REFUND_ORIGIN,
          },

          {
            sourceType: "pay_bill",

            originModule: {
              $in: TRAVEL_VENDOR_PAYMENT_ORIGINS,
            },
          },

          {
            sourceType: "purchase_return_payment",

            originModule: TRAVEL_VENDOR_RETURN_ORIGIN,
          },

          {
            sourceType: "expense",

            originModule: TRAVEL_EXPENSE_ORIGIN,
          },

          {
            originModule: {
              $in: TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
            },
          },

          {
            sourceType: "payment",

            originModule: {
              $in: [
                ...TRAVEL_EMPLOYEE_CASH_IN_ORIGINS,
                ...TRAVEL_EMPLOYEE_CASH_OUT_ORIGINS,
              ],
            },
          },
        ],
      },
    },

    {
      $unwind: "$lines",
    },

    {
      $match: {
        "lines.account": {
          $in: paymentAccountIds,
        },

        "lines.type": {
          $in: ["debit", "credit"],
        },
      },
    },

    {
      $group: {
        _id: {
          sourceType: "$sourceType",

          originModule: "$originModule",

          lineType: "$lines.type",
        },

        amount: {
          $sum: "$lines.amount",
        },
      },
    },
  ]);

  const totals = rows.reduce(
    (result, row) => {
      const sourceType = row._id?.sourceType || "";

      const originModule = row._id?.originModule || "";

      const lineType = row._id?.lineType || "";

      const amount = Number(row.amount || 0);

      if (
        lineType === "debit" &&
        sourceType === "receive_payment" &&
        [TRAVEL_INVOICE_ORIGIN, TRAVEL_RECEIVE_PAYMENT_ORIGIN].includes(
          originModule,
        )
      ) {
        result.received += amount;
      }

      if (
        lineType === "debit" &&
        sourceType === "purchase_return_payment" &&
        originModule === TRAVEL_VENDOR_RETURN_ORIGIN
      ) {
        result.vendorReturnCashReceived += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "refund_payment" &&
        originModule === TRAVEL_REFUND_ORIGIN
      ) {
        result.refundPaid += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "pay_bill" &&
        TRAVEL_VENDOR_PAYMENT_ORIGINS.includes(originModule)
      ) {
        result.vendorPayments += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "expense" &&
        TRAVEL_EXPENSE_ORIGINS.includes(originModule)
      ) {
        result.travelExpensePaid += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "payment" &&
        TRAVEL_EMPLOYEE_CASH_OUT_ORIGINS.includes(originModule)
      ) {
        result.employeePayrollCashOut += amount;
      }

      if (
        lineType === "debit" &&
        sourceType === "payment" &&
        TRAVEL_EMPLOYEE_CASH_IN_ORIGINS.includes(originModule)
      ) {
        result.employeePayrollCashIn += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "payment" &&
        [
          TRAVEL_BUSINESS_VALUE_ORIGINS.LIABILITY_PAYMENT,
          TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN,
        ].includes(originModule)
      ) {
        result.businessValueCashOut += amount;
      }

      if (
        lineType === "debit" &&
        sourceType === "receive_payment" &&
        originModule === TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_PAYMENT
      ) {
        result.businessValueCashIn += amount;
      }

      if (
        lineType === "debit" &&
        sourceType === "reversal" &&
        [
          TRAVEL_BUSINESS_VALUE_ORIGINS.LIABILITY_PAYMENT_REVERSAL,
          TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_REVERSAL,
        ].includes(originModule)
      ) {
        result.businessValueCashIn += amount;
      }

      if (
        lineType === "credit" &&
        sourceType === "reversal" &&
        originModule ===
          TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_PAYMENT_REVERSAL
      ) {
        result.businessValueCashOut += amount;
      }

      return result;
    },
    {
      received: 0,
      refundPaid: 0,
      vendorPayments: 0,
      vendorReturnCashReceived: 0,
      travelExpensePaid: 0,
      employeePayrollCashIn: 0,
      employeePayrollCashOut: 0,
      businessValueCashIn: 0,
      businessValueCashOut: 0,
    },
  );

  const travelCashIn = roundMoney(
    totals.received +
      totals.vendorReturnCashReceived +
      totals.employeePayrollCashIn +
      totals.businessValueCashIn,
  );

  const travelCashOut = roundMoney(
    totals.refundPaid +
      totals.vendorPayments +
      totals.travelExpensePaid +
      totals.employeePayrollCashOut +
      totals.businessValueCashOut,
  );

  return {
    received: roundMoney(totals.received),

    refundPaid: roundMoney(totals.refundPaid),

    vendorPayments: roundMoney(totals.vendorPayments),

    vendorReturnCashReceived: roundMoney(totals.vendorReturnCashReceived),

    travelExpensePaid: roundMoney(totals.travelExpensePaid),

    employeePayrollCashIn: roundMoney(totals.employeePayrollCashIn),

    employeePayrollCashOut: roundMoney(totals.employeePayrollCashOut),

    businessValueCashIn: roundMoney(totals.businessValueCashIn),

    businessValueCashOut: roundMoney(totals.businessValueCashOut),

    travelCashIn,

    travelCashOut,

    netTravelCashMovement: roundMoney(travelCashIn - travelCashOut),
  };
};

const getTravelDashboardAccountingTotals = async (userId) => {
  const [
    profit,
    customer,
    vendor,
    employee,
    cashMovement,
    expenses,
    cashBankPosition,
  ] = await Promise.all([
      getTravelProfitTotals(userId),

      getTravelCustomerBalanceTotals(userId),

      getTravelVendorBalanceTotals(userId),

      getEmployeeFinancialSummary({
        userId,
        moduleScope: MODULE_SCOPES.TRAVEL,
      }),

      getTravelCashMovementTotals(userId),

      getTravelExpenseTotals(userId),

      getActualCashBankPosition(userId),
    ]);

  return {
    ...profit,
    ...customer,
    ...vendor,
    ...cashMovement,
    ...expenses,
    ...cashBankPosition,

    employeePayable: roundMoney(employee.totalPayable || 0),
    employeeRecoverable: roundMoney(employee.totalRecoverable || 0),
    totalReceivable: roundMoney(
      Number(customer.totalReceivable || 0) +
        Number(employee.totalRecoverable || 0),
    ),
    totalPayable: roundMoney(
      Number(vendor.totalPayable || 0) + Number(employee.totalPayable || 0),
    ),

    netProfit: roundMoney(profit.grossProfit - expenses.travelExpenses),
  };
};

module.exports = {
  TRAVEL_INVOICE_ORIGIN,
  TRAVEL_REFUND_ORIGIN,
  TRAVEL_RECEIVE_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_PAYMENT_ORIGIN,
  TRAVEL_VENDOR_RETURN_ORIGIN,
  TRAVEL_EXPENSE_ORIGIN,
  TRAVEL_EXPENSE_ORIGINS,
  TRAVEL_CUSTOMER_OPENING_ORIGIN,
  TRAVEL_VENDOR_OPENING_ORIGIN,

  getTravelCustomerBalanceMap,
  getTravelCustomerBalanceTotals,
  getTravelCustomerJournalFilter,

  getActualCashBankPosition,
  getTravelDashboardAccountingTotals,

  getTravelVendorBalanceMap,
  getTravelPartyBalanceMap,
  getTravelPartyJournalFilter,
  getTravelVendorBalanceTotals,
  getTravelVendorJournalFilter,

  roundMoney,
};
