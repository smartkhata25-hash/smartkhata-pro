const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");

/**
 * 🔄 Reusable helper to calculate balance from journal entries
 */
const calculateBalanceFromJournal = async (accountId, userId, label = "") => {
  console.log("🔥 STEP1 INPUT:", { accountId, userId, label });
  console.log("🔥 STEP1 TYPES:", {
    accountIdType: typeof accountId,
    userIdType: typeof userId,
  });

  if (!accountId) return 0;
  console.log("🔥 STEP2 ACCOUNT ID:", accountId);
  console.log("🔥 STEP2 MATCH DATA:", {
    accountId,
    userId,
  });

  const result = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: userId,
        isDeleted: false,
        accounts: accountId,
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": accountId,
      },
    },
    {
      $group: {
        _id: null,
        balance: {
          $sum: {
            $cond: [
              { $eq: ["$lines.type", "debit"] },
              "$lines.amount",
              { $multiply: ["$lines.amount", -1] },
            ],
          },
        },
      },
    },
  ]);
  console.log("🔥 STEP2 AGG RESULT:", result);
  if (!result.length) {
    console.log("❌ NO DATA FOUND FOR THIS ACCOUNT");
  }
  return result[0]?.balance || 0;
};

/**
 * 📊 Get current balance of a customer from journal
 */
const getCustomerBalanceFromJournal = async (customerId, userId) => {
  const customer = await Customer.findById(customerId);

  console.log("🔥 CUSTOMER CHECK:", {
    customerId,
    account: customer?.account,
  });

  if (!customer || !customer.account) {
    console.warn(`⚠️ Customer not found or no account linked: ${customerId}`);
    return 0;
  }

  return calculateBalanceFromJournal(
    customer.account,
    userId,
    `Customer(${customer.name})`,
  );
};

/**
 * 📊 Get current balance of a supplier from journal
 */
const getSupplierBalanceFromJournal = async (supplierId, userId) => {
  const supplier = await Supplier.findById(supplierId);
  console.log("🔥 SUPPLIER CHECK:", {
    supplierId,
    account: supplier?.account,
  });

  if (!supplier || !supplier.account) {
    console.warn(`⚠️ Supplier not found or no account linked: ${supplierId}`);
    return 0;
  }

  return calculateBalanceFromJournal(
    supplier.account,
    userId,
    `Supplier(${supplier.name})`,
  );
};

module.exports = {
  getCustomerBalanceFromJournal,
  getSupplierBalanceFromJournal,
};
