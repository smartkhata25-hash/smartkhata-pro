const mongoose = require("mongoose");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");

const persistAccountBalance = (filter, balance) =>
  Account.updateOne(
    filter,
    { $set: { balance: Number(balance || 0) } },
    { strict: false },
  );

// ⚠️ LEGACY HELPER — avoid using in journal-based accounting
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
          createdBy: account.userId,
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

    await persistAccountBalance(
      {
        _id: account._id,
        userId: account.userId,
      },
      calculatedBalance,
    );

    return calculatedBalance;
  } catch (err) {
    console.error("❌ Error recalculating balance:", err.message);
    throw err;
  }
};

// ✅ Multiple involved accounts کو ایک ہی aggregation میں recalculate کریں
exports.recalculateAccountBalances = async (accountIds = []) => {
  const validIds = [
    ...new Set(
      accountIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => id.toString()),
    ),
  ];

  if (validIds.length === 0) {
    return [];
  }

  const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));

  const accounts = await Account.find({
    _id: { $in: objectIds },
  }).select("_id userId name normalBalance");

  if (accounts.length === 0) {
    return [];
  }

  const userIds = [
    ...new Set(accounts.map((account) => account.userId.toString())),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const summary = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: { $in: userIds },
        isDeleted: false,
        "lines.account": { $in: objectIds },
      },
    },
    {
      $unwind: "$lines",
    },
    {
      $match: {
        "lines.account": { $in: objectIds },
      },
    },
    {
      $group: {
        _id: "$lines.account",

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

  const summaryMap = new Map(
    summary.map((item) => [
      item._id.toString(),
      {
        totalDebit: Number(item.totalDebit || 0),
        totalCredit: Number(item.totalCredit || 0),
      },
    ]),
  );

  const updates = accounts.map((account) => {
    const totals = summaryMap.get(account._id.toString()) || {
      totalDebit: 0,
      totalCredit: 0,
    };

    const balance =
      account.normalBalance === "debit"
        ? totals.totalDebit - totals.totalCredit
        : totals.totalCredit - totals.totalDebit;

    return {
      updateOne: {
        filter: {
          _id: account._id,
          userId: account.userId,
        },
        update: {
          $set: { balance },
        },
      },
    };
  });

  if (updates.length > 0) {
    await Account.bulkWrite(updates, { strict: false });
  }

  return accounts.map((account) => {
    const totals = summaryMap.get(account._id.toString()) || {
      totalDebit: 0,
      totalCredit: 0,
    };

    const balance =
      account.normalBalance === "debit"
        ? totals.totalDebit - totals.totalCredit
        : totals.totalCredit - totals.totalDebit;

    return {
      accountId: account._id,
      name: account.name,
      balance,
    };
  });
};

exports.recalculateAllUserAccounts = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.warn("⚠️ Invalid User ID for full recalculation");
    return { message: "Invalid userId" };
  }

  const accounts = await Account.find({ userId }).select(
    "_id name normalBalance",
  );

  const accountIds = accounts.map((acc) => acc._id);

  // 🔥 single aggregation (instead of 50 queries)
  const summary = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: accountIds },
      },
    },
    {
      $group: {
        _id: {
          account: "$lines.account",
          type: "$lines.type",
        },
        total: { $sum: "$lines.amount" },
      },
    },
  ]);

  // 🔄 map results
  const resultMap = {};

  summary.forEach((item) => {
    const accId = item._id.account.toString();
    if (!resultMap[accId]) {
      resultMap[accId] = { debit: 0, credit: 0 };
    }

    if (item._id.type === "debit") {
      resultMap[accId].debit = item.total;
    } else {
      resultMap[accId].credit = item.total;
    }
  });

  const results = [];

  for (let acc of accounts) {
    const data = resultMap[acc._id.toString()] || { debit: 0, credit: 0 };

    let balance = 0;

    if (acc.normalBalance === "debit") {
      balance = data.debit - data.credit;
    } else {
      balance = data.credit - data.debit;
    }

    await persistAccountBalance({ _id: acc._id }, balance);

    results.push({ name: acc.name, balance });
  }

  return results;
};
