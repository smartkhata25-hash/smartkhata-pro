const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");

/**
 * 🔄 Reusable helper to calculate balance from journal entries
 */
const calculateBalanceFromJournal = async (accountId, userId, label = "") => {
  if (!accountId) {
    console.warn(`⚠️ ${label} accountId missing`);
    return 0;
  }

  const entries = await JournalEntry.find({
    "lines.account": accountId,
    createdBy: userId,
    isDeleted: false,
  }).select("lines");

  let debitTotal = 0;
  let creditTotal = 0;

  entries.forEach((entry, i) => {
    entry.lines.forEach((line) => {
      if (line.account?.toString() === accountId.toString()) {
        const amount = line.amount || 0;
        if (line.type === "debit") {
          debitTotal += amount;
        } else if (line.type === "credit") {
          creditTotal += amount;
        }
      }
    });
  });

  const balance = debitTotal - creditTotal;

  return balance;
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
