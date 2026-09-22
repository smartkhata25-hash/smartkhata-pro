const mongoose = require("mongoose");

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const ACCOUNT_RULES = require("../utils/accountRules");
const { recalculateAccountBalances } = require("../utils/accountHelper");
const { isPeriodLocked } = require("../utils/periodLockHelper");
const { logAudit } = require("../utils/auditHelper");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  getRequestedModuleScope,
  normalizeModuleScope,
} = require("../utils/moduleScope");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../utils/businessValueModuleScope");
const {
  TRAVEL_EMPLOYEE_ORIGIN_VALUES,
  WEAVING_EMPLOYEE_ORIGIN_VALUES,
} = require("../utils/employeePayrollOrigins");
const {
  getCurrentBusinessTimeInput,
  parseBusinessDateTime,
} = require("../utils/businessDate");

const TRADING_ACCOUNT_OPENING_ORIGIN = "account_opening_balance";
const TRAVEL_ACCOUNT_OPENING_ORIGIN = "travel_account_opening_balance";
const WEAVING_ACCOUNT_OPENING_ORIGIN = "weaving_account_opening_balance";
const TRADING_ACCOUNT_TRANSFER_ORIGIN = "account_transfer";
const TRAVEL_ACCOUNT_TRANSFER_ORIGIN = "travel_account_transfer";
const WEAVING_ACCOUNT_TRANSFER_ORIGIN = "weaving_account_transfer";
const TRADING_ACCOUNT_ADJUSTMENT_ORIGIN = "account_adjustment";
const TRAVEL_ACCOUNT_ADJUSTMENT_ORIGIN = "travel_account_adjustment";
const WEAVING_ACCOUNT_ADJUSTMENT_ORIGIN = "weaving_account_adjustment";
const TRADING_OWNER_MONEY_ORIGIN = "owner_money";
const TRAVEL_OWNER_MONEY_ORIGIN = "travel_owner_money";
const WEAVING_OWNER_MONEY_ORIGIN = "weaving_owner_money";

const TRAVEL_ACCOUNT_ORIGINS = Object.freeze([
  "travel_invoice",
  "travel_refund",
  "travel_receive_payment",
  "travel_vendor_payment",
  "travel_vendor_return",
  "travel_expense",
  TRAVEL_ACCOUNT_OPENING_ORIGIN,
  TRAVEL_ACCOUNT_TRANSFER_ORIGIN,
  TRAVEL_ACCOUNT_ADJUSTMENT_ORIGIN,
  TRAVEL_OWNER_MONEY_ORIGIN,
  ...TRAVEL_EMPLOYEE_ORIGIN_VALUES,
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

const WEAVING_ACCOUNT_ORIGINS = Object.freeze([
  "weaving_expense",
  ...WEAVING_EMPLOYEE_ORIGIN_VALUES,
  WEAVING_ACCOUNT_OPENING_ORIGIN,
  WEAVING_ACCOUNT_TRANSFER_ORIGIN,
  WEAVING_ACCOUNT_ADJUSTMENT_ORIGIN,
  WEAVING_OWNER_MONEY_ORIGIN,
]);

const PAYMENT_ACCOUNT_CATEGORIES = Object.freeze([
  "cash",
  "bank",
  "online",
  "cheque",
]);
const BANK_ACCOUNT_CATEGORIES = Object.freeze(["bank"]);
const BALANCE_SHEET_ACCOUNT_TYPES = Object.freeze([
  "Asset",
  "Liability",
  "Equity",
]);
const TRANSFER_ACCOUNT_CATEGORIES = Object.freeze([
  "cash",
  "bank",
  "online",
  "cheque",
]);
const ADJUSTMENT_EXCLUDED_CATEGORIES = Object.freeze([
  "customer",
  "supplier",
  "party",
  "receivable",
  "payable",
]);
const RESERVED_BALANCING_ACCOUNT_CODES = Object.freeze([
  "OPENING_BALANCE",
  "TRAVEL_OPENING_BALANCE",
  "WEAVING_OPENING_BALANCE",
  "ACCOUNT_ADJUSTMENT",
  "TRAVEL_ACCOUNT_ADJUSTMENT",
  "WEAVING_ACCOUNT_ADJUSTMENT",
  "OWNER_CAPITAL",
  "TRAVEL_OWNER_CAPITAL",
  "WEAVING_OWNER_CAPITAL",
  "OWNER_DRAWINGS",
  "TRAVEL_OWNER_DRAWINGS",
  "WEAVING_OWNER_DRAWINGS",
]);

const toObjectId = (value) => new mongoose.Types.ObjectId(String(value));

const getUserId = (req) => req.user?.id || req.userId;

const getAccountScope = (source = {}) => {
  const requestedScope = getRequestedModuleScope(source, MODULE_SCOPES.TRADING);

  if (requestedScope === "all") {
    return "all";
  }

  return normalizeModuleScope(requestedScope, MODULE_SCOPES.TRADING);
};

const assertScopeEnabled = (req, moduleScope) => {
  if (moduleScope === "all") {
    return;
  }

  const enabledModules = req.user?.enabledModules || {};

  if (moduleScope === MODULE_SCOPES.BOTH) {
    if (
      enabledModules[MODULE_SCOPES.TRADING] === false ||
      enabledModules[MODULE_SCOPES.TRAVEL] !== true
    ) {
      const error = new Error("This business module is not enabled");
      error.statusCode = 403;
      throw error;
    }

    return;
  }

  if (moduleScope === MODULE_SCOPES.SHARED) {
    const anyEnabled =
      enabledModules[MODULE_SCOPES.TRADING] !== false ||
      enabledModules[MODULE_SCOPES.TRAVEL] === true ||
      enabledModules[MODULE_SCOPES.WEAVING] === true;

    if (!anyEnabled) {
      const error = new Error("This business module is not enabled");
      error.statusCode = 403;
      throw error;
    }

    return;
  }

  const enabled =
    moduleScope === MODULE_SCOPES.TRADING
      ? enabledModules[MODULE_SCOPES.TRADING] !== false
      : enabledModules[moduleScope] === true;

  if (!enabled) {
    const error = new Error("This business module is not enabled");
    error.statusCode = 403;
    throw error;
  }
};

const applyAccountScopeFilter = (query, scope = MODULE_SCOPES.TRADING) => {
  if (scope === "all") {
    return query;
  }

  applyModuleScopeFilter(query, scope);

  return query;
};

const getTravelJournalConditions = () => [
  { moduleScope: MODULE_SCOPES.TRAVEL },
  { originModule: { $in: TRAVEL_ACCOUNT_ORIGINS } },
  { sourceType: { $in: TRAVEL_ACCOUNT_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_ACCOUNT_ORIGINS },
  },
];

const getWeavingJournalConditions = () => [
  { moduleScope: MODULE_SCOPES.WEAVING },
  { originModule: { $in: WEAVING_ACCOUNT_ORIGINS } },
  {
    sourceType: "reversal",
    originModule: { $in: WEAVING_ACCOUNT_ORIGINS },
  },
];

const getJournalScopeFilter = (scope = MODULE_SCOPES.TRADING) => {
  if (scope === MODULE_SCOPES.TRAVEL) {
    return { $or: getTravelJournalConditions() };
  }

  if (scope === MODULE_SCOPES.WEAVING) {
    return { $or: getWeavingJournalConditions() };
  }

  if (scope === MODULE_SCOPES.TRADING) {
    return {
      $and: [
        {
          $or: [
            { moduleScope: { $exists: false } },
            { moduleScope: null },
            { moduleScope: "" },
            { moduleScope: MODULE_SCOPES.TRADING },
          ],
        },
        {
          $nor: [
            ...getTravelJournalConditions(),
            ...getWeavingJournalConditions(),
          ],
        },
      ],
    };
  }

  return {};
};

const buildCodeConflictQuery = ({
  userId,
  code,
  moduleScope,
  excludeId = null,
}) => {
  const query = {
    userId,
    code,
  };

  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  if (
    moduleScope === MODULE_SCOPES.BOTH ||
    moduleScope === MODULE_SCOPES.SHARED ||
    moduleScope === "all"
  ) {
    query.$or = [
      { moduleScope: { $exists: false } },
      { moduleScope: null },
      { moduleScope: "" },
      {
        moduleScope: {
          $in: [
            MODULE_SCOPES.TRADING,
            MODULE_SCOPES.TRAVEL,
            MODULE_SCOPES.WEAVING,
            MODULE_SCOPES.BOTH,
            MODULE_SCOPES.SHARED,
          ],
        },
      },
    ];

    return query;
  }

  return applyAccountScopeFilter(query, moduleScope);
};

const assertAccountCodeAvailable = async ({
  userId,
  code,
  moduleScope,
  excludeId = null,
}) => {
  const existing = await Account.findOne(
    buildCodeConflictQuery({ userId, code, moduleScope, excludeId }),
  ).select("_id");

  if (existing) {
    const error = new Error(
      "Account code already exists in this module scope.",
    );
    error.statusCode = 400;
    throw error;
  }
};

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const makeHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const roundMoney = (value = 0) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const parseAmount = (value, { allowZero = false, label = "Amount" } = {}) => {
  const amount = roundMoney(value);

  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount <= 0)) {
    throw makeHttpError(
      allowZero
        ? `${label} must be 0 or greater.`
        : `${label} must be greater than 0.`,
      400,
    );
  }

  return amount;
};

