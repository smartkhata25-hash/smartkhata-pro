const Expense = require("../models/Expense");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const ExpenseTitle = require("../models/ExpenseTitle");
const mongoose = require("mongoose");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { isBalanced } = require("../utils/journalHelper");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  documentMatchesModuleScope,
  getRequestedModuleScope,
  normalizeModuleScope,
} = require("../utils/moduleScope");
const {
  applyExpenseTitleScopeFilter,
} = require("../utils/expenseTitleScope");
const { clearTravelReportCache } = require("../services/travel/travelReportCacheService");
const {
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../services/travel/travelSoftDeleteService");
const {
  getBusinessDateKey,
  parseBusinessDateTime,
} = require("../utils/businessDate");
const fs = require("fs");
const path = require("path");

const TRAVEL_EXPENSE_ORIGIN = "travel_expense";
const WEAVING_EXPENSE_ORIGIN = "weaving_expense";
const TRAVEL_EXPENSE_SCOPES = new Set([MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH]);
const EXPENSE_BUSINESS_SCOPES = Object.freeze([
  MODULE_SCOPES.TRADING,
  MODULE_SCOPES.TRAVEL,
  MODULE_SCOPES.WEAVING,
  MODULE_SCOPES.BOTH,
]);
const PAYMENT_ACCOUNT_CATEGORIES = Object.freeze(["cash", "bank", "online", "cheque"]);

const makeHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeExpenseModuleScope = (
  value,
  fallback = MODULE_SCOPES.TRADING,
) => {
  const normalized = normalizeModuleScope(value, fallback);

  if (!EXPENSE_BUSINESS_SCOPES.includes(normalized)) {
    throw makeHttpError("Expenses must belong to Trading, Travel or Weaving.", 400);
  }

  return normalized;
};

const getExpenseScope = (
  source = {},
  fallback = MODULE_SCOPES.TRADING,
  options = {},
) => {
  const requested = getRequestedModuleScope(source, fallback);

  if (requested === "all") {
    if (options.allowAll) {
      return "all";
    }

    throw makeHttpError("Expenses must belong to a single business module.", 400);
  }

  if (requested === MODULE_SCOPES.SHARED) {
    throw makeHttpError("Expenses cannot use shared account scope.", 400);
  }

  if (requested === MODULE_SCOPES.BOTH && options.disallowBoth) {
    throw makeHttpError("New expenses must belong to a single business module.", 400);
  }

  return normalizeExpenseModuleScope(requested, fallback);
};

const assertExpenseScopeEnabled = (req, moduleScope) => {
  if (moduleScope === "all") {
    return;
  }

  const enabledModules = req.user?.enabledModules || {};

  if (moduleScope === MODULE_SCOPES.BOTH) {
    if (
      enabledModules[MODULE_SCOPES.TRADING] === false ||
      enabledModules[MODULE_SCOPES.TRAVEL] !== true
    ) {
      throw makeHttpError("This business module is not enabled", 403);
    }

    return;
  }

  const enabled =
    moduleScope === MODULE_SCOPES.TRADING
      ? enabledModules[MODULE_SCOPES.TRADING] !== false
      : enabledModules[moduleScope] === true;

  if (!enabled) {
    throw makeHttpError("This business module is not enabled", 403);
  }
};

const assertExpenseAccessible = (expense, moduleScope) => {
  if (moduleScope === "all") {
    return;
  }

  if (!documentMatchesModuleScope(expense, moduleScope)) {
    throw makeHttpError("Expense not found in this module.", 404);
  }
};

const getExpenseOriginModule = (moduleScope) => {
  if (moduleScope === MODULE_SCOPES.WEAVING) {
    return WEAVING_EXPENSE_ORIGIN;
  }

  return TRAVEL_EXPENSE_SCOPES.has(moduleScope) ? TRAVEL_EXPENSE_ORIGIN : "";
};

const validateScopedExpenseAccounts = async ({
  userId,
  moduleScope,
  debitAccountId,
  creditEntries = [],
}) => {
  const accountIds = [
    debitAccountId,
    ...creditEntries.map((entry) => entry.account),
  ]
    .filter(Boolean)
    .map((id) => String(id));
  const uniqueAccountIds = [...new Set(accountIds)];

  if (uniqueAccountIds.length === 0) {
    const error = new Error("Expense accounts are required");
    error.statusCode = 400;
    throw error;
  }

  const query = {
    _id: { $in: uniqueAccountIds },
    userId,
    isActive: { $ne: false },
  };

  applyModuleScopeFilter(query, moduleScope);

  const matchedAccounts = await Account.find(query)
    .select("_id type category moduleScope")
    .lean();

  if (matchedAccounts.length !== uniqueAccountIds.length) {
    const error = new Error("One or more selected accounts are not available in this module.");
    error.statusCode = 400;
    throw error;
  }

  const accountsById = new Map(
    matchedAccounts.map((account) => [String(account._id), account]),
  );
  const debitAccount = accountsById.get(String(debitAccountId));

  if (
    !debitAccount ||
    debitAccount.type !== "Expense" ||
    !documentMatchesModuleScope(debitAccount, moduleScope)
  ) {
    throw makeHttpError("Expense category is not available in this module.", 400);
  }

  for (const entry of creditEntries) {
    const creditAccount = accountsById.get(String(entry.account || ""));

    if (
      !creditAccount ||
      creditAccount.type !== "Asset" ||
      !PAYMENT_ACCOUNT_CATEGORIES.includes(creditAccount.category) ||
      !documentMatchesModuleScope(creditAccount, moduleScope)
    ) {
      throw makeHttpError(
        "Payment account must be a cash, bank, online or cheque account available in this module.",
        400,
      );
    }
  }
};

// ✅ Create Expense with Journal Entry (UPDATED WITH TITLE MAPPING)
exports.createExpense = async (req, res) => {
  try {
    const {
      title,
      titleId,
      category,
      date,
      time,
      amount,
      paymentType,
      description,
      moduleScope,
    } = req.body;

    const creditEntries = JSON.parse(req.body.creditEntries || "[]");
    const userId = req.user?.id || req.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const normalizedModuleScope = getExpenseScope(
      { ...req.query, ...req.body },
      MODULE_SCOPES.TRADING,
    );

    assertExpenseScopeEnabled(req, normalizedModuleScope);

    if (!titleId && !category) {
      return res.status(400).json({
        error: "Either titleId or category is required",
      });
    }

    let finalCategory = category;
    let finalTitle = title || "";

    if (titleId) {
      const titleQuery = {
        _id: titleId,
        userId,
        isDeleted: false,
      };

      applyExpenseTitleScopeFilter(titleQuery, normalizedModuleScope);

      const titleDoc = await ExpenseTitle.findOne(titleQuery);

      if (!titleDoc) {
        return res.status(400).json({
          error: "Invalid expense title",
        });
      }

      finalCategory = titleDoc.categoryId;
      finalTitle = titleDoc.name;
    }

    if (!finalCategory) {
      return res.status(400).json({
        error: "Category is required",
      });
    }

    const numericAmount = Number(amount);
    const businessDate = getBusinessDateKey(date, {
      fallback: new Date(),
      label: "expense date",
    });
    const businessTime = time || "";
    const journalDate = parseBusinessDateTime(businessDate, businessTime, {
      defaultTime: "00:00",
      label: "expense date",
    });

    const totalCredit = creditEntries.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    );

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !Number.isFinite(totalCredit) ||
      Math.abs(totalCredit - numericAmount) > 0.001
    ) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }
    const lines = [
      {
        account: finalCategory,
        type: "debit",
        amount: numericAmount,
      },
      ...creditEntries.map((entry) => ({
        account: entry.account,
        type: "credit",
        amount: Number(entry.amount),
        paymentType:
          entry.paymentType?.toLowerCase() ||
          paymentType?.toLowerCase() ||
          "cash",
      })),
    ];

    await validateScopedExpenseAccounts({
      userId,
      moduleScope: normalizedModuleScope,
      debitAccountId: finalCategory,
      creditEntries,
    });

    if (!isBalanced(lines)) {
      return res.status(400).json({
        message:
          "Journal entry is not balanced. Debit and credit must be equal.",
      });
    }

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : null;

    const expense = new Expense({
      title: finalTitle,
      category: finalCategory,
      date: businessDate,
      time: businessTime,
      amount: numericAmount,
      paymentType,
      account: null,
      description,
      attachment: attachmentPath,
      userId,
      titleId: titleId || null,
      moduleScope: normalizedModuleScope,
    });

    await expense.save();

    const journal = new JournalEntry({
      date: journalDate,
      time: businessTime,
      description: finalTitle || description || "Expense Entry",
      createdBy: userId,
      sourceType: "expense",
      originModule: getExpenseOriginModule(normalizedModuleScope),
      moduleScope: normalizedModuleScope,
      referenceId: expense._id,
      lines,
    });

    await journal.save();

    expense.journalEntryId = journal._id;
    await expense.save();

    const allAccounts = [finalCategory, ...creditEntries.map((e) => e.account)];
    for (const acc of allAccounts) {
      await recalculateAccountBalance(acc);
    }

    if (TRAVEL_EXPENSE_SCOPES.has(normalizedModuleScope)) {
      clearTravelReportCache(userId);
    }

    res.status(201).json({
      message: "Expense created successfully",
      data: expense,
    });
  } catch (err) {
    console.error("❌ Error creating expense:", err);
    res.status(err.statusCode || 500).json({ error: err.message || "Internal server error" });
  }
};

