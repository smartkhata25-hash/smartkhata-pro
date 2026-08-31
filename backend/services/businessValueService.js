const mongoose = require("mongoose");

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");

const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");

const BusinessAsset = require("../models/BusinessAsset");
const BusinessLiability = require("../models/BusinessLiability");

const BusinessReceivableLoan = require("../models/BusinessReceivableLoan");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../utils/moduleScope");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
  applyBusinessValueScopeFilter,
  resolveBusinessValueModuleScope,
} = require("../utils/businessValueModuleScope");
const {
  getActualCashBankPosition,
  getTravelCustomerBalanceTotals,
  getTravelVendorBalanceTotals,
} = require("./travel/travelAccountingMetricsService");

const AVAILABLE_COMPONENTS = [
  "inventory",
  "assets",
  "cash",
  "bank",
  "receivables",
  "loan_receivables",
  "payables",
  "liabilities",
];

const PRESETS = {
  stock_assets: ["inventory", "assets"],

  operational: [
    "inventory",
    "assets",
    "cash",
    "bank",
    "receivables",
    "loan_receivables",
    "payables",
  ],

  complete: [
    "inventory",
    "assets",
    "cash",
    "bank",
    "receivables",
    "loan_receivables",
    "payables",
    "liabilities",
  ],
};

const TRAVEL_AVAILABLE_COMPONENTS = AVAILABLE_COMPONENTS.filter(
  (component) => component !== "inventory",
);

const TRAVEL_PRESETS = {
  stock_assets: ["assets"],

  operational: [
    "assets",
    "cash",
    "bank",
    "receivables",
    "loan_receivables",
    "payables",
  ],

  complete: [
    "assets",
    "cash",
    "bank",
    "receivables",
    "loan_receivables",
    "payables",
    "liabilities",
  ],
};

const BUSINESS_VALUE_SCOPE_CONFIG = Object.freeze({
  [MODULE_SCOPES.TRADING]: {
    availableComponents: AVAILABLE_COMPONENTS,
    presets: PRESETS,
  },

  [MODULE_SCOPES.TRAVEL]: {
    availableComponents: TRAVEL_AVAILABLE_COMPONENTS,
    presets: TRAVEL_PRESETS,
  },
});

const TRAVEL_ACCOUNT_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
  ...TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
]);

const TRAVEL_ACCOUNT_SOURCE_TYPES = Object.freeze([
  "travel_booking",
  "travel_customer_advance",
  "travel_vendor_cost",
  "travel_vendor_advance",
  "travel_vendor_return",
  "travel_commission",
  "travel_refund",
  "travel_adjustment",
]);

const roundAmount = (value) => {
  return Number(Number(value || 0).toFixed(2));
};

const getScopeConfig = (moduleScope = MODULE_SCOPES.TRADING) =>
  BUSINESS_VALUE_SCOPE_CONFIG[moduleScope] ||
  BUSINESS_VALUE_SCOPE_CONFIG[MODULE_SCOPES.TRADING];

const getTravelJournalConditions = () => [
  { originModule: { $in: TRAVEL_ACCOUNT_ORIGINS } },
  { sourceType: { $in: TRAVEL_ACCOUNT_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_ACCOUNT_ORIGINS },
  },
];

const buildTradingJournalFilter = () => ({
  $nor: getTravelJournalConditions(),
});

const buildTradingAccountScopeMatch = () => ({
  $or: [
    { "account.moduleScope": { $exists: false } },
    { "account.moduleScope": null },
    { "account.moduleScope": "" },
    {
      "account.moduleScope": {
        $in: [MODULE_SCOPES.TRADING, MODULE_SCOPES.BOTH],
      },
    },
  ],
});

