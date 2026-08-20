const Customer = require("../models/Customer");
const Party = require("../models/Party");
const JournalEntry = require("../models/JournalEntry");
const Account = require("../models/Account");
const { getCustomerBalanceFromJournal } = require("../utils/balanceHelper");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const Counter = require("../models/Counter");
const mongoose = require("mongoose");
const { logActivity } = require("../utils/activityLogger");

const escapeRegex = (text = "") => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getCustomerDataVersion = async (req, res) => {
  try {
    const userId =
      req.user?.businessOwnerId || req.user?.id || req.user?._id || req.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        message: "Invalid user",
      });
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);

    const [latestCustomer, latestJournal] = await Promise.all([
      Customer.findOne({
        createdBy: objectUserId,
      })
        .sort({ updatedAt: -1 })
        .select("updatedAt")
        .lean(),

      JournalEntry.findOne({
        createdBy: objectUserId,
        customerId: { $ne: null },
      })
        .sort({ updatedAt: -1 })
        .select("updatedAt")
        .lean(),
    ]);

    const customerTime = latestCustomer?.updatedAt
      ? new Date(latestCustomer.updatedAt).getTime()
      : 0;

    const journalTime = latestJournal?.updatedAt
      ? new Date(latestJournal.updatedAt).getTime()
      : 0;

    const version = Math.max(customerTime, journalTime);

    return res.json({
      version: String(version),
    });
  } catch (error) {
    console.error("Get Customer Data Version Error:", error);

    return res.status(500).json({
      message: "Failed to check customer data version",
    });
  }
};

