// ✅ تمام ضروری ماڈلز امپورٹ کریں
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");

// ✅ نیا اکاؤنٹ بنائیں
exports.createAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, type, code, category } = req.body;

    const existing = await Account.findOne({ code, userId });
    if (existing) {
      return res.status(400).json({ message: "Account code already exists." });
    }

    const newAccount = new Account({ name, type, code, category, userId });
    await newAccount.save();
    res.status(201).json({ message: "Account created", account: newAccount });
  } catch (error) {
    console.error("Create Error:", error);
    res.status(500).json({ message: "Create failed", error });
  }
};

// ✅ تمام اکاؤنٹس حاصل کریں (فلٹر کے ساتھ)
exports.getAccounts = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const category = req.query.category;
    const query = { userId };
    if (category) query.category = category;

    const accounts = await Account.find(query);
    res.status(200).json(accounts);
  } catch (error) {
    console.error("Fetch Error:", error);
    res.status(500).json({ message: "Fetch failed", error });
  }
};

// ✅ اکاؤنٹ اپڈیٹ کریں (صارف کی ویریفکیشن کے ساتھ)
exports.updateAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const updated = await Account.findOneAndUpdate(
      { _id: id, userId },
      req.body,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Account not found" });
    }

    res.status(200).json(updated);
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ message: "Update failed", err });
  }
};

// ✅ اکاؤنٹ ڈیلیٹ کریں (ویریفکیشن اور جرنل چیک کے ساتھ)
exports.deleteAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const account = await Account.findOne({ _id: id, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const entryExists = await JournalEntry.findOne({
      "lines.account": account._id,
      isDeleted: false,
    });

    if (entryExists) {
      return res.status(400).json({
        message: "Account is in use in journal entries and cannot be deleted.",
      });
    }

    await account.deleteOne();
    res.status(200).json({ message: "Account deleted" });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ message: "Delete failed", err });
  }
};

// ✅ کیش اکاؤنٹ کا خلاصہ حاصل کریں
exports.getCashSummary = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const cashAccount = await Account.findOne({ userId, category: "cash" });

    if (!cashAccount)
      return res.status(404).json({ message: "No cash account found" });

    res.json({
      _id: cashAccount._id,
      name: cashAccount.name,
      balance: cashAccount.balance || 0,
    });
  } catch (err) {
    res.status(500).json({ message: "Cash summary error", error: err.message });
  }
};

// ✅ بینک اکاؤنٹس کا خلاصہ
exports.getBankSummary = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const bankAccounts = await Account.find({ userId, category: "bank" });

    const totalBank = bankAccounts.reduce(
      (sum, acc) => sum + (acc.balance || 0),
      0
    );

    res.json({
      totalBank,
      accounts: bankAccounts.map((acc) => ({
        _id: acc._id,
        name: acc.name,
        balance: acc.balance || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: "Bank summary error", error: err.message });
  }
};

// ✅ ایک اکاؤنٹ کی تمام ٹرانزیکشنز حاصل کریں
exports.getAccountTransactions = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id: accountId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({ message: "Invalid or missing account ID" });
    }

    // 🧠 Get account to know its category
    const account = await Account.findOne({ _id: accountId, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    const accountCategory = account.category; // e.g., 'cash', 'bank', etc.

    // ✅ Get related journal entries
    const transactions = await JournalEntry.find({
      createdBy: userId,
      "lines.account": new mongoose.Types.ObjectId(accountId),
      isDeleted: false,
    })
      .sort({ date: -1, time: -1 })
      .limit(200)
      .lean();

    console.log(`📊 Total Transactions for ${accountId}:`, transactions.length);

    // ✅ Prepare flat structure with adjusted debit/credit
    const flatEntries = transactions.flatMap((entry) =>
      entry.lines
        .filter((line) => line.account?.toString() === accountId)
        .map((line) => {
          let debit = 0;
          let credit = 0;

          if (["cash", "bank"].includes(accountCategory)) {
            // ⬅️ Invert logic for cash/bank
            debit = line.type === "credit" ? line.amount : 0;
            credit = line.type === "debit" ? line.amount : 0;
          } else {
            // ✅ Normal logic for other accounts
            debit = line.type === "debit" ? line.amount : 0;
            credit = line.type === "credit" ? line.amount : 0;
          }

          return {
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || "",
            debit,
            credit,
            sourceType: entry.sourceType || entry.source || "",
            referenceId: entry.referenceId || entry.sourceId || "",
            paymentType: entry.paymentType || "",
            billNo: entry.billNo || "",
          };
        })
    );

    res.json(flatEntries);
  } catch (err) {
    console.error("Account transactions error:", err);
    res.status(500).json({
      message: "Server error while fetching transactions",
      error: err.message,
    });
  }
};

// ✅ تمام کیٹیگریز کا بیلنس سمری
exports.getBalanceSnapshot = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const accounts = await Account.find({ userId });

    const summary = {};
    for (let acc of accounts) {
      const cat = acc.category || "uncategorized";
      if (!summary[cat]) summary[cat] = 0;
      summary[cat] += acc.balance || 0;
    }

    res.json(summary);
  } catch (err) {
    console.error("Balance snapshot error:", err);
    res.status(500).json({ message: "Snapshot error", error: err.message });
  }
};