const normalizeComponents = ({
  preset,
  components,
  moduleScope = MODULE_SCOPES.TRADING,
}) => {
  const scopeConfig = getScopeConfig(moduleScope);

  if (preset && scopeConfig.presets[preset]) {
    return scopeConfig.presets[preset];
  }

  if (Array.isArray(components)) {
    const validComponents = components.filter((component) =>
      scopeConfig.availableComponents.includes(component),
    );

    return [...new Set(validComponents)];
  }

  if (typeof components === "string" && components.trim()) {
    const validComponents = components
      .split(",")
      .map((component) => component.trim().toLowerCase())
      .filter((component) => scopeConfig.availableComponents.includes(component));

    return [...new Set(validComponents)];
  }

  return scopeConfig.presets.complete;
};

const getInventoryValue = async (userId) => {
  const products = await Product.find({ userId }).select("_id unitCost").lean();

  if (!products.length) {
    return {
      value: 0,
      totalProducts: 0,
      totalQty: 0,
    };
  }

  const productIds = products.map((product) => product._id);

  const stockData = await InventoryTransaction.aggregate([
    {
      $match: {
        userId,
        productId: {
          $in: productIds,
        },
      },
    },

    {
      $group: {
        _id: "$productId",

        stockQty: {
          $sum: {
            $switch: {
              branches: [
                {
                  case: {
                    $in: ["$type", ["IN", "ADJUST_IN"]],
                  },
                  then: "$quantity",
                },
                {
                  case: {
                    $in: ["$type", ["OUT", "ADJUST_OUT"]],
                  },
                  then: {
                    $multiply: ["$quantity", -1],
                  },
                },
              ],
              default: 0,
            },
          },
        },
      },
    },
  ]);

  const stockMap = new Map();

  stockData.forEach((item) => {
    stockMap.set(item._id.toString(), Number(item.stockQty || 0));
  });

  let totalValue = 0;
  let totalQty = 0;
  let totalProducts = 0;

  products.forEach((product) => {
    const stockQty = Number(stockMap.get(product._id.toString()) || 0);
    const unitCost = Number(product.unitCost || 0);

    if (stockQty !== 0) {
      totalProducts += 1;
    }

    totalQty += stockQty;
    totalValue += stockQty * unitCost;
  });

  return {
    value: roundAmount(totalValue),
    totalProducts,
    totalQty: roundAmount(totalQty),
  };
};

const getBusinessAssetsValue = async (
  userId,
  moduleScope = MODULE_SCOPES.TRADING,
) => {
  const match = {
    userId,
    isDeleted: false,
    isActive: true,
    status: "active",
  };

  applyBusinessValueScopeFilter(match, moduleScope);

  const result = await BusinessAsset.aggregate([
    {
      $match: match,
    },

    {
      $group: {
        _id: null,

        value: {
          $sum: {
            $multiply: ["$quantity", "$currentValue"],
          },
        },

        purchaseValue: {
          $sum: {
            $multiply: ["$quantity", "$purchaseCost"],
          },
        },

        totalAssets: {
          $sum: 1,
        },

        totalQuantity: {
          $sum: "$quantity",
        },
      },
    },
  ]);

  const data = result[0] || {};

  return {
    value: roundAmount(data.value),
    purchaseValue: roundAmount(data.purchaseValue),
    totalAssets: Number(data.totalAssets || 0),
    totalQuantity: roundAmount(data.totalQuantity),
  };
};