const getJournalContextScope = (scope) => {
  const cleanScope = String(scope || "")
    .trim()
    .toLowerCase();

  if (
    cleanScope === "all" ||
    cleanScope === MODULE_SCOPES.BOTH ||
    cleanScope === MODULE_SCOPES.SHARED
  ) {
    throw makeHttpError(
      "Trading, Travel or Weaving module context is required.",
      400,
    );
  }

  const normalized = normalizeModuleScope(scope, MODULE_SCOPES.TRADING);

  if (
    normalized !== MODULE_SCOPES.TRADING &&
    normalized !== MODULE_SCOPES.TRAVEL &&
    normalized !== MODULE_SCOPES.WEAVING
  ) {
    throw makeHttpError(
      "Trading, Travel or Weaving module context is required.",
      400,
    );
  }

  return normalized;
};

const isBalanceSheetAccountType = (type) =>
  BALANCE_SHEET_ACCOUNT_TYPES.includes(type);

const isTransferAccount = (account) =>
  account?.isSystem !== true &&
  account?.type === "Asset" &&
  TRANSFER_ACCOUNT_CATEGORIES.includes(account.category);

const isCounterpartyAccountName = (name = "") =>
  /^(Customer|Supplier|Party):/i.test(String(name).trim());

const isManualAdjustmentAccount = (account) =>
  account?.isActive !== false &&
  account?.isSystem !== true &&
  isBalanceSheetAccountType(account?.type) &&
  !ADJUSTMENT_EXCLUDED_CATEGORIES.includes(account.category) &&
  !RESERVED_BALANCING_ACCOUNT_CODES.includes(
    String(account.code || "")
      .trim()
      .toUpperCase(),
  ) &&
  !isCounterpartyAccountName(account.name);

const getManualAccountOrigin = (scope, action) => {
  if (scope === MODULE_SCOPES.TRAVEL) {
    return {
      opening: TRAVEL_ACCOUNT_OPENING_ORIGIN,
      transfer: TRAVEL_ACCOUNT_TRANSFER_ORIGIN,
      adjustment: TRAVEL_ACCOUNT_ADJUSTMENT_ORIGIN,
      owner: TRAVEL_OWNER_MONEY_ORIGIN,
    }[action];
  }

  if (scope === MODULE_SCOPES.WEAVING) {
    return {
      opening: WEAVING_ACCOUNT_OPENING_ORIGIN,
      transfer: WEAVING_ACCOUNT_TRANSFER_ORIGIN,
      adjustment: WEAVING_ACCOUNT_ADJUSTMENT_ORIGIN,
      owner: WEAVING_OWNER_MONEY_ORIGIN,
    }[action];
  }

  return {
    opening: TRADING_ACCOUNT_OPENING_ORIGIN,
    transfer: TRADING_ACCOUNT_TRANSFER_ORIGIN,
    adjustment: TRADING_ACCOUNT_ADJUSTMENT_ORIGIN,
    owner: TRADING_OWNER_MONEY_ORIGIN,
  }[action];
};

const getOpeningSourceType = (scope) =>
  scope === MODULE_SCOPES.TRAVEL ? "travel_adjustment" : "opening_balance";

const getAdjustmentSourceType = (scope) =>
  scope === MODULE_SCOPES.TRAVEL ? "travel_adjustment" : "adjustment";

const getSystemAccountConfig = (scope, purpose) => {
  if (scope === MODULE_SCOPES.TRAVEL) {
    if (purpose === "capital") {
      return {
        code: "TRAVEL_OWNER_CAPITAL",
        name: "Travel Owner Capital",
        moduleScope: MODULE_SCOPES.TRAVEL,
        category: "capital",
        normalBalance: "credit",
      };
    }
    if (purpose === "drawings") {
      return {
        code: "TRAVEL_OWNER_DRAWINGS",
        name: "Travel Owner Drawings",
        moduleScope: MODULE_SCOPES.TRAVEL,
        category: "drawings",
        normalBalance: "debit",
      };
    }
    return purpose === "adjustment"
      ? {
          code: "TRAVEL_ACCOUNT_ADJUSTMENT",
          name: "Travel Account Adjustment",
          moduleScope: MODULE_SCOPES.TRAVEL,
          category: "other",
          normalBalance: "credit",
        }
      : {
          code: "TRAVEL_OPENING_BALANCE",
          name: "Travel Opening Balance",
          moduleScope: MODULE_SCOPES.TRAVEL,
          category: "other",
          normalBalance: "credit",
        };
  }

  if (scope === MODULE_SCOPES.WEAVING) {
    if (purpose === "capital") {
      return {
        code: "WEAVING_OWNER_CAPITAL",
        name: "Weaving Owner Capital",
        moduleScope: MODULE_SCOPES.WEAVING,
        category: "capital",
        normalBalance: "credit",
      };
    }
    if (purpose === "drawings") {
      return {
        code: "WEAVING_OWNER_DRAWINGS",
        name: "Weaving Owner Drawings",
        moduleScope: MODULE_SCOPES.WEAVING,
        category: "drawings",
        normalBalance: "debit",
      };
    }
    return purpose === "adjustment"
      ? {
          code: "WEAVING_ACCOUNT_ADJUSTMENT",
          name: "Weaving Account Adjustment",
          moduleScope: MODULE_SCOPES.WEAVING,
          category: "other",
          normalBalance: "credit",
        }
      : {
          code: "WEAVING_OPENING_BALANCE",
          name: "Weaving Opening Balance",
          moduleScope: MODULE_SCOPES.WEAVING,
          category: "other",
          normalBalance: "credit",
        };
  }

  if (purpose === "capital") {
    return {
      code: "OWNER_CAPITAL",
      name: "Owner Capital",
      moduleScope: MODULE_SCOPES.TRADING,
      category: "capital",
      normalBalance: "credit",
    };
  }
  if (purpose === "drawings") {
    return {
      code: "OWNER_DRAWINGS",
      name: "Owner Drawings",
      moduleScope: MODULE_SCOPES.TRADING,
      category: "drawings",
      normalBalance: "debit",
    };
  }
  return purpose === "adjustment"
    ? {
        code: "ACCOUNT_ADJUSTMENT",
        name: "Account Adjustment",
        moduleScope: MODULE_SCOPES.TRADING,
        category: "other",
        normalBalance: "credit",
      }
    : {
        code: "OPENING_BALANCE",
        name: "opening balance equity",
        moduleScope: MODULE_SCOPES.TRADING,
        category: "other",
        normalBalance: "credit",
      };
};

