const mongoose = require("mongoose");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");

// ✅ 1. Manual Adjustment (صرف خاص حالات میں استعمال کریں)
exports.updateAccountBalance = async (accountId, amount, operation = "add") => {
  const account = await Account.findById(accountId);
  if (!account) throw new Error("Account not found");

  if (typeof amount !== "number" || isNaN(amount)) {
    throw new Error("Invalid amount");
  }

  if (operation === "add") {
    account.balance += amount;
  } else if (operation === "subtract") {
    account.balance -= amount;
  } else {
    throw new Error("Invalid operation type. Use 'add' or 'subtract'.");
  }

  await account.save();
};

// ✅ 2. کسی ایک اکاؤنٹ کا بیلنس دوبارہ کلکولیٹ کریں (Journal کی بنیاد پر)
exports.recalculateAccountBalance = async (accountId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(accountId)) {
      console.warn("⚠️ Invalid Account ID for recalculation");
      return 0;
    }

    const objectId = new mongoose.Types.ObjectId(accountId);

    // 🔍 Account load کریں تاکہ userId بھی مل جائے
    const account = await Account.findById(objectId);
    if (!account) {
      console.error("❌ Account not found while recalculating:", accountId);
      throw new Error("Account not found");
    }

    const summary = await JournalEntry.aggregate([
      { $unwind: "$lines" },
      {
        $match: {
          "lines.account": objectId,
          createdBy: account.userId, // ✅ MULTI-USER SAFETY FIX
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          totalDebit: {
            $sum: {
              $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
            },
          },
          totalCredit: {
            $sum: {
              $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
            },
          },
        },
      },
    ]);

    const { totalDebit = 0, totalCredit = 0 } = summary[0] || {};

    let calculatedBalance = 0;

    if (account.normalBalance === "debit") {
      calculatedBalance = totalDebit - totalCredit;
    } else {
      calculatedBalance = totalCredit - totalDebit;
    }

    account.balance = calculatedBalance;
    await account.save();

    return account.balance;
  } catch (err) {
    console.error("❌ Error recalculating balance:", err.message);
    throw err;
  }
};

// ✅ 3. تمام اکاؤنٹس کا بیلنس ریفریش کریں (کسی مخصوص یوزر کے لیے)
exports.recalculateAllUserAccounts = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.warn("⚠️ Invalid User ID for full recalculation");
    return { message: "Invalid userId" };
  }

  const accounts = await Account.find({ userId });

  const results = [];

  for (let acc of accounts) {
    try {
      const newBalance = await exports.recalculateAccountBalance(acc._id);
      results.push({ name: acc.name, balance: newBalance });
    } catch (err) {
      results.push({ name: acc.name, error: err.message });
      console.error(`⚠️ Error updating account (${acc.name}):`, err.message);
    }
  }

  return results;
};