const getAccountBalances = async (userId) => {
  const accountData = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: userId,
        isDeleted: false,
        ...buildTradingJournalFilter(),
      },
    },

    {
      $unwind: "$lines",
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
        "account.userId": userId,
        "account.isActive": {
          $ne: false,
        },
        ...buildTradingAccountScopeMatch(),
      },
    },

    {
      $group: {
        _id: {
          accountId: "$lines.account",
          category: "$account.category",
          type: "$account.type",
          lineType: "$lines.type",
        },

        amount: {
          $sum: "$lines.amount",
        },
      },
    },
  ]);

  const balances = {
    cash: 0,
    bank: 0,
    customer: {},
    supplier: {},
    party: {},
  };

  accountData.forEach((item) => {
    const accountId = item._id.accountId?.toString();
    const category = item._id.category;
    const lineType = item._id.lineType;
    const amount = Number(item.amount || 0);

    if (category === "cash") {
      balances.cash += lineType === "debit" ? amount : -amount;
    }

    if (["bank", "online", "cheque", "wallet"].includes(category)) {
      balances.bank += lineType === "debit" ? amount : -amount;
    }

    if (category === "customer" && accountId) {
      balances.customer[accountId] =
        Number(balances.customer[accountId] || 0) +
        (lineType === "debit" ? amount : -amount);
    }

    if (category === "supplier" && accountId) {
      balances.supplier[accountId] =
        Number(balances.supplier[accountId] || 0) +
        (lineType === "credit" ? amount : -amount);
    }

    if (category === "party" && accountId) {
      balances.party[accountId] =
        Number(balances.party[accountId] || 0) +
        (lineType === "debit" ? amount : -amount);
    }
  });

  return balances;
};

const getReceivablePayableValues = async (userId, accountBalances) => {
  const customerQuery = {
    createdBy: userId,
    isActive: true,
  };
  const supplierQuery = {
    userId,
    isDeleted: {
      $ne: true,
    },
  };
  const partyQuery = {
    userId,
    isActive: true,
    isDeleted: false,
  };

  applyModuleScopeFilter(customerQuery, MODULE_SCOPES.TRADING);
  applySupplierModuleScopeFilter(supplierQuery, MODULE_SCOPES.TRADING);
  applyModuleScopeFilter(partyQuery, MODULE_SCOPES.TRADING);

  const [customers, suppliers, parties] = await Promise.all([
    Customer.find(customerQuery)
      .select("account")
      .lean(),

    Supplier.find(supplierQuery)
      .select("account")
      .lean(),

    Party.find(partyQuery)
      .select("account")
      .lean(),
  ]);

  let receivables = 0;
  let payables = 0;
  let receivableCount = 0;
  let payableCount = 0;

  customers.forEach((customer) => {
    const accountId = customer.account?.toString();

    if (!accountId) {
      return;
    }

    const balance = Number(accountBalances.customer[accountId] || 0);

    if (balance > 0) {
      receivables += balance;
      receivableCount += 1;
    }

    if (balance < 0) {
      payables += Math.abs(balance);
      payableCount += 1;
    }
  });

  suppliers.forEach((supplier) => {
    const accountId = supplier.account?.toString();

    if (!accountId) {
      return;
    }

    const balance = Number(accountBalances.supplier[accountId] || 0);

    if (balance > 0) {
      payables += balance;
      payableCount += 1;
    }

    if (balance < 0) {
      receivables += Math.abs(balance);
      receivableCount += 1;
    }
  });

  parties.forEach((party) => {
    const accountId = party.account?.toString();

    if (!accountId) {
      return;
    }

    const balance = Number(accountBalances.party[accountId] || 0);

    if (balance > 0) {
      receivables += balance;
      receivableCount += 1;
    }

    if (balance < 0) {
      payables += Math.abs(balance);
      payableCount += 1;
    }
  });

  return {
    receivables: roundAmount(receivables),
    payables: roundAmount(payables),
    receivableCount,
    payableCount,
  };
};

const getLoanReceivablesValue = async (
  userId,
  moduleScope = MODULE_SCOPES.TRADING,
) => {
  const match = {
    userId,
    isDeleted: false,
    status: "active",
    remainingAmount: {
      $gt: 0,
    },
  };

  applyBusinessValueScopeFilter(match, moduleScope);

  const result = await BusinessReceivableLoan.aggregate([
    {
      $match: match,
    },

    {
      $group: {
        _id: null,

        value: {
          $sum: "$remainingAmount",
        },

        originalValue: {
          $sum: "$originalAmount",
        },

        totalLoans: {
          $sum: 1,
        },
      },
    },
  ]);

  const data = result[0] || {};

  return {
    value: roundAmount(data.value),
    originalValue: roundAmount(data.originalValue),
    totalLoans: Number(data.totalLoans || 0),
  };
};