// ✅ 1. Get customers with Active / Hidden support
const getCustomers = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        message: "Invalid or missing user",
      });
    }

    const objectUserId = new mongoose.Types.ObjectId(userId);

    const { search = "", status = "active" } = req.query;

    // ✅ Safe status value
    const safeStatus = ["active", "hidden", "all"].includes(status)
      ? status
      : "active";

    const query = {
      createdBy: objectUserId,
    };

    // ✅ Active / Hidden / All filter
    if (safeStatus === "active") {
      query.isActive = true;
    } else if (safeStatus === "hidden") {
      query.isActive = false;
    }

    // ✅ Safe search
    const cleanSearch = String(search || "").trim();

    if (cleanSearch) {
      query.name = {
        $regex: escapeRegex(cleanSearch),
        $options: "i",
      };
    }

    const customers = await Customer.find(query)
      .select(
        "name email phone address creditLimit type isActive hiddenReason openingBalance account createdBy createdAt updatedAt",
      )
      .populate("account", "_id name code type category normalBalance isActive")
      .sort({ createdAt: -1 })
      .lean();

    if (customers.length === 0) {
      return res.json([]);
    }

    // ✅ Customer account IDs collect
    const accountIds = customers
      .map((customer) => {
        if (!customer.account) return null;

        return customer.account._id || customer.account;
      })
      .filter(Boolean)
      .map((accountId) => new mongoose.Types.ObjectId(accountId));

    let balances = [];

    if (accountIds.length > 0) {
      balances = await JournalEntry.aggregate([
        {
          $match: {
            createdBy: objectUserId,
            isDeleted: false,
            "lines.account": {
              $in: accountIds,
            },
          },
        },
        {
          $unwind: "$lines",
        },
        {
          $match: {
            "lines.account": {
              $in: accountIds,
            },
          },
        },
        {
          $group: {
            _id: "$lines.account",

            debit: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$lines.type", "debit"],
                  },
                  "$lines.amount",
                  0,
                ],
              },
            },

            credit: {
              $sum: {
                $cond: [
                  {
                    $eq: ["$lines.type", "credit"],
                  },
                  "$lines.amount",
                  0,
                ],
              },
            },
          },
        },
        {
          $project: {
            _id: 1,
            balance: {
              $subtract: ["$debit", "$credit"],
            },
          },
        },
      ]);
    }

    const balanceMap = new Map();

    for (const item of balances) {
      balanceMap.set(item._id.toString(), Number(item.balance) || 0);
    }

    const result = customers.map((customer) => {
      const accountId =
        customer.account?._id?.toString() || customer.account?.toString() || "";

      return {
        ...customer,

        hiddenReason:
          customer.isActive === false ? customer.hiddenReason || null : null,

        balance: balanceMap.get(accountId) || 0,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("❌ Get Customers Error:", error);

    return res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
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
      isActive: true,

      openingBalance: 0,
    });

    // 👤 Create customer
    const customer = new Customer({
      name,
      email,
      phone,
      address,
      type,
      openingBalance: Number(openingBalance) || 0,
      account: account._id,
      createdBy: userId,
    });

    await customer.save();

    // ✅ Opening Sale Invoice
    if (openingBalance && Number(openingBalance) > 0) {
      let counter = await Counter.findOne({
        type: "sale_invoice",
        userId,
      });

      if (!counter) {
        counter = await Counter.create({
          type: "sale_invoice",
          userId,
          seq: 1000,
        });
      }

      counter.seq += 1;
      await counter.save();

      const openingInvoice = await Invoice.create({
        billNo: counter.seq.toString(),
        customerName: customer.name,
        customerPhone: customer.phone,
        invoiceDate: new Date(),
        items: [],
        totalAmount: Number(openingBalance),
        paidAmount: 0,
        status: "Unpaid",
        notes: "Opening Balance",
        isOpening: true,
        createdBy: userId,

        accountId: account._id,
        customerId: customer._id,
      });

      const openingBalanceAccount = await Account.findOne({
        userId,
        code: "OPENING_BALANCE",
      });

      const journal = await JournalEntry.create({
        date: new Date(),
        description: "Opening Balance Customer Invoice",
        createdBy: userId,
        customerId: customer._id,
        sourceType: "opening_sale_invoice",
        invoiceId: openingInvoice._id,

        billNo: openingInvoice.billNo,

        lines: [
          {
            account: account._id,
            type: "debit",
            amount: Number(openingBalance),
          },

          {
            account: openingBalanceAccount._id,
            type: "credit",
            amount: Number(openingBalance),
          },
        ],
      });

      openingInvoice.journalEntryId = journal._id;
      await openingInvoice.save();
    }

    // ✅ Opening Refund Invoice
    if (openingBalance && Number(openingBalance) < 0) {
      let counter = await Counter.findOne({
        type: "refund_invoice",
        userId,
      });

      if (!counter) {
        counter = await Counter.create({
          type: "refund_invoice",
          userId,
          seq: 1000,
        });
      }

      counter.seq += 1;
      await counter.save();

      const openingRefund = await RefundInvoice.create({
        billNo: counter.seq.toString(),
        customerName: customer.name,
        customerPhone: customer.phone,
        invoiceDate: new Date(),
        items: [],
        totalAmount: Math.abs(Number(openingBalance)),
        paidAmount: 0,
        status: "Unpaid",
        paymentType: "credit",
        notes: "Opening Balance",
        isOpening: true,
        createdBy: userId,
        accountId: account._id,
        customerId: customer._id,
      });

      const openingBalanceAccount = await Account.findOne({
        userId,
        code: "OPENING_BALANCE",
      });

      await JournalEntry.create({
        date: new Date(),
        description: "Opening Balance Customer Refund",
        createdBy: userId,
        customerId: customer._id,
        sourceType: "opening_refund_invoice",
        invoiceId: openingRefund._id,

        lines: [
          {
            account: openingBalanceAccount._id,
            type: "debit",
            amount: Math.abs(Number(openingBalance)),
          },

          {
            account: account._id,
            type: "credit",
            amount: Math.abs(Number(openingBalance)),
          },
        ],
      });
    }

    await logActivity({
      req,
      action: "create",
      module: "customers",
      entityType: "Customer",
      entityId: customer._id,
      title: `Customer ${customer.name}`,
      description: `${customer.name} Customer بنایا گیا`,
      after: {
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        type: customer.type,
        openingBalance: customer.openingBalance,
      },
    });

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

    const { name, email, phone, address, type, openingBalance } = req.body;
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
    currentCustomer.email = email || currentCustomer.email;
    currentCustomer.phone = phone || currentCustomer.phone;
    currentCustomer.address = address || currentCustomer.address;
    currentCustomer.type = type || currentCustomer.type;
    currentCustomer.openingBalance = Number(openingBalance) || 0;

    const beforeUpdate = {
      name: currentCustomer.name,
      phone: currentCustomer.phone,
      email: currentCustomer.email,
      address: currentCustomer.address,
      type: currentCustomer.type,
      openingBalance: currentCustomer.openingBalance,
    };

    await currentCustomer.save();

    await logActivity({
      req,
      action: "update",
      module: "customers",
      entityType: "Customer",
      entityId: currentCustomer._id,
      title: `Customer ${currentCustomer.name}`,
      description: `${currentCustomer.name} Customer Update کیا گیا`,
      before: beforeUpdate,
      after: {
        name: currentCustomer.name,
        phone: currentCustomer.phone,
        email: currentCustomer.email,
        address: currentCustomer.address,
        type: currentCustomer.type,
        openingBalance: currentCustomer.openingBalance,
      },
    });

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
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // 🔍 Check: is there ANY transaction?
    const hasLedger = await JournalEntry.exists({
      customerId: customer._id,
      isDeleted: false,
    });

    // 🟥 CASE 1: Ledger exists → Hide only
    if (hasLedger) {
      customer.isActive = false;
      customer.hiddenReason = "deleted";

      await customer.save();

      await logActivity({
        req,
        action: "delete",
        module: "customers",
        entityType: "Customer",
        entityId: customer._id,
        title: `Customer ${customer.name}`,
        description: `${customer.name} Hidden کیا گیا`,
        before: {
          name: customer.name,
          phone: customer.phone,
        },
        after: {
          status: "hidden",
        },
      });

      // ✅ Deactivate linked account also
      await Account.updateOne(
        { _id: customer.account },
        {
          $set: {
            isActive: false,
          },
        },
      );

      return res.json({
        message: "Customer has transactions, moved to hidden",
        status: "inactive",
        hiddenReason: "deleted",
      });
    }

    await Invoice.deleteMany({
      customerId: customer._id,
      isOpening: true,
    });

    // ✅ delete opening refunds
    await RefundInvoice.deleteMany({
      customerId: customer._id,
      isOpening: true,
    });

    // ✅ delete related opening journals
    await JournalEntry.deleteMany({
      customerId: customer._id,
      sourceType: {
        $in: ["opening_sale_invoice", "opening_refund_invoice"],
      },
    });

    // ✅ delete customer
    await Customer.deleteOne({
      _id: customer._id,
    });

    await logActivity({
      req,
      action: "delete",
      module: "customers",
      entityType: "Customer",
      entityId: customer._id,
      title: `Customer ${customer.name}`,
      description: `${customer.name} Permanently Delete کیا گیا`,
      before: {
        name: customer.name,
        phone: customer.phone,
      },
      after: {
        status: "deleted",
      },
    });

    // ✅ delete linked account
    await Account.deleteOne({
      _id: customer.account,
    });

    return res.json({
      message: "Customer deleted permanently (no transactions)",
      status: "deleted",
    });
  } catch (error) {
    console.error("❌ Delete/Deactivate customer error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// ✅ Restore deleted Customer from Hidden
const restoreCustomer = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
      isActive: false,
    });

    if (!customer) {
      return res.status(404).json({
        message: "Hidden customer not found",
      });
    }

    // ❌ Converted or merged customer cannot be restored
    if (customer.hiddenReason !== "deleted") {
      return res.status(400).json({
        message: "Only deleted customers can be restored",
      });
    }

    // ✅ Check same-name active customer
    const activeCustomerExists = await Customer.exists({
      _id: { $ne: customer._id },
      name: new RegExp(`^${escapeRegex(customer.name)}$`, "i"),
      createdBy: userId,
      isActive: true,
    });

    if (activeCustomerExists) {
      return res.status(400).json({
        message: "Active customer with same name already exists",
      });
    }

    // ✅ Check same-name active party
    const activePartyExists = await Party.exists({
      name: new RegExp(`^${escapeRegex(customer.name)}$`, "i"),
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (activePartyExists) {
      return res.status(400).json({
        message: "Active party with same name already exists",
      });
    }

    customer.isActive = true;
    customer.hiddenReason = null;

    await customer.save();

    await logActivity({
      req,
      action: "restore",
      module: "customers",
      entityType: "Customer",
      entityId: customer._id,
      title: `Customer ${customer.name}`,
      description: `${customer.name} Restore کیا گیا`,
    });

    await Account.updateOne(
      {
        _id: customer.account,
        userId,
      },
      {
        $set: {
          isActive: true,
        },
      },
    );

    return res.json({
      message: "Customer restored successfully",
      customer,
    });
  } catch (error) {
    console.error("❌ Restore Customer Error:", error);

    return res.status(500).json({
      message: "Customer restore failed",
      error: error.message,
    });
  }
};

