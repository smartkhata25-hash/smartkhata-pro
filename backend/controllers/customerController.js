const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const { getCustomerBalanceFromJournal } = require("../utils/balanceHelper");

// ✅ 1. Get all customers with balance
const getCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    console.log("📥 getCustomers - userId:", userId);

    const customers = await Customer.find({ createdBy: userId }).populate(
      "account"
    );
    console.log("📊 Customers fetched:", customers.length);

    const customersWithBalance = await Promise.all(
      customers.map(async (cust) => {
        const balance = await getCustomerBalanceFromJournal(cust._id, userId);
        return {
          ...cust.toObject(),
          balance,
        };
      })
    );

    res.json(customersWithBalance);
  } catch (error) {
    console.error("❌ Get Customers Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ 2. Add new customer with linked account & opening balance
const addCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, email, phone, address, type, openingBalance } = req.body;

    console.log(
      "🧾 Adding Customer:",
      name,
      "| Opening Balance:",
      openingBalance
    );

    // 🔢 Generate unique account code
    const lastAccount = await Account.findOne({ userId })
      .sort({ createdAt: -1 })
      .lean();
    let newCode = "ACC-0001";
    if (lastAccount && lastAccount.code) {
      const lastNum = parseInt(lastAccount.code.split("-")[1]);
      const nextNum = (lastNum + 1).toString().padStart(4, "0");
      newCode = `ACC-${nextNum}`;
    }

    // 🧾 Create linked account
    const account = await Account.create({
      userId,
      name: `Customer: ${name}`,
      type: "Asset",
      code: newCode,
      category: "other",
      balance: 0,
      openingBalance: Number(openingBalance) || 0,
    });

    console.log("🆔 Created Account ID:", account._id);

    // 👤 Create customer
    const customer = new Customer({
      name,
      email,
      phone,
      address,
      type,
      openingBalance,
      account: account._id,
      createdBy: userId,
    });

    console.log("👤 Creating customer with account:", customer.account);
    console.log("🆔 Actual account._id:", account._id);
    console.log("🧾 Will assign to customer.account:", account._id.toString());

    await customer.save();

    // 💰 Journal Entry for opening balance
    if (openingBalance && Number(openingBalance) !== 0) {
      await JournalEntry.create({
        date: new Date(),
        description: "Opening Balance - Customer",
        createdBy: userId,
        sourceType: "opening_balance",
        customerId: customer._id,
        lines: [
          {
            account: account._id,
            type: "debit",
            amount: Number(openingBalance),
          },
        ],
      });

      console.log(
        "📥 JournalEntry created with account:",
        account._id.toString()
      );
    }

    res.status(201).json(customer);
  } catch (error) {
    console.error("❌ Add Customer Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ 3. Update customer
const updateCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    console.log("✏️ Updating customer:", customerId);

    const updated = await Customer.findOneAndUpdate(
      { _id: customerId, createdBy: userId },
      req.body,
      { new: true }
    );

    if (!updated) {
      console.warn("⚠️ Customer not found for update:", customerId);
      return res.status(404).json({ message: "Customer not found" });
    }

    console.log("✅ Customer updated:", updated._id);
    res.json(updated);
  } catch (error) {
    console.error("❌ Update Customer Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ 4. Delete customer + soft delete journal entries
const deleteCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    console.log("🗑️ Deleting customer:", customerId);

    const customer = await Customer.findOneAndDelete({
      _id: customerId,
      createdBy: userId,
    });

    if (!customer) {
      console.warn("⚠️ Customer not found for deletion:", customerId);
      return res.status(404).json({ message: "Customer not found" });
    }

    // 🧠 Soft delete journal entries related to this customer’s account
    const result = await JournalEntry.updateMany(
      { "lines.account": customer.account },
      { isDeleted: true }
    );

    console.log("🗑️ Journal entries soft-deleted:", result.modifiedCount);

    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("❌ Delete Customer Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

module.exports = {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
};
