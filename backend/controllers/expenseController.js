const Expense = require("../models/Expense");
const JournalEntry = require("../models/JournalEntry");
const ExpenseTitle = require("../models/ExpenseTitle");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { isBalanced } = require("../utils/journalHelper");
const fs = require("fs");
const path = require("path");

// ✅ Create Expense with Journal Entry (UPDATED WITH TITLE MAPPING)
exports.createExpense = async (req, res) => {
  try {
    const {
      title,
      titleId,
      category, // fallback for old system
      date,
      time,
      amount,
      paymentType,
      description,
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

    // 🔥 NEW: اگر titleId آیا ہے تو category auto لے آئیں
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

    const totalCredit = creditEntries.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );

    if (totalCredit !== Number(amount)) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }

    const lines = [
      {
        account: finalCategory,
        type: "debit",
        amount: Number(amount),
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
      amount: Number(amount),
      paymentType,
      account: null,
      description,
      attachment: attachmentPath,
      userId,
      titleId: titleId || null, // 🔥 NEW FIELD
    });

    await expense.save();

    const journal = new JournalEntry({
      date,
      time,
      description: finalTitle || description || "Expense Entry",
      createdBy: userId,
      sourceType: "expense",
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

    res.status(201).json({
      message: "Expense created successfully",
      data: expense,
    });
  } catch (err) {
    console.error("❌ Error creating expense:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
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

    const oldAccounts = [expense.category, expense.account];

    if (req.file && expense.attachment) {
      fs.unlinkSync(path.resolve(expense.attachment));
    }

    expense.title = finalTitle;
    expense.category = finalCategory;
    expense.date = date;
    expense.time = time;
    expense.amount = Number(amount);
    expense.paymentType = paymentType;
    expense.account = null;
    expense.description = description;
    expense.titleId = titleId || null;

    if (req.file) {
      expense.attachment = `uploads/${req.file.filename}`;
    }

    await expense.save();

    const totalCredit = creditEntries.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );

    if (totalCredit !== Number(amount)) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }

    const lines = [
      {
        account: finalCategory,
        type: "debit",
        amount: Number(amount),
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

    if (!isBalanced(lines)) {
      return res.status(400).json({
        message: "Journal entry is not balanced.",
      });
    }

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

    res.json({
      message: "Expense updated successfully",
      data: expense,
    });
  } catch (err) {
    console.error("❌ Error updating expense:", err);
    res.status(500).json({ error: err.message });
  }
};

// ❌ Delete Expense (NO CHANGE)
exports.deleteExpense = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

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

    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting expense:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get All Expenses (NO BREAK, SAME)
exports.getAllExpenses = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const expenses = await Expense.find({
      userId,
      isDeleted: false,
    })
      .populate("category", "name")
      .sort({ createdAt: -1 });

    const formatted = await Promise.all(
      expenses.map(async (e) => {
        const journal = await JournalEntry.findOne({
          referenceId: e._id,
          sourceType: "expense",
          isDeleted: false,
        }).populate("lines.account", "name");

        const creditLines =
          journal?.lines?.filter((l) => l.type === "credit") || [];

        return {
          ...e.toObject(),
          paymentMode: creditLines[0]?.paymentType || e.paymentType || "-",
          creditAccounts: creditLines
            .map((l) => l.account?.name)
            .filter(Boolean)
            .join(", "),
        };
      }),
    );

    res.json(formatted);
  } catch (err) {
    console.error("❌ Get Expenses Error:", err);
    res.status(500).json({ error: err.message });
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
