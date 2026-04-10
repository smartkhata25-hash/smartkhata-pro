// ✅ تمام ضروری ماڈلز امپورٹ کریں
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");
const ACCOUNT_RULES = require("../utils/accountRules");

// ✅ نیا اکاؤنٹ بنائیں
exports.createAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, type, code, category } = req.body;

    // 🔒 Accounting role validation
    const rule = ACCOUNT_RULES[type];
    if (!rule) {
      return res.status(400).json({ message: "Invalid account type." });
    }

    if (!rule.allowedCategories.includes(category)) {
      return res.status(400).json({
        message: `Category '${category}' is not allowed for ${type} account.`,
      });
    }

    const existing = await Account.findOne({ code, userId });
    if (existing) {
      return res.status(400).json({ message: "Account code already exists." });
    }

    const newAccount = new Account({
      name,
      type,
      code,
      category,
      userId,
      normalBalance: rule.normalBalance,
    });
    await newAccount.save();
    res.status(201).json({ message: "Account created", account: newAccount });
  } catch (error) {
    console.error("❌ CREATE ACCOUNT ERROR:", error); // 👈 console میں full error

    res.status(500).json({
      message: error.message || "Create failed",
      error: error.message,
    });
  }
};

// ✅ تمام اکاؤنٹس حاصل کریں (فلٹر کے ساتھ)
exports.getAccounts = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

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

    const query = { userId };

    if (filter === "payment") {
      query.type = "Asset";
      query.category = { $in: ["cash", "bank", "online", "cheque"] };
    } else {
      if (category) query.category = category;
      if (type) query.type = type;
    }

    // 🔹 Filters (optional)
    if (category) query.category = category;
    if (type) query.type = type;
    if (isSystem !== undefined) query.isSystem = isSystem === "true";

    if (balance === "zero") query.balance = 0;
    if (balance === "nonzero") query.balance = { $ne: 0 };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    // 🔹 Sorting
    let sort = { code: 1 };
    if (sortBy) {
      const order = sortOrder === "desc" ? -1 : 1;
      sort = { [sortBy]: order };
    }

    const accounts = await Account.find(query).sort(sort);

    res.status(200).json(accounts);
  } catch (error) {
    res.status(500).json({ message: "Fetch failed", error: error.message });
  }
};

// ✅ اکاؤنٹ اپڈیٹ کریں (صارف کی ویریفکیشن کے ساتھ)
exports.updateAccount = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    const account = await Account.findOne({ _id: id, userId });
    if (!account) {
      return res.status(404).json({ message: "Account not found" });
    }

    // 🔒 SYSTEM ACCOUNT FIELD PROTECTION
    if (account.isSystem) {
      // صرف allowed fields update ہوں
      const allowedUpdates = ["name", "category"];
      for (let key of Object.keys(req.body)) {
        if (!allowedUpdates.includes(key)) {
          return res.status(403).json({
            message: "Cannot modify protected fields of system account.",
          });
        }
      }
    }

    // 🔒 Accounting rule protection (on update)
    if (req.body.type || req.body.category) {
      const newType = req.body.type || account.type;
      const newCategory = req.body.category || account.category;

      const rule = ACCOUNT_RULES[newType];
      if (!rule) {
        return res.status(400).json({ message: "Invalid account type." });
      }

      if (!rule.allowedCategories.includes(newCategory)) {
        return res.status(400).json({
          message: `Category '${newCategory}' is not allowed for ${newType} account.`,
        });
      }
    }

    Object.assign(account, req.body);
    await account.save();

    res.status(200).json(account);
  } catch (err) {
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

    // 🔒 SYSTEM ACCOUNT PROTECTION
    if (account.isSystem) {
      return res.status(403).json({
        message: "System account cannot be deleted.",
      });
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
      0,
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
      .limit(200);

    // ✅ Prepare flat structure with adjusted debit/credit
    const flatEntries = transactions.flatMap((entry) =>
      entry.lines
        .filter((line) => line.account?.toString() === accountId)
        .map((line) => {
          const debit = line.type === "debit" ? line.amount : 0;
          const credit = line.type === "credit" ? line.amount : 0;

          return {
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || "",
            debit,
            credit,

            // ✅ Source
            sourceType: entry.sourceType || entry.source || "",

            // ✅ Payment type (journal se)
            paymentType: line.paymentType || entry.paymentType || "-",

            // ✅ Account name (line se)
            accountName: account.name || "",

            billNo: entry.billNo || "",
          };
        }),
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

// ✅ Accounts Master Summary (counts + totals)
exports.getAccountsSummary = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const accounts = await Account.find({ userId });

    const summary = {
      total: accounts.length,
      system: accounts.filter((a) => a.isSystem).length,
      user: accounts.filter((a) => !a.isSystem).length,
      zeroBalance: accounts.filter((a) => (a.balance || 0) === 0).length,
      nonZeroBalance: accounts.filter((a) => (a.balance || 0) !== 0).length,
    };

    res.json(summary);
  } catch (err) {
    res.status(500).json({
      message: "Accounts summary error",
      error: err.message,
    });
  }
};