const getManualLiabilitiesValue = async (
  userId,
  moduleScope = MODULE_SCOPES.TRADING,
) => {
  const match = {
    userId,
    isDeleted: false,
    status: "active",
    remainingAmount: {
      $gt: 0,
    },
  };

  applyBusinessValueScopeFilter(match, moduleScope);

  const result = await BusinessLiability.aggregate([
    {
      $match: match,
    },

    {
      $group: {
        _id: null,

        value: {
          $sum: "$remainingAmount",
        },

        originalValue: {
          $sum: "$originalAmount",
        },

        totalLiabilities: {
          $sum: 1,
        },
      },
    },
  ]);

  const data = result[0] || {};

  return {
    value: roundAmount(data.value),
    originalValue: roundAmount(data.originalValue),
    totalLiabilities: Number(data.totalLiabilities || 0),
  };
};

const getTravelAccountValues = async (userId) => {
  const [cashBank, customer, vendor] = await Promise.all([
    getActualCashBankPosition(userId),
    getTravelCustomerBalanceTotals(userId),
    getTravelVendorBalanceTotals(userId),
  ]);

  return {
    cash: roundAmount(cashBank.cashInHand),
    bank: roundAmount(cashBank.bankBalance),
    receivables: roundAmount(customer.totalReceivable || customer.customerDue),
    payables: roundAmount(vendor.totalPayable || vendor.vendorPayable),
    receivableCount: (customer.receivableDetails || []).length,
    payableCount: (vendor.payableDetails || []).length,
    cashAccounts: cashBank.cashAccounts || [],
    bankAccounts: cashBank.bankAccounts || [],
  };
};

const createComponent = ({
  included,
  value = 0,
  details = {},
  effect = "positive",
}) => {
  return {
    included,
    value: included ? roundAmount(value) : 0,
    effect,
    details: included ? details : {},
  };
};

