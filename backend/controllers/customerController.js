const Customer = require("../models/Customer");
const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const { getCustomerBalanceFromJournal } = require("../utils/balanceHelper");
const { recalculateAccountBalance } = require("../utils/balanceHelper");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");

// ✅ 1. Get all customers with balance
const getCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const customers = await Customer.find({
      createdBy: userId,
      isActive: true,
    }).populate("account");

    const customersWithBalance = await Promise.all(
      customers.map(async (cust) => {
        const balance = await getCustomerBalanceFromJournal(cust._id, userId);
        return {
          ...cust.toObject(),
          balance,
        };
      }),
    );

    res.json(customersWithBalance);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ 2. Add new customer with linked account & opening balance
const addCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { name, email, phone, address, type, openingBalance } = req.body;

    // 🔍 Check duplicate active customer (same name)
    const existingCustomer = await Customer.findOne({
      name: new RegExp(`^${name}$`, "i"),
      createdBy: userId,
      isActive: true,
    });

    if (existingCustomer) {
      return res.status(200).json({
        duplicate: true,
        message: "Customer already exists",
        customerId: existingCustomer._id,
      });
    }

    // 🔢 Generate SAFE unique account code (ACC-0001, ACC-0002, ...)
    const lastAcc = await Account.findOne({
      userId,
      code: { $regex: /^ACC-\d+$/ },
    })
      .sort({ createdAt: -1 })
      .lean();

    let newCode = "ACC-0001";

    if (lastAcc && lastAcc.code) {
      const lastNum = Number(lastAcc.code.replace("ACC-", ""));
      if (!isNaN(lastNum)) {
        newCode = `ACC-${String(lastNum + 1).padStart(4, "0")}`;
      }
    }

    // 🧾 Create linked account
    const account = await Account.create({
      userId,
      name: `Customer: ${name}`,
      type: "Asset",
      normalBalance: "debit",
      code: newCode,
      category: "customer",

      openingBalance: Number(openingBalance) || 0,
    });

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

    await customer.save();

    // 💰 Journal Entry for opening balance
    if (openingBalance && Number(openingBalance) !== 0) {
      let openingBalanceAccount = await Account.findOne({
        userId,
        code: "OPENING_BALANCE",
      });

      if (!openingBalanceAccount) {
        openingBalanceAccount = await Account.create({
          userId,
          name: "opening balance equity",
          type: "Equity",
          category: "other",
          code: "OPENING_BALANCE",
          normalBalance: "credit",
          isSystem: true,
          openingBalance: 0,
        });
      }
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
            amount: openingBalance,
          },
          {
            account: openingBalanceAccount._id,
            type: "credit",
            amount: openingBalance,
          },
        ],
      });
    }

    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ 3. Update customer
const updateCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    const { name } = req.body;

    // 1️⃣ جس customer کو edit کر رہے ہیں، وہ نکالو
    const currentCustomer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
      isActive: true,
    });

    if (!currentCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // 2️⃣ اگر نام change ہو رہا ہے
    if (name && name.toLowerCase() !== currentCustomer.name.toLowerCase()) {
      // same نام والا دوسرا customer ڈھونڈو
      const otherCustomer = await Customer.findOne({
        name: new RegExp(`^${name}$`, "i"),
        createdBy: userId,
        isActive: true,
        _id: { $ne: currentCustomer._id },
      });

      if (otherCustomer) {
        // 3️⃣ دونوں کا ledger (journal) ہے یا نہیں؟
        const currentLedgerCount = await JournalEntry.countDocuments({
          customerId: currentCustomer._id,
          isDeleted: false,
        });

        const otherLedgerCount = await JournalEntry.countDocuments({
          customerId: otherCustomer._id,
          isDeleted: false,
        });

        // 4️⃣ اگر دونوں کے ledger موجود ہیں → MERGE پوچھو
        if (currentLedgerCount > 0 && otherLedgerCount > 0) {
          return res.status(200).json({
            mergeRequired: true,
            message: "Customer with same name exists. Merge?",
            sourceCustomerId: currentCustomer._id,
            targetCustomerId: otherCustomer._id,
          });
        }

        // 5️⃣ ورنہ name change allow نہیں
        return res.status(400).json({
          message: "Customer name already exists. Please choose another name.",
        });
      }
    }

    // 6️⃣ Safe update
    currentCustomer.name = name || currentCustomer.name;
    currentCustomer.email = req.body.email || currentCustomer.email;
    currentCustomer.phone = req.body.phone || currentCustomer.phone;
    currentCustomer.address = req.body.address || currentCustomer.address;
    currentCustomer.type = req.body.type || currentCustomer.type;

    await currentCustomer.save();

    res.json(currentCustomer);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ Delete OR Deactivate customer (Smart rule)
const deleteCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // 🔍 Check: is there ANY transaction?
    const hasLedger = await JournalEntry.exists({
      customerId: customer._id,
      isDeleted: false,
    });

    // 🟥 CASE 1: Ledger exists → सिर्फ Hide
    if (hasLedger) {
      customer.isActive = false;
      await customer.save();

      return res.json({
        message: "Customer has transactions, marked as inactive",
        status: "inactive",
      });
    }

    // 🟢 CASE 2: No ledger → Proper delete
    await Customer.deleteOne({ _id: customer._id });

    // delete linked account also
    await Account.deleteOne({ _id: customer.account });

    return res.json({
      message: "Customer deleted permanently (no transactions)",
      status: "deleted",
    });
  } catch (error) {
    console.error("❌ Delete/Deactivate customer error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ CONFIRM MERGE CUSTOMERS (PRO LEVEL – FUTURE SAFE)
const confirmMergeCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { sourceCustomerId, targetCustomerId } = req.body;

    if (sourceCustomerId === targetCustomerId) {
      return res.status(400).json({ message: "Cannot merge same record" });
    }

    const sourceCustomer = await Customer.findOne({
      _id: sourceCustomerId,
      createdBy: userId,
      isActive: true,
    });

    const targetCustomer = await Customer.findOne({
      _id: targetCustomerId,
      createdBy: userId,
      isActive: true,
    });

    if (!sourceCustomer || !targetCustomer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const sourceAccountId = sourceCustomer.account;
    const targetAccountId = targetCustomer.account;

    // 🔥 1️⃣ Update Journal customerId
    await JournalEntry.updateMany(
      { customerId: sourceCustomer._id, isDeleted: false },
      { $set: { customerId: targetCustomer._id } },
    );

    // 🔥 2️⃣ Update Journal lines account
    const journals = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      "lines.account": sourceAccountId,
    });

    for (const journal of journals) {
      journal.lines = journal.lines.map((line) => {
        if (line.account?.toString() === sourceAccountId.toString()) {
          return {
            ...line,
            account: targetAccountId,
          };
        }
        return line;
      });

      await journal.save();
    }

    // 🔥 3️⃣ Deactivate source customer
    sourceCustomer.isActive = false;
    await sourceCustomer.save();

    // 🔥 4️⃣ Deactivate source account
    await Account.updateOne(
      { _id: sourceAccountId },
      { $set: { isActive: false } },
    );
    await recalculateAccountBalance(targetAccountId);
    res.json({
      message: "Customers merged successfully",
      mergedInto: targetCustomer._id,
    });
  } catch (error) {
    console.error("Confirm merge error:", error);
    res.status(500).json({ message: "Merge failed" });
  }
};

// 📒 CUSTOMER LEDGER (DISABLED – NOT USED ANYMORE)

const getCustomerLedger = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.customerId;
    const { startDate, endDate } = req.query;

    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
      isActive: true,
    }).populate("account");

    if (!customer || !customer.account) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const accountId = customer.account._id.toString();

    const matchFilter = {
      createdBy: userId,
      customerId: customer._id,
      isDeleted: false,
    };

    if (startDate && endDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);

      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);

      matchFilter.date = { $gte: s, $lte: e };
    }

    const journals = await JournalEntry.find(matchFilter)
      .sort({ date: 1, time: 1 })
      .lean();

    let openingBalance = 0;

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(23, 59, 59, 999);

      const prevJournals = await JournalEntry.find({
        createdBy: userId,
        customerId: customer._id,
        isDeleted: false,
        date: { $lte: start },
      }).lean();

      prevJournals.forEach((entry) => {
        entry.lines.forEach((line) => {
          if (line.account?.toString() === accountId) {
            openingBalance +=
              line.type === "debit" ? line.amount : -line.amount;
          }
        });
      });
    }

    let balance = openingBalance;
    const ledger = [];

    for (const entry of journals) {
      for (const line of entry.lines) {
        if (line.account?.toString() !== accountId) continue;

        const debit = line.type === "debit" ? line.amount : 0;
        const credit = line.type === "credit" ? line.amount : 0;

        balance += debit - credit;

        ledger.push({
          _id: entry._id,
          date: entry.date,
          time: entry.time || "",
          billNo: entry.billNo || "",
          description: entry.description || "",
          sourceType: entry.sourceType || "",
          debit,
          credit,
          balance,
          runningBalance: balance,
        });
      }
    }

    res.json({
      customerName: customer.name,
      openingBalance,
      ledger,
      closingBalance: balance,
    });
  } catch (error) {
    res.status(500).json({ message: "Ledger fetch failed" });
  }
};