// ✅ Update Expense (UPDATED WITH TITLE MAPPING)
exports.updateExpense = async (req, res) => {
  try {
    const {
      title,
      titleId,
      category,
      date,
      time,
      amount,
      paymentType,
      description,
      moduleScope,
    } = req.body;

    const creditEntries = JSON.parse(req.body.creditEntries || "[]");
    const userId = req.user?.id || req.userId;
    const requestedScope = getExpenseScope(
      { ...req.query, ...req.body },
      MODULE_SCOPES.TRADING,
    );

    assertExpenseScopeEnabled(req, requestedScope);

    if (!titleId && !category) {
      return res.status(400).json({
        error: "Either titleId or category is required",
      });
    }

    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });

    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }

    const previousModuleScope = normalizeModuleScope(
      expense.moduleScope,
      MODULE_SCOPES.TRADING,
    );
    assertExpenseAccessible(expense, requestedScope);

    let finalCategory = category;
    let finalTitle = title || "";

    // 🔥 NEW: titleId mapping
    if (titleId) {
      const titleQuery = {
        _id: titleId,
        userId,
        isDeleted: false,
      };

      applyExpenseTitleScopeFilter(titleQuery, requestedScope);

      const titleDoc = await ExpenseTitle.findOne(titleQuery);

      if (!titleDoc) {
        return res.status(400).json({
          error: "Invalid expense title",
        });
      }

      finalCategory = titleDoc.categoryId;
      finalTitle = titleDoc.name;
    }

    if (!finalCategory) {
      return res.status(400).json({
        error: "Category is required",
      });
    }

    const numericAmount = Number(amount);
    const normalizedModuleScope =
      moduleScope !== undefined
        ? getExpenseScope({ moduleScope }, previousModuleScope)
        : previousModuleScope;

    if (normalizedModuleScope !== previousModuleScope) {
      throw makeHttpError("Expense module scope cannot be changed.", 403);
    }

    const businessDate = getBusinessDateKey(date || expense.date, {
      fallback: expense.date || new Date(),
      label: "expense date",
    });
    const businessTime = time !== undefined ? time || "" : expense.time || "";
    const journalDate = parseBusinessDateTime(businessDate, businessTime, {
      defaultTime: "00:00",
      label: "expense date",
    });

    const totalCredit = creditEntries.reduce(
      (sum, entry) => sum + Number(entry.amount || 0),
      0,
    );

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !Number.isFinite(totalCredit) ||
      Math.abs(totalCredit - numericAmount) > 0.001
    ) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }

    const lines = [
      {
        account: finalCategory,
        type: "debit",
        amount: numericAmount,
      },
      ...creditEntries.map((entry) => ({
        account: entry.account,
        type: "credit",
        amount: Number(entry.amount || 0),
        paymentType:
          entry.paymentType?.toLowerCase() ||
          paymentType?.toLowerCase() ||
          "cash",
      })),
    ];

    await validateScopedExpenseAccounts({
      userId,
      moduleScope: normalizedModuleScope,
      debitAccountId: finalCategory,
      creditEntries,
    });

    if (!isBalanced(lines)) {
      return res.status(400).json({
        message: "Journal entry is not balanced.",
      });
    }

    const oldAccounts = [expense.category, expense.account].filter(Boolean);

    if (req.file && expense.attachment) {
      const oldAttachmentPath = path.resolve(expense.attachment);

      if (fs.existsSync(oldAttachmentPath)) {
        fs.unlinkSync(oldAttachmentPath);
      }
    }

    expense.title = finalTitle;
    expense.category = finalCategory;
    expense.date = businessDate;
    expense.time = businessTime;
    expense.amount = numericAmount;
    expense.paymentType = paymentType;
    expense.account = null;
    expense.description = description;
    expense.titleId = titleId || null;
    expense.moduleScope = normalizedModuleScope;

    if (req.file) {
      expense.attachment = `uploads/${req.file.filename}`;
    }

    await expense.save();

    await JournalEntry.deleteMany({
      referenceId: expense._id,
      sourceType: "expense",
      createdBy: userId,
    });

    const journal = new JournalEntry({
      date: journalDate,
      time: businessTime,
      description: finalTitle || description || "Expense Update",
      createdBy: userId,
      sourceType: "expense",
      originModule: getExpenseOriginModule(normalizedModuleScope),
      moduleScope: normalizedModuleScope,
      referenceId: expense._id,
      lines,
    });

    await journal.save();

    expense.journalEntryId = journal._id;
    await expense.save();

    const allAccounts = [
      ...new Set([
        finalCategory,
        ...creditEntries.map((e) => e.account),
        ...oldAccounts,
      ]),
    ];

    for (const acc of allAccounts) {
      await recalculateAccountBalance(acc);
    }

    if (
      TRAVEL_EXPENSE_SCOPES.has(normalizedModuleScope) ||
      TRAVEL_EXPENSE_SCOPES.has(previousModuleScope)
    ) {
      clearTravelReportCache(userId);
    }

    res.json({
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (err) {
    console.error("❌ Error updating expense:", err);
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

// ❌ Delete Expense (NO CHANGE)
exports.deleteExpense = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const actorId = req.actorId || userId;
    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const expenseScope = normalizeModuleScope(
      expense.moduleScope,
      MODULE_SCOPES.TRADING,
    );
    const requestedScope = getExpenseScope(req.query, MODULE_SCOPES.TRADING);

    assertExpenseScopeEnabled(req, requestedScope);
    assertExpenseAccessible(expense, requestedScope);

    const isTravelDelete =
      expenseScope === MODULE_SCOPES.TRAVEL ||
      (expenseScope === MODULE_SCOPES.BOTH && requestedScope === MODULE_SCOPES.TRAVEL);

    if (isTravelDelete) {
      const session = await mongoose.startSession();
      let accountIds = [];

      try {
        await session.withTransaction(async () => {
          const liveExpense = await Expense.findOne({
            _id: req.params.id,
            userId,
            isDeleted: false,
          }).session(session);

          if (!liveExpense) {
            throw Object.assign(new Error("Expense not found"), { statusCode: 404 });
          }

          const reversalResult = await reverseTravelJournals({
            userId,
            referenceId: liveExpense._id,
            originModule: TRAVEL_EXPENSE_ORIGIN,
            sourceTypes: ["expense"],
            session,
            reason: getSoftDeleteReason(req, "Travel expense corrected"),
          });

          if (reversalResult.journals.length === 0) {
            throw Object.assign(
              new Error("Travel expense journal was not found for reversal"),
              { statusCode: 409 },
            );
          }

          accountIds = reversalResult.accountIds;
          liveExpense.isDeleted = true;
          liveExpense.deletedAt = new Date();
          liveExpense.deletedBy = actorId;
          liveExpense.deleteReason = getSoftDeleteReason(req, "Travel expense corrected");
          liveExpense.isReversed = true;
          liveExpense.reversedAt = new Date();
          liveExpense.reversedBy = actorId;
          liveExpense.reversalJournalEntryIds = reversalResult.reversalIds;

          await liveExpense.save({ session });
        });
      } finally {
        await session.endSession();
      }

      await recalculateTravelSoftDeleteAccounts(accountIds);
      clearTravelReportCache(userId);

      return res.json({
        message: "Travel expense reversed and archived successfully",
        reversed: true,
      });
    }

    if (expense.attachment) {
      fs.unlinkSync(path.resolve(expense.attachment));
    }

    expense.isDeleted = true;
    await expense.save();

    await JournalEntry.updateMany(
      {
        referenceId: expense._id,
        sourceType: "expense",
        createdBy: userId,
      },
      { isDeleted: true },
    );

    const journal = await JournalEntry.findOne({
      referenceId: expense._id,
      sourceType: "expense",
      createdBy: userId,
    });

    if (journal?.lines?.length) {
      for (const line of journal.lines) {
        await recalculateAccountBalance(line.account);
      }
    }

    if (TRAVEL_EXPENSE_SCOPES.has(expense.moduleScope)) {
      clearTravelReportCache(userId);
    }

    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting expense:", err);
    if (err?.statusCode) {
      return res.status(err.statusCode).json({
        error: err.message,
        message: err.message,
      });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getAllExpenses = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const expenseQuery = {
      userId,
      isDeleted: false,
    };
    const requestedScope = getExpenseScope(req.query, MODULE_SCOPES.TRADING);

    assertExpenseScopeEnabled(req, requestedScope);

    applyModuleScopeFilter(expenseQuery, requestedScope);

    const expenses = await Expense.find(expenseQuery)
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .lean();

    if (expenses.length === 0) {
      return res.json([]);
    }

    const expenseIds = expenses.map((expense) => expense._id);

    const journals = await JournalEntry.find({
      referenceId: { $in: expenseIds },
      sourceType: "expense",
      createdBy: userId,
      isDeleted: false,
    })
      .select("referenceId lines moduleScope")
      .populate("lines.account", "name")
      .lean();

    const journalMap = new Map();

    for (const journal of journals) {
      const key = String(journal.referenceId);

      if (!journalMap.has(key)) {
        journalMap.set(key, journal);
      }
    }

    const formatted = expenses.map((expense) => {
      const journal = journalMap.get(String(expense._id));

      const creditLines =
        journal?.lines?.filter((line) => line.type === "credit") || [];

      return {
        ...expense,
        paymentMode: creditLines[0]?.paymentType || expense.paymentType || "-",

        creditAccounts: creditLines
          .map((line) => line.account?.name)
          .filter(Boolean)
          .join(", "),
      };
    });

    return res.json(formatted);
  } catch (err) {
    console.error("Get Expenses Error:", err);

    return res.status(500).json({
      error: err.message,
    });
  }
};

// ✅ Get Single Expense (NO BREAK, SAME)
exports.getExpenseById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const requestedScope = getExpenseScope(req.query, MODULE_SCOPES.TRADING);

    assertExpenseScopeEnabled(req, requestedScope);

    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    })
      .populate("category", "name")
      .populate("account", "name");

    if (!expense) return res.status(404).json({ error: "Expense not found" });

    assertExpenseAccessible(expense, requestedScope);

    const journal = await JournalEntry.findOne({
      referenceId: expense._id,
      sourceType: "expense",
      createdBy: userId,
    }).populate("lines.account");

    const creditEntries =
      journal?.lines
        ?.filter((line) => line.type === "credit")
        .map((line) => ({
          account: line.account?._id || "",
          amount: line.amount || "",
          paymentType: line.paymentType || "cash",
        })) || [];

    const response = {
      ...expense.toObject(),
      creditEntries,
    };

    res.json(response);
  } catch (err) {
    console.error("❌ Error fetching expense:", err);
    res.status(500).json({ error: err.message });
  }
};
