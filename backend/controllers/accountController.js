const mongoose = require("mongoose");

const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const ACCOUNT_RULES = require("../utils/accountRules");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  getRequestedModuleScope,
  normalizeModuleScope,
} = require("../utils/moduleScope");
const {
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
} = require("../utils/businessValueModuleScope");

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

const PAYMENT_ACCOUNT_CATEGORIES = Object.freeze([
  "cash",
  "bank",
  "online",
  "cheque",
]);
const BANK_ACCOUNT_CATEGORIES = Object.freeze(["bank"]);

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
  { originModule: { $in: TRAVEL_ACCOUNT_ORIGINS } },
  { sourceType: { $in: TRAVEL_ACCOUNT_SOURCE_TYPES } },
  {
    sourceType: "reversal",
    originModule: { $in: TRAVEL_ACCOUNT_ORIGINS },
  },
];

const getJournalScopeFilter = (scope = MODULE_SCOPES.TRADING) => {
  if (scope === MODULE_SCOPES.TRAVEL) {
    return { $or: getTravelJournalConditions() };
  }

  if (scope === MODULE_SCOPES.TRADING) {
    return { $nor: getTravelJournalConditions() };
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

  if (moduleScope === MODULE_SCOPES.BOTH || moduleScope === "all") {
    query.$or = [
      { moduleScope: { $exists: false } },
      { moduleScope: null },
      { moduleScope: "" },
      {
        moduleScope: {
          $in: [
            MODULE_SCOPES.TRADING,
            MODULE_SCOPES.TRAVEL,
            MODULE_SCOPES.BOTH,
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

  return plainAccounts.map((account) => ({
    ...account,
    moduleScope: account.moduleScope || MODULE_SCOPES.TRADING,
    balance: balanceMap.get(String(account._id)) || 0,
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
    const moduleScope = getAccountScope({ ...req.query, ...req.body });
    const accessScope =
      req.query.moduleScope || req.query.scope || req.query.module
        ? getAccountScope(req.query)
        : moduleScope;

    assertScopeEnabled(req, accessScope);
    assertScopeEnabled(req, moduleScope);

    const rule = ACCOUNT_RULES[type];
    if (!rule) {
      return res.status(400).json({ message: "Invalid account type." });
    }

    if (!rule.allowedCategories.includes(category)) {
      return res.status(400).json({
        message: `Category '${category}' is not allowed for ${type} account.`,
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
      normalBalance: rule.normalBalance,
    });

    await newAccount.save();

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
    account.normalBalance = rule.normalBalance;

    await account.save();

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
            entry.referenceId || entry.invoiceId || null;

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
