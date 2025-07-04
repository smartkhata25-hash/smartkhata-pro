const Expense = require("../models/Expense");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { isBalanced } = require("../utils/journalHelper");
const fs = require("fs");
const path = require("path");

// ✅ Create Expense with Journal Entry
exports.createExpense = async (req, res) => {
  try {
    const { title, category, date, time, amount, paymentType, description } =
      req.body;

    const creditEntries = JSON.parse(req.body.creditEntries || "[]");
    const userId = req.user?.id || req.userId;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const totalCredit = creditEntries.reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );

    if (totalCredit !== Number(amount)) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }

    const lines = [
      {
        account: category,
        type: "debit",
        amount: Number(amount),
      },
      ...creditEntries.map((entry) => ({
        account: entry.account,
        type: "credit",
        amount: Number(entry.amount),
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
      title,
      category,
      date,
      time,
      amount: Number(amount),
      paymentType,
      account: null, // optional now
      description,
      attachment: attachmentPath,
      userId,
    });
    await expense.save();

    const journal = new JournalEntry({
      date,
      time,
      description: title || description || "Expense Entry",
      createdBy: userId,
      sourceType: "expense",
      referenceId: expense._id,
      lines,
    });
    await journal.save();

    expense.journalEntryId = journal._id;
    await expense.save();

    // recalculate balances for all accounts involved
    const allAccounts = [category, ...creditEntries.map((e) => e.account)];
    for (const acc of allAccounts) {
      await recalculateAccountBalance(acc);
    }

    console.log("✅ Expense created:", expense._id);
    res
      .status(201)
      .json({ message: "Expense created successfully", data: expense });
  } catch (err) {
    console.error("❌ Error creating expense:", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
};

// ✅ Update Expense
exports.updateExpense = async (req, res) => {
  try {
    const { title, category, date, time, amount, paymentType, description } =
      req.body;

    const creditEntries = JSON.parse(req.body.creditEntries || "[]");
    const userId = req.user?.id || req.userId;

    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    const oldAccounts = [expense.category, expense.account];

    if (req.file && expense.attachment) {
      fs.unlinkSync(path.resolve(expense.attachment));
    }

    expense.title = title;
    expense.category = category;
    expense.date = date;
    expense.time = time;
    expense.amount = Number(amount);
    expense.paymentType = paymentType;
    expense.account = null; // no longer required
    expense.description = description;
    if (req.file) {
      expense.attachment = `uploads/${req.file.filename}`;
    }
    await expense.save();

    const totalCredit = creditEntries.reduce(
      (sum, e) => sum + Number(e.amount),
      0
    );

    if (totalCredit !== Number(amount)) {
      return res.status(400).json({
        message: "Debit and credit must be equal.",
      });
    }

    const lines = [
      {
        account: category,
        type: "debit",
        amount: Number(amount),
      },
      ...creditEntries.map((entry) => ({
        account: entry.account,
        type: "credit",
        amount: Number(entry.amount),
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
      description: title || description || "Expense Update",
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
        category,
        ...creditEntries.map((e) => e.account),
        ...oldAccounts,
      ]),
    ];
    for (const acc of allAccounts) {
      await recalculateAccountBalance(acc);
    }

    console.log("✏️ Expense updated:", expense._id);
    res.json({ message: "Expense updated successfully", data: expense });
  } catch (err) {
    console.error("❌ Error updating expense:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete Expense (Soft Delete)
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
      { isDeleted: true }
    );

    await recalculateAccountBalance(account);
    await recalculateAccountBalance(category);

    console.log("🗑️ Expense soft deleted:", expense._id);
    res.json({ message: "Expense deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting expense:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get All Expenses
exports.getAllExpenses = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const expenses = await Expense.find({ userId, isDeleted: false })
      .populate("category", "name")
      .populate("account", "name")
      .sort({ createdAt: -1 });

    res.json(expenses);
  } catch (err) {
    console.error("❌ Error fetching expenses:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get Single Expense
exports.getExpenseById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const expense = await Expense.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    });
    if (!expense) return res.status(404).json({ error: "Expense not found" });

    res.json(expense);
  } catch (err) {
    console.error("❌ Error fetching expense:", err);
    res.status(500).json({ error: err.message });
  }
};