const getOrCreateSystemAccount = async ({ userId, scope, purpose }) => {
  const config = getSystemAccountConfig(scope, purpose);
  const userObjectId = toObjectId(userId);
  let account = await Account.findOne({
    userId: userObjectId,
    code: config.code,
  });

  const targetCategory = config.category || "other";
  const targetNormalBalance = config.normalBalance || "credit";

  if (!account) {
    return Account.create({
      userId: userObjectId,
      name: config.name,
      type: "Equity",
      category: targetCategory,
      code: config.code,
      normalBalance: targetNormalBalance,
      openingBalance: 0,
      isSystem: true,
      isActive: true,
      moduleScope: config.moduleScope,
    });
  }

  if (account.isSystem !== true) {
    throw makeHttpError(
      `System account code ${config.code} already exists as a user account.`,
      409,
    );
  }

  let changed = false;

  if (account.moduleScope !== config.moduleScope) {
    account.moduleScope = config.moduleScope;
    changed = true;
  }

  if (account.type !== "Equity") {
    account.type = "Equity";
    changed = true;
  }

  if (account.category !== targetCategory) {
    account.category = targetCategory;
    changed = true;
  }

  if (account.normalBalance !== targetNormalBalance) {
    account.normalBalance = targetNormalBalance;
    changed = true;
  }

  if (account.isActive === false) {
    account.isActive = true;
    changed = true;
  }

  return changed ? account.save() : account;
};

const getJournalDateTime = (dateInput) => {
  const now = new Date();
  const time = getCurrentBusinessTimeInput(now);

  return {
    date: parseBusinessDateTime(dateInput || now, time, {
      fallback: now,
      label: "transaction date",
    }),
    time,
  };
};

const buildAccountOpeningLines = ({ account, balancingAccount, amount }) => {
  const accountLineType = account.type === "Asset" ? "debit" : "credit";
  const balancingLineType = accountLineType === "debit" ? "credit" : "debit";

  return [
    {
      account: account._id,
      type: accountLineType,
      amount,
    },
    {
      account: balancingAccount._id,
      type: balancingLineType,
      amount,
    },
  ];
};

const buildAdjustmentLines = ({
  account,
  balancingAccount,
  amount,
  direction,
}) => {
  const increase = direction === "increase";
  const accountLineType =
    account.type === "Asset"
      ? increase
        ? "debit"
        : "credit"
      : increase
        ? "credit"
        : "debit";
  const balancingLineType = accountLineType === "debit" ? "credit" : "debit";

  return [
    {
      account: account._id,
      type: accountLineType,
      amount,
    },
    {
      account: balancingAccount._id,
      type: balancingLineType,
      amount,
    },
  ];
};

const getManualOpeningQuery = ({ accountId, userId, scope }) => ({
  createdBy: toObjectId(userId),
  referenceId: toObjectId(accountId),
  originModule: getManualAccountOrigin(scope, "opening"),
  sourceType: getOpeningSourceType(scope),
  isDeleted: false,
  isReversed: { $ne: true },
  isReversal: { $ne: true },
  "lines.account": toObjectId(accountId),
});

const getManualOpeningBalanceMap = async ({
  userId,
  accounts = [],
  moduleScope,
}) => {
  const scope = normalizeModuleScope(moduleScope, MODULE_SCOPES.TRADING);

  if (
    ![
      MODULE_SCOPES.TRADING,
      MODULE_SCOPES.TRAVEL,
      MODULE_SCOPES.WEAVING,
    ].includes(scope)
  ) {
    return new Map();
  }

  const accountIds = accounts
    .map((account) => account?._id)
    .filter(Boolean)
    .map((accountId) => toObjectId(accountId));

  if (accountIds.length === 0) {
    return new Map();
  }

  const journals = await JournalEntry.find({
    createdBy: toObjectId(userId),
    referenceId: { $in: accountIds },
    originModule: getManualAccountOrigin(scope, "opening"),
    sourceType: getOpeningSourceType(scope),
    isDeleted: false,
    isReversed: { $ne: true },
    isReversal: { $ne: true },
    "lines.account": { $in: accountIds },
  })
    .select("referenceId lines.account lines.type lines.amount")
    .lean();

  const openingByAccount = new Map();

  for (const journal of journals) {
    const accountId = String(journal.referenceId || "");

    for (const line of journal.lines || []) {
      if (String(line.account || "") !== accountId) continue;

      openingByAccount.set(
        accountId,
        roundMoney(
          Number(openingByAccount.get(accountId) || 0) +
            Number(line.amount || 0),
        ),
      );
    }
  }

  return openingByAccount;
};

const syncManualAccountOpeningBalance = async ({
  account,
  userId,
  scope,
  amount,
}) => {
  const normalizedAmount = parseAmount(amount, {
    allowZero: true,
    label: "Opening balance",
  });

  if (!isBalanceSheetAccountType(account.type) && normalizedAmount > 0) {
    throw makeHttpError(
      "Opening Balance is only allowed for Asset, Liability and Equity accounts.",
      400,
    );
  }

  await JournalEntry.updateMany(
    getManualOpeningQuery({
      accountId: account._id,
      userId,
      scope,
    }),
    {
      $set: {
        isDeleted: true,
        note: "Retired after manual account opening balance update",
      },
    },
  );

  if (normalizedAmount <= 0 || !isBalanceSheetAccountType(account.type)) {
    return null;
  }

  const balancingAccount = await getOrCreateSystemAccount({
    userId,
    scope,
    purpose: "opening",
  });
  const { date, time } = getJournalDateTime();

  return JournalEntry.create({
    date,
    time,
    description: `Opening Balance - ${account.name}`,
    note: "Manual account opening balance",
    sourceType: getOpeningSourceType(scope),
    originModule: getManualAccountOrigin(scope, "opening"),
    moduleScope: scope,
    referenceId: account._id,
    createdBy: toObjectId(userId),
    lines: buildAccountOpeningLines({
      account,
      balancingAccount,
      amount: normalizedAmount,
    }),
  });
};