const createPartyOpeningFromCustomer = async ({
  userId,
  party,
  partyAccountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  let openingBalanceAccount = await Account.findOne({
    userId,
    code: "OPENING_BALANCE",
  });

  if (!openingBalanceAccount) {
    openingBalanceAccount = await Account.create({
      userId,
      name: "opening balance equity",
      type: "Equity",
      normalBalance: "credit",
      code: "OPENING_BALANCE",
      category: "other",
      isSystem: true,
    });
  }

  if (amount > 0) {
    let counter = await Counter.findOne({
      type: "sale_invoice",
      userId,
    });

    if (!counter) {
      counter = await Counter.create({
        type: "sale_invoice",
        userId,
        seq: 1000,
      });
    }

    counter.seq += 1;
    await counter.save();

    const openingInvoice = await Invoice.create({
      billNo: counter.seq.toString(),
      customerName: party.name,
      customerPhone: party.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: amount,
      paidAmount: 0,
      status: "Unpaid",
      notes: "Opening Balance From Customer",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    const journal = await JournalEntry.create({
      date: new Date(),
      description: "Opening Balance Party From Customer",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_sale_invoice",
      invoiceId: openingInvoice._id,
      referenceId: openingInvoice._id,
      billNo: openingInvoice.billNo,
      lines: [
        {
          account: partyAccountId,
          type: "debit",
          amount,
        },
        {
          account: openingBalanceAccount._id,
          type: "credit",
          amount,
        },
      ],
    });

    openingInvoice.journalEntryId = journal._id;
    await openingInvoice.save();

    return journal;
  }

  if (amount < 0) {
    const absAmount = Math.abs(amount);

    let counter = await Counter.findOne({
      type: "refund_invoice",
      userId,
    });

    if (!counter) {
      counter = await Counter.create({
        type: "refund_invoice",
        userId,
        seq: 1000,
      });
    }

    counter.seq += 1;
    await counter.save();

    const openingRefund = await RefundInvoice.create({
      billNo: counter.seq.toString(),
      customerName: party.name,
      customerPhone: party.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: absAmount,
      paidAmount: 0,
      paymentType: "credit",
      notes: "Opening Balance From Customer",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    return await JournalEntry.create({
      date: new Date(),
      description: "Opening Balance Party Refund From Customer",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_refund_invoice",
      invoiceId: openingRefund._id,
      referenceId: openingRefund._id,
      billNo: openingRefund.billNo,
      lines: [
        {
          account: openingBalanceAccount._id,
          type: "debit",
          amount: absAmount,
        },
        {
          account: partyAccountId,
          type: "credit",
          amount: absAmount,
        },
      ],
    });
  }
};

const convertCustomerToParty = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const customerId = req.params.id;

    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
      isActive: true,
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const existingParty = await Party.findOne({
      name: new RegExp(`^${escapeRegex(customer.name)}$`, "i"),
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (existingParty) {
      return res.status(400).json({
        message: "Party with same name already exists",
      });
    }

    const closingBalance = await getCustomerBalanceFromJournal(
      customer._id,
      userId,
    );

    const lastAcc = await Account.findOne({
      userId,
      code: { $regex: /^ACC-\d+$/ },
    }).sort({ createdAt: -1 });

    let code = "ACC-0001";

    if (lastAcc?.code) {
      const lastNum = Number(lastAcc.code.replace("ACC-", ""));
      if (!isNaN(lastNum)) {
        code = `ACC-${String(lastNum + 1).padStart(4, "0")}`;
      }
    }

    const partyAccount = await Account.create({
      userId,
      name: customer.name,
      type: "Asset",
      normalBalance: "debit",
      code,
      category: "party",
      openingBalance: 0,
    });

    const party = await Party.create({
      name: customer.name,
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      role: "both",
      openingBalance: closingBalance,
      account: partyAccount._id,
      userId,
    });

    await createPartyOpeningFromCustomer({
      userId,
      party,
      partyAccountId: partyAccount._id,
      openingBalance: closingBalance,
    });

    customer.isActive = false;
    customer.hiddenReason = "converted";

    await customer.save();

    await Account.updateOne(
      { _id: customer.account },
      { $set: { isActive: false } },
    );

    await recalculateAccountBalance(partyAccount._id);

    await logActivity({
      req,
      action: "convert",
      module: "customers",
      entityType: "Customer",
      entityId: customer._id,
      title: `Customer ${customer.name}`,
      description: `${customer.name} کو Party میں Convert کیا گیا`,
    });

    return res.status(201).json({
      message: "Customer converted to party successfully",
      party,
      openingBalance: closingBalance,
    });
  } catch (error) {
    console.error("❌ Convert Customer To Party Error:", error);
    res.status(500).json({
      message: "Convert customer to party failed",
      error: error.message,
    });
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
    sourceCustomer.hiddenReason = "merged";

    await sourceCustomer.save();

    // 🔥 4️⃣ Deactivate source account
    await Account.updateOne(
      { _id: sourceAccountId },
      { $set: { isActive: false } },
    );
    await recalculateAccountBalance(targetAccountId);

    await logActivity({
      req,
      action: "merge",
      module: "customers",
      entityType: "Customer",
      entityId: targetCustomer._id,
      title: `Customer Merge`,
      description: `${sourceCustomer.name} کو ${targetCustomer.name} میں Merge کیا گیا`,
    });
    res.json({
      message: "Customers merged successfully",
      mergedInto: targetCustomer._id,
    });
  } catch (error) {
    console.error("Confirm merge error:", error);
    res.status(500).json({ message: "Merge failed" });
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

    let openingBalance = 0;

    if (startDate) {
      const result = await JournalEntry.aggregate([
        {
          $match: {
            createdBy: userId,
            isDeleted: false,
            "lines.account": customer.account._id,
            date: { $lt: new Date(startDate) },
          },
        },
        { $unwind: "$lines" },
        {
          $match: {
            "lines.account": customer.account._id,
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

      openingBalance = result[0]?.balance || 0;
    }

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
      .select(
        "date time billNo description sourceType lines invoiceId referenceId",
      )
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
      if (
        (entry.sourceType === "sale_invoice" ||
          entry.sourceType === "opening_sale_invoice") &&
        entry.invoiceId
      ) {
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
      if (
        (entry.sourceType === "refund_invoice" ||
          entry.sourceType === "opening_refund_invoice") &&
        entry.invoiceId
      ) {
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
  getCustomerDataVersion,
  addCustomer,
  updateCustomer,
  deleteCustomer,
  restoreCustomer,
  confirmMergeCustomers,
  convertCustomerToParty,

  getCustomerDetailedLedger,
};