// 📘 CUSTOMER DETAILED LEDGER (Invoice + Payment + Refund)

const getCustomerDetailedLedger = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id: customerId } = req.params;
    const { startDate, endDate } = req.query;

    // 1️⃣ Customer + account
    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    }).populate("account");

    if (!customer || !customer.account) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const accountId = customer.account._id.toString();

    // ===============================
    // 🔑 STEP 1: OPENING BALANCE (NEW – FIX)
    // ===============================
    let openingBalance = 0;

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(23, 59, 59, 999);

      const prevJournals = await JournalEntry.find({
        createdBy: userId,
        customerId: customer._id,
        isDeleted: false,
        date: { $lt: new Date(startDate) },
      }).lean();

      for (const entry of prevJournals) {
        for (const line of entry.lines) {
          if (line.account?.toString() === accountId) {
            openingBalance +=
              line.type === "debit" ? line.amount : -line.amount;
          }
        }
      }
    }

    // ===============================
    // 🔄 STEP 2: MAIN LEDGER (OLD FEATURES KE SATH)
    // ===============================
    const match = {
      createdBy: userId,
      customerId: customer._id,
      isDeleted: false,
    };

    if (startDate && endDate) {
      const s = new Date(startDate);
      s.setHours(0, 0, 0, 0);

      const e = new Date(endDate);
      e.setHours(23, 59, 59, 999);

      match.date = { $gte: s, $lte: e };
    }

    const journals = await JournalEntry.find(match)
      .sort({ date: 1, time: 1 })
      .lean();

    let balance = openingBalance;
    let totalDebit = 0;
    let totalCredit = 0;

    const ledger = [];

    for (const entry of journals) {
      const customerLines = entry.lines.filter(
        (l) => l.account?.toString() === accountId,
      );

      if (customerLines.length === 0) continue;

      let debit = 0;
      let credit = 0;

      for (const line of customerLines) {
        if (line.type === "debit") debit += line.amount;
        if (line.type === "credit") credit += line.amount;
      }

      totalDebit += debit;
      totalCredit += credit;
      balance += debit - credit;

      const row = {
        _id: entry._id,
        referenceId: entry.referenceId || entry._id,
        date: entry.date,
        time: entry.time || "",
        billNo: entry.billNo || "",
        sourceType: entry.sourceType,
        description: entry.description || "",
        debit,
        credit,
        balance,
        items: [],
      };

      // 🟡 SALE INVOICE (RESTORED)
      if (entry.sourceType === "sale_invoice" && entry.invoiceId) {
        const invoice = await Invoice.findById(entry.invoiceId).populate(
          "items.productId",
          "name",
        );

        if (invoice) {
          row.invoiceTotal = invoice.totalAmount;
          row.items = invoice.items.map((it) => ({
            productName: it.productId?.name || "Product",
            quantity: it.quantity,
            rate: it.price,
            total: it.total,
          }));
        }
      }

      // 🔴 REFUND INVOICE (RESTORED)
      if (entry.sourceType === "refund_invoice" && entry.invoiceId) {
        const refund = await RefundInvoice.findById(entry.invoiceId).populate(
          "items.productId",
          "name",
        );

        if (refund) {
          row.invoiceTotal = refund.totalAmount;
          row.items = refund.items.map((it) => ({
            productName: it.productId?.name || "Product",
            quantity: it.quantity,
            rate: it.price,
            total: it.total,
          }));
        }
      }

      ledger.push(row);
    }

    // ===============================
    // ✅ FINAL RESPONSE
    // ===============================
    res.json({
      customerName: customer.name,
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance: balance,
      ledger,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getCustomers,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  confirmMergeCustomers,
  getCustomerLedger,
  getCustomerDetailedLedger,
};