const getScopedBalanceMap = async ({ userId, accounts = [], moduleScope }) => {
  const ids = accounts
    .map((account) => account?._id)
    .filter(Boolean)
    .map((accountId) => toObjectId(accountId));

  if (ids.length === 0) {
    return new Map();
  }

  const normalBalanceByAccountId = new Map(
    accounts.map((account) => [
      String(account._id),
      String(account.normalBalance || "").toLowerCase(),
    ]),
  );

  const rows = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: toObjectId(userId),
        isDeleted: false,
        "lines.account": { $in: ids },
        ...getJournalScopeFilter(moduleScope),
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: ids },
      },
    },
    {
      $group: {
        _id: "$lines.account",
        debit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
          },
        },
        credit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
          },
        },
      },
    },
  ]);

  return new Map(
    rows.map((row) => {
      const accountId = String(row._id);
      const debit = Number(row.debit || 0);
      const credit = Number(row.credit || 0);
      const normalBalance = normalBalanceByAccountId.get(accountId);
      const balance =
        normalBalance === "credit" ? credit - debit : debit - credit;

      return [accountId, Number(balance.toFixed(2))];
    }),
  );
};

const attachScopedBalances = async ({ userId, accounts = [], moduleScope }) => {
  const plainAccounts = accounts.map((account) =>
    account.toObject ? account.toObject() : { ...account },
  );
  const balanceMap = await getScopedBalanceMap({
    userId,
    accounts: plainAccounts,
    moduleScope,
  });
  const openingBalanceMap = await getManualOpeningBalanceMap({
    userId,
    accounts: plainAccounts,
    moduleScope,
  });

  return plainAccounts.map((account) => ({
    ...account,
    moduleScope: account.moduleScope || MODULE_SCOPES.TRADING,
    balance: balanceMap.get(String(account._id)) || 0,
    manualOpeningBalance: openingBalanceMap.get(String(account._id)) || 0,
  }));
};

const findScopedAccount = async ({ id, userId, moduleScope }) => {
  const query = {
    _id: id,
    userId,
  };

  applyAccountScopeFilter(query, moduleScope);

  return Account.findOne(query);
};

const sendControllerError = (res, error, fallbackMessage) => {
  const statusCode = error.statusCode || 500;

  return res.status(statusCode).json({
    message: error.message || fallbackMessage,
    error: error.message,
  });
};

exports.createAccount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { name, type, category } = req.body;
    const code = String(req.body.code || "").trim();
    const openingBalance = parseAmount(req.body.openingBalance, {
      allowZero: true,
      label: "Opening balance",
    });
    const moduleScope = getAccountScope({ ...req.query, ...req.body });
    const accessScope =
      req.query.moduleScope || req.query.scope || req.query.module
        ? getAccountScope(req.query)
        : moduleScope;

    assertScopeEnabled(req, accessScope);
    assertScopeEnabled(req, moduleScope);

    if (
      accessScope === MODULE_SCOPES.WEAVING &&
      moduleScope !== MODULE_SCOPES.WEAVING
    ) {
      return res.status(403).json({
        message: "New accounts created from Weaving must use Weaving scope.",
      });
    }

    const rule = ACCOUNT_RULES[type];
    if (!rule) {
      return res.status(400).json({ message: "Invalid account type." });
    }

    if (!rule.allowedCategories.includes(category)) {
      return res.status(400).json({
        message: `Category '${category}' is not allowed for ${type} account.`,
      });
    }

    if (openingBalance > 0 && !isBalanceSheetAccountType(type)) {
      return res.status(400).json({
        message:
          "Opening Balance is only allowed for Asset, Liability and Equity accounts.",
      });
    }

    await assertAccountCodeAvailable({ userId, code, moduleScope });

    const newAccount = new Account({
      name,
      type,
      code,
      category,
      userId,
      moduleScope,
      normalBalance: ACCOUNT_RULES.getNormalBalance(type, category),
      openingBalance,
    });

    await newAccount.save();

    try {
      if (openingBalance > 0) {
        await syncManualAccountOpeningBalance({
          account: newAccount,
          userId,
          scope: getJournalContextScope(accessScope),
          amount: openingBalance,
        });
      }
    } catch (openingError) {
      await Account.deleteOne({
        _id: newAccount._id,
        userId,
      });
      throw openingError;
    }

    res.status(201).json({ message: "Account created", account: newAccount });
  } catch (error) {
    console.error("CREATE ACCOUNT ERROR:", error);

    sendControllerError(res, error, "Create failed");
  }
};

