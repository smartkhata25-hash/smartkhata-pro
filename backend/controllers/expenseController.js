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
  normalizeModuleScope,
} = require("../utils/moduleScope");
const { clearTravelReportCache } = require("../services/travel/travelReportCacheService");
const {
  getSoftDeleteReason,
  recalculateTravelSoftDeleteAccounts,
  reverseTravelJournals,
} = require("../services/travel/travelSoftDeleteService");
const fs = require("fs");
const path = require("path");

const TRAVEL_EXPENSE_ORIGIN = "travel_expense";
const TRAVEL_EXPENSE_SCOPES = new Set([MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH]);

const getExpenseOriginModule = (moduleScope) =>
  TRAVEL_EXPENSE_SCOPES.has(moduleScope) ? TRAVEL_EXPENSE_ORIGIN : "";

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

  const matchedAccounts = await Account.find(query).select("_id").lean();

  if (matchedAccounts.length !== uniqueAccountIds.length) {
    const error = new Error("One or more selected accounts are not available in this module.");
    error.statusCode = 400;
    throw error;
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

    if (!titleId && !category) {
      return res.status(400).json({
        error: "Either titleId or category is required",
      });
    }

    let finalCategory = category;
    let finalTitle = title || "";

    if (titleId) {
      const titleDoc = await ExpenseTitle.findOne({
        _id: titleId,
        userId,
        isDeleted: false,
      });

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
    const normalizedModuleScope = normalizeModuleScope(
      moduleScope,
      MODULE_SCOPES.TRADING,
    );

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
      date,
      time,
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
      date,
      time,
      description: finalTitle || description || "Expense Entry",
      createdBy: userId,
      sourceType: "expense",
      originModule: getExpenseOriginModule(normalizedModuleScope),
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

    let finalCategory = category;
    let finalTitle = title || "";

    // 🔥 NEW: titleId mapping
    if (titleId) {
      const titleDoc = await ExpenseTitle.findOne({
        _id: titleId,
        userId,
        isDeleted: false,
      });

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
    const normalizedModuleScope = normalizeModuleScope(
      moduleScope,
      expense.moduleScope || MODULE_SCOPES.TRADING,
    );

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
    expense.date = date;
    expense.time = time;
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
    });

    const journal = new JournalEntry({
      date,
      time,
      description: finalTitle || description || "Expense Update",
      createdBy: userId,
      sourceType: "expense",
      originModule: getExpenseOriginModule(normalizedModuleScope),
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

    const requestedScope = normalizeModuleScope(
      req.query?.moduleScope || req.query?.scope,
      "",
    );
    const expenseScope = normalizeModuleScope(
      expense.moduleScope,
      MODULE_SCOPES.TRADING,
    );
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

    const { account, category } = expense;

    if (expense.attachment) {
      fs.unlinkSync(path.resolve(expense.attachment));
    }

    expense.isDeleted = true;
    await expense.save();

    await JournalEntry.updateMany(
      { referenceId: expense._id, sourceType: "expense" },
      { isDeleted: true },
    );

    const journal = await JournalEntry.findOne({
      referenceId: expense._id,
      sourceType: "expense",
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
    const requestedScope = String(req.query?.moduleScope || req.query?.scope || "")
      .trim()
      .toLowerCase();

    applyModuleScopeFilter(expenseQuery, requestedScope || MODULE_SCOPES.TRADING);

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
      isDeleted: false,
    })
      .select("referenceId lines")
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

    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    })
      .populate("category", "name")
      .populate("account", "name");

    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const journal = await JournalEntry.findOne({
      referenceId: expense._id,
      sourceType: "expense",
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
