const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");

/**
 * 🔄 Reusable helper to calculate balance from journal entries
 */
const calculateBalanceFromJournal = async (accountId, userId, label = "") => {
  if (!accountId) return 0;

  const result = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        "lines.account": accountId,
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
  return result[0]?.balance || 0;
};

/**
 * 📊 Get current balance of a customer from journal
 */
const getCustomerBalanceFromJournal = async (customerId, userId) => {
  const customer = await Customer.findById(customerId);
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