exports.getAccounts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getAccountScope(req.query);
    const {
      category,
      type,
      isSystem,
      balance,
      search,
      sortBy,
      sortOrder,
      filter,
    } = req.query;

    assertScopeEnabled(req, moduleScope);

    const query = {
      userId,
      isActive: { $ne: false },
    };

    applyAccountScopeFilter(query, moduleScope);

    if (filter === "payment") {
      query.type = "Asset";
      query.category = { $in: PAYMENT_ACCOUNT_CATEGORIES };
    } else {
      if (category) query.category = category;
      if (type) query.type = type;
    }

    if (category) query.category = category;
    if (type) query.type = type;
    if (isSystem !== undefined) query.isSystem = isSystem === "true";

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    let sort = { code: 1 };
    if (sortBy) {
      const order = sortOrder === "desc" ? -1 : 1;
      sort = { [sortBy]: order };
    }

    const accounts = await Account.find(query).sort(sort);
    const scopedAccounts = await attachScopedBalances({
      userId,
      accounts,
      moduleScope,
    });
    const filteredAccounts =
      balance === "zero"
        ? scopedAccounts.filter((account) => Number(account.balance || 0) === 0)
        : balance === "nonzero"
          ? scopedAccounts.filter(
              (account) => Number(account.balance || 0) !== 0,
            )
          : scopedAccounts;

    res.status(200).json(filteredAccounts);
  } catch (error) {
    sendControllerError(res, error, "Fetch failed");
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const accessScope = getAccountScope(req.query);

    assertScopeEnabled(req, accessScope);

    const account = await findScopedAccount({
      id,
      userId,
      moduleScope: accessScope,
    });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (account.isSystem) {
      const allowedUpdates = ["name", "category"];
      for (const key of Object.keys(req.body)) {
        if (!allowedUpdates.includes(key)) {
          return res.status(403).json({
            message: "Cannot modify protected fields of system account.",
          });
        }
      }
    }

    const nextType = req.body.type || account.type;
    const nextCategory = req.body.category || account.category;
    const nextCode = String(req.body.code || account.code || "").trim();
    const nextModuleScope =
      req.body.moduleScope !== undefined
        ? normalizeModuleScope(
            req.body.moduleScope,
            account.moduleScope || MODULE_SCOPES.TRADING,
          )
        : account.moduleScope || MODULE_SCOPES.TRADING;

    assertScopeEnabled(req, nextModuleScope);

    if (
      accessScope === MODULE_SCOPES.WEAVING &&
      ![MODULE_SCOPES.WEAVING, MODULE_SCOPES.SHARED].includes(nextModuleScope)
    ) {
      return res.status(403).json({
        message: "Weaving accounts cannot modify Trading or Travel accounts.",
      });
    }

    const rule = ACCOUNT_RULES[nextType];
    if (!rule) {
      return res.status(400).json({ message: "Invalid account type." });
    }

    if (!rule.allowedCategories.includes(nextCategory)) {
      return res.status(400).json({
        message: `Category '${nextCategory}' is not allowed for ${nextType} account.`,
      });
    }

    await assertAccountCodeAvailable({
      userId,
      code: nextCode,
      moduleScope: nextModuleScope,
      excludeId: account._id,
    });

    account.name = req.body.name ?? account.name;
    account.type = nextType;
    account.code = nextCode;
    account.category = nextCategory;
    account.moduleScope = nextModuleScope;
    account.normalBalance = ACCOUNT_RULES.getNormalBalance(
      nextType,
      nextCategory,
    );

    await account.save();

    if (
      hasOwn(req.body, "openingBalance") ||
      !isBalanceSheetAccountType(nextType)
    ) {
      const openingBalance = isBalanceSheetAccountType(nextType)
        ? parseAmount(req.body.openingBalance, {
            allowZero: true,
            label: "Opening balance",
          })
        : 0;

      account.openingBalance = openingBalance;
      await account.save();

      await syncManualAccountOpeningBalance({
        account,
        userId,
        scope: getJournalContextScope(accessScope),
        amount: openingBalance,
      });
    }

    res.status(200).json(account);
  } catch (err) {
    sendControllerError(res, err, "Update failed");
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    const account = await findScopedAccount({ id, userId, moduleScope });

    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    if (account.isSystem) {
      return res.status(403).json({
        message: "System account cannot be deleted.",
      });
    }

    const entryExists = await JournalEntry.findOne({
      createdBy: userId,
      "lines.account": account._id,
      isDeleted: false,
    }).select("_id");

    if (entryExists) {
      return res.status(400).json({
        message: "Account is in use in journal entries and cannot be deleted.",
      });
    }

    await account.deleteOne();

    res.status(200).json({ message: "Account deleted" });
  } catch (err) {
    sendControllerError(res, err, "Delete failed");
  }
};

exports.transferBetweenAccounts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getJournalContextScope(getAccountScope(req.query));
    const amount = parseAmount(req.body.amount, {
      label: "Transfer amount",
    });
    const fromAccountId = req.body.fromAccountId;
    const toAccountId = req.body.toAccountId;

    assertScopeEnabled(req, moduleScope);

    if (
      !mongoose.Types.ObjectId.isValid(fromAccountId) ||
      !mongoose.Types.ObjectId.isValid(toAccountId)
    ) {
      throw makeHttpError("Valid From and To accounts are required.", 400);
    }

    if (String(fromAccountId) === String(toAccountId)) {
      throw makeHttpError("From and To accounts cannot be the same.", 400);
    }

    const [fromAccount, toAccount] = await Promise.all([
      findScopedAccount({
        id: fromAccountId,
        userId,
        moduleScope,
      }),
      findScopedAccount({
        id: toAccountId,
        userId,
        moduleScope,
      }),
    ]);

    if (!fromAccount || !toAccount) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isTransferAccount(fromAccount) || !isTransferAccount(toAccount)) {
      throw makeHttpError(
        "Transfers are allowed only between cash, bank, online and cheque Asset accounts.",
        400,
      );
    }

    const { date, time } = getJournalDateTime(req.body.date);

    if (await isPeriodLocked(userId, date)) {
      throw makeHttpError("This accounting period is locked.", 403);
    }

    const note = String(req.body.note || req.body.reference || "").trim();
    const journal = await JournalEntry.create({
      date,
      time,
      description: `Account Transfer - ${fromAccount.name} to ${toAccount.name}`,
      note,
      sourceType: "account_transfer",
      originModule: getManualAccountOrigin(moduleScope, "transfer"),
      moduleScope,
      createdBy: toObjectId(userId),
      lines: [
        {
          account: toAccount._id,
          type: "debit",
          amount,
        },
        {
          account: fromAccount._id,
          type: "credit",
          amount,
        },
      ],
    });

    await recalculateAccountBalances([fromAccount._id, toAccount._id]);

    await logAudit({
      userId,
      action: "CREATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: null,
      after: journal.toObject(),
    });

    return res.status(201).json({
      message: "Transfer recorded",
      journal,
    });
  } catch (error) {
    console.error("ACCOUNT TRANSFER ERROR:", error);
    return sendControllerError(res, error, "Transfer failed");
  }
};

exports.getAccountTransfer = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transfer ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: "account_transfer",
      isDeleted: false,
    })
      .populate("lines.account", "name type category code moduleScope")
      .lean();

    if (!journal) {
      return res.status(404).json({ message: "Account transfer not found." });
    }

    assertScopeEnabled(req, journal.moduleScope);

    const debitLine = (journal.lines || []).find((l) => l.type === "debit");
    const creditLine = (journal.lines || []).find((l) => l.type === "credit");
    const amount = debitLine ? Number(debitLine.amount || 0) : 0;

    return res.status(200).json({
      _id: journal._id,
      fromAccountId: creditLine?.account?._id || creditLine?.account,
      fromAccount: creditLine?.account || null,
      toAccountId: debitLine?.account?._id || debitLine?.account,
      toAccount: debitLine?.account || null,
      amount,
      date: journal.date,
      time: journal.time || "",
      note: journal.note || "",
      description: journal.description || "",
      moduleScope: journal.moduleScope,
      originModule: journal.originModule,
    });
  } catch (error) {
    console.error("GET ACCOUNT TRANSFER ERROR:", error);
    return sendControllerError(res, error, "Failed to get transfer");
  }
};

