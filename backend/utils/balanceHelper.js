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

  console.log(`🔍 Calculating balance for ${label}`);
  console.log("🧾 Using accountId:", accountId.toString());
  console.log("🧾 Using userId:", userId.toString());

  const entries = await JournalEntry.find({
    "lines.account": accountId,
    createdBy: userId,
    isDeleted: false,
  }).select("lines");

  console.log(`📥 Entries found: ${entries.length} for ${label}`);

  let debitTotal = 0;
  let creditTotal = 0;

  entries.forEach((entry, i) => {
    entry.lines.forEach((line) => {
      if (line.account?.toString() === accountId.toString()) {
        const amount = line.amount || 0;
        if (line.type === "debit") {
          debitTotal += amount;
          console.log(`  ➕ Entry[${i}] Debit: +${amount}`);
        } else if (line.type === "credit") {
          creditTotal += amount;
          console.log(`  ➖ Entry[${i}] Credit: -${amount}`);
        }
      }
    });
  });

  const balance = debitTotal - creditTotal;

  console.log(
    `💰 ${label} Balance Summary => Dr: ${debitTotal} | Cr: ${creditTotal} | Net: ${balance}`
  );

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

  console.log(`📌 Getting balance for Customer: ${customer.name}`);
  console.log("🔗 Linked account ID:", customer.account.toString());

  return calculateBalanceFromJournal(
    customer.account,
    userId,
    `Customer(${customer.name})`
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

  console.log(`📌 Getting balance for Supplier: ${supplier.name}`);
  console.log("🔗 Linked account ID:", supplier.account.toString());

  return calculateBalanceFromJournal(
    supplier.account,
    userId,
    `Supplier(${supplier.name})`
  );
};

module.exports = {
  getCustomerBalanceFromJournal,
  getSupplierBalanceFromJournal,
};