const getBusinessValueSummary = async ({
  userId,
  preset = "complete",
  components,
  moduleScope = MODULE_SCOPES.TRADING,
}) => {
  const objectUserId =
    userId instanceof mongoose.Types.ObjectId
      ? userId
      : new mongoose.Types.ObjectId(userId);
  const normalizedModuleScope = resolveBusinessValueModuleScope({
    moduleScope,
  });
  const scopeConfig = getScopeConfig(normalizedModuleScope);
  const isTravelScope = normalizedModuleScope === MODULE_SCOPES.TRAVEL;

  const selectedComponents = normalizeComponents({
    preset,
    components,
    moduleScope: normalizedModuleScope,
  });

  const shouldInclude = (component) => selectedComponents.includes(component);

  const inventoryPromise = shouldInclude("inventory")
    ? getInventoryValue(objectUserId)
    : Promise.resolve(null);

  const assetsPromise = shouldInclude("assets")
    ? getBusinessAssetsValue(objectUserId, normalizedModuleScope)
    : Promise.resolve(null);

  const accountBalancesPromise =
    shouldInclude("cash") ||
    shouldInclude("bank") ||
    shouldInclude("receivables") ||
    shouldInclude("payables")
      ? isTravelScope
        ? getTravelAccountValues(objectUserId)
        : getAccountBalances(objectUserId)
      : Promise.resolve(null);

  const loanReceivablesPromise = shouldInclude("loan_receivables")
    ? getLoanReceivablesValue(objectUserId, normalizedModuleScope)
    : Promise.resolve(null);

  const liabilitiesPromise = shouldInclude("liabilities")
    ? getManualLiabilitiesValue(objectUserId, normalizedModuleScope)
    : Promise.resolve(null);

  const [
    inventoryData,
    assetsData,
    accountBalances,
    loanReceivablesData,
    liabilitiesData,
  ] = await Promise.all([
    inventoryPromise,
    assetsPromise,
    accountBalancesPromise,
    loanReceivablesPromise,
    liabilitiesPromise,
  ]);

  let receivablePayableData = null;

  if (
    accountBalances &&
    (shouldInclude("receivables") || shouldInclude("payables"))
  ) {
    receivablePayableData = isTravelScope
      ? accountBalances
      : await getReceivablePayableValues(objectUserId, accountBalances);
  }

  const resultComponents = {
    inventory: createComponent({
      included: shouldInclude("inventory"),
      value: inventoryData?.value,
      effect: "positive",
      details: {
        totalProducts: inventoryData?.totalProducts || 0,
        totalQty: inventoryData?.totalQty || 0,
      },
    }),

    assets: createComponent({
      included: shouldInclude("assets"),
      value: assetsData?.value,
      effect: "positive",
      details: {
        purchaseValue: assetsData?.purchaseValue || 0,
        totalAssets: assetsData?.totalAssets || 0,
        totalQuantity: assetsData?.totalQuantity || 0,
      },
    }),

    cash: createComponent({
      included: shouldInclude("cash"),
      value: accountBalances?.cash,
      effect: "positive",
      details: {
        cashAccounts: accountBalances?.cashAccounts || [],
      },
    }),

    bank: createComponent({
      included: shouldInclude("bank"),
      value: accountBalances?.bank,
      effect: "positive",
      details: {
        includes: ["bank", "online", "cheque"],
        bankAccounts: accountBalances?.bankAccounts || [],
      },
    }),

    receivables: createComponent({
      included: shouldInclude("receivables"),
      value: receivablePayableData?.receivables,
      effect: "positive",
      details: {
        totalAccounts: receivablePayableData?.receivableCount || 0,
      },
    }),

    loan_receivables: createComponent({
      included: shouldInclude("loan_receivables"),
      value: loanReceivablesData?.value,
      effect: "positive",
      details: {
        originalValue: loanReceivablesData?.originalValue || 0,
        totalLoans: loanReceivablesData?.totalLoans || 0,
      },
    }),

    payables: createComponent({
      included: shouldInclude("payables"),
      value: receivablePayableData?.payables,
      effect: "negative",
      details: {
        totalAccounts: receivablePayableData?.payableCount || 0,
      },
    }),

    liabilities: createComponent({
      included: shouldInclude("liabilities"),
      value: liabilitiesData?.value,
      effect: "negative",
      details: {
        originalValue: liabilitiesData?.originalValue || 0,
        totalLiabilities: liabilitiesData?.totalLiabilities || 0,
      },
    }),
  };

  let totalPositiveValue = 0;
  let totalNegativeValue = 0;

  Object.values(resultComponents).forEach((component) => {
    if (!component.included) {
      return;
    }

    if (component.effect === "negative") {
      totalNegativeValue += Number(component.value || 0);
    } else {
      totalPositiveValue += Number(component.value || 0);
    }
  });

  const netBusinessValue = totalPositiveValue - totalNegativeValue;

  return {
    moduleScope: normalizedModuleScope,

    preset: preset && scopeConfig.presets[preset] ? preset : "custom",

    selectedComponents,

    availableComponents: scopeConfig.availableComponents,

    availablePresets: {
      stock_assets: scopeConfig.presets.stock_assets,
      operational: scopeConfig.presets.operational,
      complete: scopeConfig.presets.complete,
      custom: scopeConfig.availableComponents,
    },

    components: resultComponents,

    totalPositiveValue: roundAmount(totalPositiveValue),

    totalNegativeValue: roundAmount(totalNegativeValue),

    netBusinessValue: roundAmount(netBusinessValue),

    generatedAt: new Date(),
  };
};

module.exports = {
  AVAILABLE_COMPONENTS,
  PRESETS,
  TRAVEL_AVAILABLE_COMPONENTS,
  TRAVEL_PRESETS,
  normalizeComponents,
  getBusinessValueSummary,
};