exports.updateAccountTransfer = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transfer ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: "account_transfer",
      isDeleted: false,
    });

    if (!journal) {
      return res.status(404).json({ message: "Account transfer not found." });
    }

    const moduleScope = journal.moduleScope;
    assertScopeEnabled(req, moduleScope);

    const fromAccountId = req.body.fromAccountId;
    const toAccountId = req.body.toAccountId;
    const amount = parseAmount(req.body.amount, { label: "Transfer amount" });

    if (
      !mongoose.Types.ObjectId.isValid(fromAccountId) ||
      !mongoose.Types.ObjectId.isValid(toAccountId)
    ) {
      throw makeHttpError("Valid From and To accounts are required.", 400);
    }

    if (String(fromAccountId) === String(toAccountId)) {
      throw makeHttpError("From and To accounts cannot be the same.", 400);
    }

    const [fromAccount, toAccount] = await Promise.all([
      findScopedAccount({ id: fromAccountId, userId, moduleScope }),
      findScopedAccount({ id: toAccountId, userId, moduleScope }),
    ]);

    if (!fromAccount || !toAccount) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isTransferAccount(fromAccount) || !isTransferAccount(toAccount)) {
      throw makeHttpError(
        "Transfers are allowed only between cash, bank, online and cheque Asset accounts.",
        400,
      );
    }

    if (await isPeriodLocked(userId, journal.date)) {
      throw makeHttpError(
        "The original transaction period is locked and cannot be edited.",
        403,
      );
    }

    const { date: newDate, time: newTime } = getJournalDateTime(req.body.date);
    if (await isPeriodLocked(userId, newDate)) {
      throw makeHttpError("The target transaction period is locked.", 403);
    }

    const beforeUpdate = journal.toObject();
    const oldAccountIds = (journal.lines || []).map((l) =>
      l.account.toString(),
    );

    const note = String(req.body.note || req.body.reference || "").trim();
    journal.date = newDate;
    journal.time = newTime;
    journal.description = `Account Transfer - ${fromAccount.name} to ${toAccount.name}`;
    journal.note = note;
    journal.lines = [
      {
        account: toAccount._id,
        type: "debit",
        amount,
      },
      {
        account: fromAccount._id,
        type: "credit",
        amount,
      },
    ];

    await journal.save();

    const allInvolvedIds = [
      ...new Set([
        ...oldAccountIds,
        fromAccount._id.toString(),
        toAccount._id.toString(),
      ]),
    ];
    await recalculateAccountBalances(allInvolvedIds);

    await logAudit({
      userId,
      action: "UPDATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: beforeUpdate,
      after: journal.toObject(),
    });

    return res.status(200).json({
      message: "Transfer updated",
      journal,
    });
  } catch (error) {
    console.error("UPDATE ACCOUNT TRANSFER ERROR:", error);
    return sendControllerError(res, error, "Transfer update failed");
  }
};

exports.adjustAccountBalance = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getJournalContextScope(getAccountScope(req.query));
    const amount = parseAmount(req.body.amount, {
      label: "Adjustment amount",
    });
    const accountId = req.body.accountId;
    const direction = String(req.body.direction || "")
      .trim()
      .toLowerCase();

    assertScopeEnabled(req, moduleScope);

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      throw makeHttpError("Valid account is required.", 400);
    }

    if (!["increase", "decrease"].includes(direction)) {
      throw makeHttpError(
        "Adjustment direction must be increase or decrease.",
        400,
      );
    }

    const account = await findScopedAccount({
      id: accountId,
      userId,
      moduleScope,
    });

    if (!account) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isManualAdjustmentAccount(account)) {
      throw makeHttpError(
        "Balance Adjustment is allowed only for manually usable balance accounts.",
        400,
      );
    }

    const { date, time } = getJournalDateTime(req.body.date);

    if (await isPeriodLocked(userId, date)) {
      throw makeHttpError("This accounting period is locked.", 403);
    }

    const balancingAccount = await getOrCreateSystemAccount({
      userId,
      scope: moduleScope,
      purpose: "adjustment",
    });
    const note = String(req.body.note || req.body.reason || "").trim();
    const journal = await JournalEntry.create({
      date,
      time,
      description: `Account Balance Adjustment - ${account.name}`,
      note,
      sourceType: getAdjustmentSourceType(moduleScope),
      originModule: getManualAccountOrigin(moduleScope, "adjustment"),
      moduleScope,
      referenceId: account._id,
      createdBy: toObjectId(userId),
      lines: buildAdjustmentLines({
        account,
        balancingAccount,
        amount,
        direction,
      }),
    });

    await recalculateAccountBalances([account._id, balancingAccount._id]);

    await logAudit({
      userId,
      action: "CREATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: null,
      after: journal.toObject(),
    });

    return res.status(201).json({
      message: "Adjustment recorded",
      journal,
    });
  } catch (error) {
    console.error("ACCOUNT ADJUSTMENT ERROR:", error);
    return sendControllerError(res, error, "Adjustment failed");
  }
};

exports.getAccountAdjustment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid adjustment ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: { $in: ["adjustment", "travel_adjustment"] },
      isDeleted: false,
    })
      .populate("lines.account", "name type category code moduleScope")
      .lean();

    if (!journal) {
      return res.status(404).json({ message: "Adjustment not found." });
    }

    assertScopeEnabled(req, journal.moduleScope);

    let adjustedLine = (journal.lines || []).find(
      (l) =>
        String(l.account?._id || l.account) === String(journal.referenceId),
    );
    if (!adjustedLine) {
      adjustedLine = (journal.lines || []).find(
        (l) =>
          !RESERVED_BALANCING_ACCOUNT_CODES.includes(
            String(l.account?.code || "").toUpperCase(),
          ),
      );
    }
    if (!adjustedLine && journal.lines?.length) {
      adjustedLine = journal.lines[0];
    }

    const account = adjustedLine?.account || null;
    const accountType = account?.type || "Asset";
    const lineType = adjustedLine?.type || "debit";
    const amount = adjustedLine ? Number(adjustedLine.amount || 0) : 0;

    let direction = "increase";
    if (accountType === "Asset") {
      direction = lineType === "debit" ? "increase" : "decrease";
    } else {
      direction = lineType === "credit" ? "increase" : "decrease";
    }

    return res.status(200).json({
      _id: journal._id,
      accountId: account?._id || adjustedLine?.account,
      account,
      amount,
      direction,
      date: journal.date,
      time: journal.time || "",
      note: journal.note || "",
      description: journal.description || "",
      moduleScope: journal.moduleScope,
      originModule: journal.originModule,
    });
  } catch (error) {
    console.error("GET ACCOUNT ADJUSTMENT ERROR:", error);
    return sendControllerError(res, error, "Failed to get adjustment");
  }
};

exports.updateAccountAdjustment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid adjustment ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: { $in: ["adjustment", "travel_adjustment"] },
      isDeleted: false,
    });

    if (!journal) {
      return res.status(404).json({ message: "Adjustment not found." });
    }

    const moduleScope = journal.moduleScope;
    assertScopeEnabled(req, moduleScope);

    const accountId = req.body.accountId;
    const amount = parseAmount(req.body.amount, { label: "Adjustment amount" });
    const direction = String(req.body.direction || "")
      .trim()
      .toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      throw makeHttpError("Valid account is required.", 400);
    }

    if (!["increase", "decrease"].includes(direction)) {
      throw makeHttpError(
        "Adjustment direction must be increase or decrease.",
        400,
      );
    }

    const account = await findScopedAccount({
      id: accountId,
      userId,
      moduleScope,
    });
    if (!account) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isManualAdjustmentAccount(account)) {
      throw makeHttpError(
        "Balance Adjustment is allowed only for manually usable balance accounts.",
        400,
      );
    }

    if (await isPeriodLocked(userId, journal.date)) {
      throw makeHttpError(
        "The original transaction period is locked and cannot be edited.",
        403,
      );
    }

    const { date: newDate, time: newTime } = getJournalDateTime(req.body.date);
    if (await isPeriodLocked(userId, newDate)) {
      throw makeHttpError("The target transaction period is locked.", 403);
    }

    const balancingAccount = await getOrCreateSystemAccount({
      userId,
      scope: moduleScope,
      purpose: "adjustment",
    });

    const beforeUpdate = journal.toObject();
    const oldAccountIds = (journal.lines || []).map((l) =>
      l.account.toString(),
    );

    const note = String(req.body.note || req.body.reason || "").trim();
    journal.date = newDate;
    journal.time = newTime;
    journal.description = `Account Balance Adjustment - ${account.name}`;
    journal.note = note;
    journal.referenceId = account._id;
    journal.lines = buildAdjustmentLines({
      account,
      balancingAccount,
      amount,
      direction,
    });

    await journal.save();

    const allInvolvedIds = [
      ...new Set([
        ...oldAccountIds,
        account._id.toString(),
        balancingAccount._id.toString(),
      ]),
    ];
    await recalculateAccountBalances(allInvolvedIds);

    await logAudit({
      userId,
      action: "UPDATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: beforeUpdate,
      after: journal.toObject(),
    });

    return res.status(200).json({
      message: "Adjustment updated",
      journal,
    });
  } catch (error) {
    console.error("UPDATE ACCOUNT ADJUSTMENT ERROR:", error);
    return sendControllerError(res, error, "Adjustment update failed");
  }
};

const buildOwnerMoneyLines = ({
  account,
  equityAccount,
  amount,
  transactionType,
}) => {
  if (transactionType === "owner_money_in") {
    return [
      {
        account: account._id,
        type: "debit",
        amount,
      },
      {
        account: equityAccount._id,
        type: "credit",
        amount,
      },
    ];
  }

  return [
    {
      account: equityAccount._id,
      type: "debit",
      amount,
    },
    {
      account: account._id,
      type: "credit",
      amount,
    },
  ];
};

exports.createOwnerTransaction = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getJournalContextScope(getAccountScope(req.query));
    assertScopeEnabled(req, moduleScope);

    const transactionType = String(
      req.body.transactionType || req.body.type || "",
    )
      .trim()
      .toLowerCase();

    if (!["owner_money_in", "owner_money_out"].includes(transactionType)) {
      throw makeHttpError(
        "Transaction type must be 'owner_money_in' or 'owner_money_out'.",
        400,
      );
    }

    const amount = parseAmount(req.body.amount, { label: "Amount" });
    const accountId = req.body.accountId;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      throw makeHttpError("Valid payment account is required.", 400);
    }

    const account = await findScopedAccount({
      id: accountId,
      userId,
      moduleScope,
    });
    if (!account) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isTransferAccount(account)) {
      throw makeHttpError(
        "Owner Money transactions are allowed only with cash, bank, online or cheque accounts.",
        400,
      );
    }

    const { date, time } = getJournalDateTime(req.body.date);

    if (await isPeriodLocked(userId, date)) {
      throw makeHttpError("This accounting period is locked.", 403);
    }

    const purpose =
      transactionType === "owner_money_in" ? "capital" : "drawings";
    const equityAccount = await getOrCreateSystemAccount({
      userId,
      scope: moduleScope,
      purpose,
    });

    const note = String(req.body.note || req.body.reference || "").trim();
    const description =
      transactionType === "owner_money_in"
        ? `Owner Money In - ${account.name}`
        : `Owner Money Out - ${account.name}`;

    const journal = await JournalEntry.create({
      date,
      time,
      description,
      note,
      sourceType: transactionType,
      originModule: getManualAccountOrigin(moduleScope, "owner"),
      moduleScope,
      referenceId: account._id,
      createdBy: toObjectId(userId),
      lines: buildOwnerMoneyLines({
        account,
        equityAccount,
        amount,
        transactionType,
      }),
    });

    await recalculateAccountBalances([account._id, equityAccount._id]);

    await logAudit({
      userId,
      action: "CREATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: null,
      after: journal.toObject(),
    });

    return res.status(201).json({
      message: "Owner transaction recorded",
      journal,
    });
  } catch (error) {
    console.error("CREATE OWNER TRANSACTION ERROR:", error);
    return sendControllerError(res, error, "Owner transaction failed");
  }
};

exports.getOwnerTransaction = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transaction ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: { $in: ["owner_money_in", "owner_money_out"] },
      isDeleted: false,
    })
      .populate("lines.account", "name type category code moduleScope")
      .lean();

    if (!journal) {
      return res.status(404).json({ message: "Owner transaction not found." });
    }

    assertScopeEnabled(req, journal.moduleScope);

    let paymentLine = (journal.lines || []).find(
      (l) =>
        l.account?.type === "Asset" ||
        String(l.account?._id || l.account) === String(journal.referenceId),
    );
    if (!paymentLine && journal.lines?.length) {
      paymentLine = journal.lines.find(
        (l) => !["capital", "drawings"].includes(l.account?.category),
      );
    }
    const paymentAccount = paymentLine?.account || null;
    const amount = paymentLine ? Number(paymentLine.amount || 0) : 0;

    return res.status(200).json({
      _id: journal._id,
      transactionType: journal.sourceType,
      accountId: paymentAccount?._id || paymentLine?.account,
      account: paymentAccount,
      amount,
      date: journal.date,
      time: journal.time || "",
      note: journal.note || "",
      description: journal.description || "",
      moduleScope: journal.moduleScope,
      originModule: journal.originModule,
    });
  } catch (error) {
    console.error("GET OWNER TRANSACTION ERROR:", error);
    return sendControllerError(res, error, "Failed to get owner transaction");
  }
};

exports.updateOwnerTransaction = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid transaction ID." });
    }

    const journal = await JournalEntry.findOne({
      _id: id,
      createdBy: userId,
      sourceType: { $in: ["owner_money_in", "owner_money_out"] },
      isDeleted: false,
    });

    if (!journal) {
      return res.status(404).json({ message: "Owner transaction not found." });
    }

    const moduleScope = journal.moduleScope;
    assertScopeEnabled(req, moduleScope);

    const transactionType = String(
      req.body.transactionType || req.body.type || journal.sourceType,
    )
      .trim()
      .toLowerCase();

    if (!["owner_money_in", "owner_money_out"].includes(transactionType)) {
      throw makeHttpError(
        "Transaction type must be 'owner_money_in' or 'owner_money_out'.",
        400,
      );
    }

    const amount = parseAmount(req.body.amount, { label: "Amount" });
    const accountId = req.body.accountId;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      throw makeHttpError("Valid payment account is required.", 400);
    }

    const account = await findScopedAccount({
      id: accountId,
      userId,
      moduleScope,
    });
    if (!account) {
      throw makeHttpError("Selected account not found in this module.", 404);
    }

    if (!isTransferAccount(account)) {
      throw makeHttpError(
        "Owner Money transactions are allowed only with cash, bank, online or cheque accounts.",
        400,
      );
    }

    if (await isPeriodLocked(userId, journal.date)) {
      throw makeHttpError(
        "The original transaction period is locked and cannot be edited.",
        403,
      );
    }

    const { date: newDate, time: newTime } = getJournalDateTime(req.body.date);
    if (await isPeriodLocked(userId, newDate)) {
      throw makeHttpError("The target transaction period is locked.", 403);
    }

    const purpose =
      transactionType === "owner_money_in" ? "capital" : "drawings";
    const equityAccount = await getOrCreateSystemAccount({
      userId,
      scope: moduleScope,
      purpose,
    });

    const beforeUpdate = journal.toObject();
    const oldAccountIds = (journal.lines || []).map((l) =>
      l.account.toString(),
    );

    const note = String(req.body.note || req.body.reference || "").trim();
    const description =
      transactionType === "owner_money_in"
        ? `Owner Money In - ${account.name}`
        : `Owner Money Out - ${account.name}`;

    journal.date = newDate;
    journal.time = newTime;
    journal.description = description;
    journal.note = note;
    journal.sourceType = transactionType;
    journal.referenceId = account._id;
    journal.lines = buildOwnerMoneyLines({
      account,
      equityAccount,
      amount,
      transactionType,
    });

    await journal.save();

    const allInvolvedIds = [
      ...new Set([
        ...oldAccountIds,
        account._id.toString(),
        equityAccount._id.toString(),
      ]),
    ];
    await recalculateAccountBalances(allInvolvedIds);

    await logAudit({
      userId,
      action: "UPDATE",
      entityType: "JournalEntry",
      entityId: journal._id,
      before: beforeUpdate,
      after: journal.toObject(),
    });

    return res.status(200).json({
      message: "Owner transaction updated",
      journal,
    });
  } catch (error) {
    console.error("UPDATE OWNER TRANSACTION ERROR:", error);
    return sendControllerError(res, error, "Owner transaction update failed");
  }
};

exports.getCashSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    const query = {
      userId,
      category: "cash",
      isActive: { $ne: false },
    };

    applyAccountScopeFilter(query, moduleScope);

    const cashAccount = await Account.findOne(query).sort({ name: 1, _id: 1 });

    if (!cashAccount) {
      return res.status(404).json({ message: "No cash account found" });
    }

    const [scopedCashAccount] = await attachScopedBalances({
      userId,
      accounts: [cashAccount],
      moduleScope,
    });

    res.json({
      _id: scopedCashAccount._id,
      name: scopedCashAccount.name,
      balance: scopedCashAccount.balance || 0,
      moduleScope: scopedCashAccount.moduleScope,
    });
  } catch (err) {
    sendControllerError(res, err, "Cash summary error");
  }
};

exports.getBankSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    const query = {
      userId,
      category: { $in: BANK_ACCOUNT_CATEGORIES },
      isActive: { $ne: false },
    };

    applyAccountScopeFilter(query, moduleScope);

    const bankAccounts = await Account.find(query).sort({ name: 1, _id: 1 });
    const scopedBankAccounts = await attachScopedBalances({
      userId,
      accounts: bankAccounts,
      moduleScope,
    });
    const totalBank = scopedBankAccounts.reduce(
      (sum, account) => sum + Number(account.balance || 0),
      0,
    );

    res.json({
      totalBank: Number(totalBank.toFixed(2)),
      accounts: scopedBankAccounts.map((account) => ({
        _id: account._id,
        name: account.name,
        balance: account.balance || 0,
        moduleScope: account.moduleScope,
      })),
    });
  } catch (err) {
    sendControllerError(res, err, "Bank summary error");
  }
};

exports.getAccountTransactions = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id: accountId } = req.params;
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        message: "Invalid or missing account ID",
      });
    }

    const account = await findScopedAccount({
      id: accountId,
      userId,
      moduleScope,
    });

    if (!account) {
      return res.status(404).json({
        message: "Account not found",
      });
    }

    const accountObjectId = new mongoose.Types.ObjectId(accountId);

    const transactionQuery = {
      createdBy: userId,
      "lines.account": accountObjectId,
      isDeleted: false,
      ...getJournalScopeFilter(moduleScope),
    };

    if (moduleScope === MODULE_SCOPES.TRAVEL) {
      transactionQuery.isReversed = { $ne: true };
      transactionQuery.isReversal = { $ne: true };
    }

    const transactions = await JournalEntry.find(transactionQuery)
      .select(
        [
          "date",
          "time",
          "description",
          "billNo",
          "sourceType",
          "originModule",
          "moduleScope",
          "invoiceId",
          "invoiceModel",
          "referenceId",
          "customerId",
          "supplierId",
          "partyId",
          "lines",
          "createdAt",
        ].join(" "),
      )
      .sort({
        date: -1,
        time: -1,
        createdAt: -1,
      })
      .limit(200)
      .lean();

    const flatEntries = transactions.flatMap((entry) =>
      (entry.lines || [])
        .filter((line) => line.account?.toString() === accountId.toString())
        .map((line) => {
          const debit = line.type === "debit" ? Number(line.amount || 0) : 0;
          const credit = line.type === "credit" ? Number(line.amount || 0) : 0;
          const clickableReferenceId =
            entry.referenceId || entry.invoiceId || entry._id || null;

          return {
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || "",
            billNo: entry.billNo || "",
            debit,
            credit,
            sourceType: entry.sourceType || "",
            referenceType: entry.sourceType || "",
            originModule: entry.originModule || "",
            moduleScope: entry.moduleScope || "",
            referenceId: clickableReferenceId,
            invoiceId: entry.invoiceId || null,
            invoiceModel: entry.invoiceModel || null,
            customerId: entry.customerId || null,
            supplierId: entry.supplierId || null,
            partyId: entry.partyId || null,
            paymentType: line.paymentType || "-",
            accountName: account.name || "",
            accountModuleScope: account.moduleScope || MODULE_SCOPES.TRADING,
          };
        }),
    );

    return res.status(200).json(flatEntries);
  } catch (err) {
    console.error("Account transactions error:", err);

    return sendControllerError(
      res,
      err,
      "Server error while fetching transactions",
    );
  }
};

exports.getBalanceSnapshot = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    const query = { userId };

    applyAccountScopeFilter(query, moduleScope);

    const accounts = await Account.find(query);
    const scopedAccounts = await attachScopedBalances({
      userId,
      accounts,
      moduleScope,
    });

    const summary = {};
    for (const account of scopedAccounts) {
      const category = account.category || "uncategorized";
      if (!summary[category]) summary[category] = 0;
      summary[category] = Number(
        (summary[category] + Number(account.balance || 0)).toFixed(2),
      );
    }

    res.json(summary);
  } catch (err) {
    console.error("Balance snapshot error:", err);
    sendControllerError(res, err, "Snapshot error");
  }
};

exports.getAccountsSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getAccountScope(req.query);

    assertScopeEnabled(req, moduleScope);

    const query = { userId };

    applyAccountScopeFilter(query, moduleScope);

    const accounts = await Account.find(query);
    const scopedAccounts = await attachScopedBalances({
      userId,
      accounts,
      moduleScope,
    });

    const summary = {
      total: scopedAccounts.length,
      system: scopedAccounts.filter((account) => account.isSystem).length,
      user: scopedAccounts.filter((account) => !account.isSystem).length,
      zeroBalance: scopedAccounts.filter(
        (account) => Number(account.balance || 0) === 0,
      ).length,
      nonZeroBalance: scopedAccounts.filter(
        (account) => Number(account.balance || 0) !== 0,
      ).length,
    };

    res.json(summary);
  } catch (err) {
    sendControllerError(res, err, "Accounts summary error");
  }
};
