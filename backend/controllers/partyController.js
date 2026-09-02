const mongoose = require("mongoose");
const Party = require("../models/Party");
const Customer = require("../models/Customer");
const Supplier = require("../models/Supplier");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const Invoice = require("../models/Invoice");
const RefundInvoice = require("../models/RefundInvoice");
const PurchaseInvoice = require("../models/purchaseInvoice");
const PurchaseReturn = require("../models/PurchaseReturn");
const Counter = require("../models/Counter");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { logActivity } = require("../utils/activityLogger");

const escapeRegex = (text = "") => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getUserId = (req) => req.user?.id || req.userId;

exports.getPartyDataVersion = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const partyAccounts = await Party.find({
      userId: userObjectId,
    })
      .select("account")
      .lean();

    const accountIds = partyAccounts
      .map((party) => party.account)
      .filter(Boolean);

    const [latestParty, latestJournal] = await Promise.all([
      Party.findOne({
        userId: userObjectId,
      })
        .sort({ updatedAt: -1 })
        .select("updatedAt")
        .lean(),

      accountIds.length > 0
        ? JournalEntry.findOne({
            createdBy: userObjectId,
            isDeleted: { $ne: true },
            "lines.account": { $in: accountIds },
          })
            .sort({ updatedAt: -1 })
            .select("updatedAt")
            .lean()
        : null,
    ]);

    const partyTime = latestParty?.updatedAt
      ? new Date(latestParty.updatedAt).getTime()
      : 0;

    const journalTime = latestJournal?.updatedAt
      ? new Date(latestJournal.updatedAt).getTime()
      : 0;

    return res.json({
      version: String(Math.max(partyTime, journalTime)),
    });
  } catch (error) {
    console.error("Get Party Data Version Error:", error);

    return res.status(500).json({
      message: "Failed to check party data version",
    });
  }
};

const generateAccountCode = async (userId) => {
  const lastAccount = await Account.findOne({
    userId,
    code: { $regex: /^ACC-\d+$/ },
  }).sort({ createdAt: -1 });

  let nextNumber = 1;

  if (lastAccount?.code) {
    const lastNum = Number(lastAccount.code.replace("ACC-", ""));
    if (!isNaN(lastNum)) {
      nextNumber = lastNum + 1;
    }
  }

  return `ACC-${String(nextNumber).padStart(4, "0")}`;
};

const getOrCreateOpeningBalanceAccount = async (userId) => {
  let openingAccount = await Account.findOne({
    userId,
    code: "OPENING_BALANCE",
  });

  if (!openingAccount) {
    openingAccount = await Account.create({
      userId,
      name: "opening balance equity",
      type: "Equity",
      normalBalance: "credit",
      code: "OPENING_BALANCE",
      category: "other",
      isSystem: true,
    });
  }

  return openingAccount;
};

const createPartyOpeningEntry = async ({
  userId,
  party,
  partyAccountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  const openingBalanceAccount = await getOrCreateOpeningBalanceAccount(userId);

  // ✅ Positive = Opening Sale Invoice
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
      notes: "Opening Balance",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    const journal = await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Balance Party Invoice",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_sale_invoice",
      originModule: "party_opening_balance",
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

    await recalculateAccountBalance(partyAccountId);
    await recalculateAccountBalance(openingBalanceAccount._id);

    return journal;
  }

  // ✅ Negative = Opening Refund Invoice
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
      notes: "Opening Balance",
      isOpening: true,
      createdBy: userId,
      accountId: partyAccountId,
      partyId: party._id,
    });

    const journal = await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Balance Party Refund",
      createdBy: userId,
      partyId: party._id,
      sourceType: "opening_refund_invoice",
      originModule: "party_opening_balance",
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

    await recalculateAccountBalance(partyAccountId);
    await recalculateAccountBalance(openingBalanceAccount._id);

    return journal;
  }
};

const getPartyBalance = async (partyAccountId, userId) => {
  if (!partyAccountId) return 0;

  const objectId = new mongoose.Types.ObjectId(partyAccountId);

  const result = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        "lines.account": objectId,
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": objectId,
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

const createCustomerOpeningEntryFromParty = async ({
  userId,
  customer,
  accountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  const openingBalanceAccount = await getOrCreateOpeningBalanceAccount(userId);

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
      customerName: customer.name,
      customerPhone: customer.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: amount,
      paidAmount: 0,
      status: "Unpaid",
      notes: "Opening Balance From Party",
      isOpening: true,
      createdBy: userId,
      accountId,
      customerId: customer._id,
    });

    const journal = await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Balance Customer From Party",
      createdBy: userId,
      customerId: customer._id,
      sourceType: "opening_sale_invoice",
      invoiceId: openingInvoice._id,
      referenceId: openingInvoice._id,
      billNo: openingInvoice.billNo,
      lines: [
        {
          account: accountId,
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
      customerName: customer.name,
      customerPhone: customer.phone || "",
      invoiceDate: new Date(),
      items: [],
      totalAmount: absAmount,
      paidAmount: 0,
      paymentType: "credit",
      notes: "Opening Balance From Party",
      isOpening: true,
      createdBy: userId,
      accountId,
      customerId: customer._id,
    });

    return await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Balance Customer Refund From Party",
      createdBy: userId,
      customerId: customer._id,
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
          account: accountId,
          type: "credit",
          amount: absAmount,
        },
      ],
    });
  }
};

const createSupplierOpeningEntryFromParty = async ({
  userId,
  supplier,
  accountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  const openingBalanceAccount = await getOrCreateOpeningBalanceAccount(userId);

  if (amount > 0) {
    const openingInvoice = await PurchaseInvoice.create({
      billNo: "OPENING",
      invoiceDate: new Date(),
      supplier: supplier._id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone || "",
      items: [],
      totalAmount: amount,
      grandTotal: amount,
      paidAmount: 0,
      status: "Unpaid",
      paymentType: "credit",
      userId,
    });

    return await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Purchase Invoice From Party",
      createdBy: userId,
      supplierId: supplier._id,
      sourceType: "opening_purchase_invoice",
      invoiceId: openingInvoice._id,
      referenceId: openingInvoice._id,
      billNo: openingInvoice.billNo,
      lines: [
        {
          account: openingBalanceAccount._id,
          type: "debit",
          amount,
        },
        {
          account: accountId,
          type: "credit",
          amount,
        },
      ],
    });
  }

  if (amount < 0) {
    const absAmount = Math.abs(amount);

    const openingReturn = await PurchaseReturn.create({
      billNo: "OPENING",
      returnDate: new Date(),
      supplierId: supplier._id,
      supplierName: supplier.name,
      supplierPhone: supplier.phone || "",
      items: [],
      totalAmount: absAmount,
      paidAmount: 0,
      paymentType: "",
      notes: "Opening Purchase Return From Party",
      createdBy: userId,
    });

    return await JournalEntry.create({
      date: new Date(),
      time: new Date().toTimeString().slice(0, 8),
      description: "Opening Purchase Return From Party",
      createdBy: userId,
      supplierId: supplier._id,
      sourceType: "opening_purchase_return",
      invoiceId: openingReturn._id,
      referenceId: openingReturn._id,
      billNo: openingReturn.billNo,
      lines: [
        {
          account: accountId,
          type: "debit",
          amount: absAmount,
        },
        {
          account: openingBalanceAccount._id,
          type: "credit",
          amount: absAmount,
        },
      ],
    });
  }
};

exports.createParty = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      name,
      phone = "",
      email = "",
      address = "",
      notes = "",
      role = "both",
      openingBalance = 0,
    } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Party name is required" });
    }

    const cleanName = name.trim();

    const existing = await Party.findOne({
      userId,
      isDeleted: false,
      name: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
    });

    if (existing) {
      return res.status(400).json({
        message: "Party already exists",
      });
    }

    let account = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const code = await generateAccountCode(userId);

        account = await Account.create({
          userId,
          name: cleanName,
          code,

          // ✅ Dynamic account type by role
          type: role === "supplier" ? "Liability" : "Asset",

          // ✅ Dynamic normal balance
          normalBalance: role === "supplier" ? "credit" : "debit",

          category: "party",
          openingBalance: Number(openingBalance) || 0,
          isSystem: false,
        });

        break;
      } catch (err) {
        if (err.code !== 11000 || attempt === 4) {
          throw err;
        }
      }
    }

    if (!account) {
      return res.status(500).json({ message: "Party account creation failed" });
    }

    const party = await Party.create({
      name: cleanName,
      phone,
      email,
      address,
      notes,
      role,
      openingBalance: Number(openingBalance) || 0,
      account: account._id,
      userId,
    });

    await createPartyOpeningEntry({
      userId,
      party,
      partyAccountId: account._id,
      openingBalance: Number(openingBalance) || 0,
    });

    const balance = await getPartyBalance(account._id, userId);

    await logActivity({
      req,
      action: "create",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party بنائی گئی`,
      after: {
        name: party.name,
        phone: party.phone,
        email: party.email,
        address: party.address,
        notes: party.notes,
        role: party.role,
        openingBalance: party.openingBalance,
        account: party.account,
        balance,
      },
    });

    return res.status(201).json({
      ...party.toObject(),
      balance,
    });
  } catch (err) {
    console.error("❌ Create Party Error:", err);
    return res.status(500).json({
      message: "Party create failed",
      error: err.message,
    });
  }
};

//GET PARTIES

exports.getParties = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      search = "",
      role = "",
      status = "active",
      limit = 0,
      page = 1,
      includeBalance = "true",
    } = req.query;

    const query = {
      userId,
      isDeleted: false,
    };

    // ✅ Active / Hidden / All
    if (status === "active") {
      query.isActive = true;
    } else if (status === "hidden" || status === "inactive") {
      query.isActive = false;
    }

    // ✅ Role filter
    if (role && ["customer", "supplier", "both"].includes(role)) {
      query.role = role;
    }

    // ✅ Safe search
    const cleanSearch = String(search || "").trim();

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 0, 0);

    let partyQuery = Party.find(query)
      .select(
        "name phone email address notes role openingBalance account isActive isDeleted hiddenReason createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();

    // ✅ Pagination database پر ہوگی
    if (limitNumber > 0) {
      partyQuery = partyQuery
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber);
    }

    const parties = await partyQuery;

    if (parties.length === 0) {
      return res.json([]);
    }

    const shouldIncludeBalance =
      String(includeBalance).trim().toLowerCase() !== "false";

    if (!shouldIncludeBalance) {
      return res.json(
        parties.map((party) => ({
          ...party,
          balance: 0,
        })),
      );
    }

    const accountIds = parties
      .map((party) => party.account)
      .filter(Boolean)
      .map((accountId) => new mongoose.Types.ObjectId(accountId));

    let balanceRows = [];

    if (accountIds.length > 0) {
      // ✅ تمام Party balances صرف ایک query سے
      balanceRows = await JournalEntry.aggregate([
        {
          $match: {
            createdBy: new mongoose.Types.ObjectId(userId),
            isDeleted: false,
            "lines.account": { $in: accountIds },
          },
        },
        {
          $unwind: "$lines",
        },
        {
          $match: {
            "lines.account": { $in: accountIds },
          },
        },
        {
          $group: {
            _id: "$lines.account",
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
    }

    const balanceMap = new Map(
      balanceRows.map((row) => [row._id.toString(), Number(row.balance) || 0]),
    );

    const result = parties.map((party) => ({
      ...party,
      balance: party.account
        ? balanceMap.get(party.account.toString()) || 0
        : 0,
    }));

    return res.json(result);
  } catch (err) {
    console.error("❌ Get Parties Error:", err);

    return res.status(500).json({
      message: "Failed to fetch parties",
      error: err.message,
    });
  }
};

exports.getPartyById = async (req, res) => {
  try {
    const userId = getUserId(req);

    const party = await Party.findOne({
      _id: req.params.id,
      userId,
      isDeleted: false,
    }).populate("account");

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const accountId = party.account?._id || party.account;
    const balance = await getPartyBalance(accountId, userId);

    return res.json({
      ...party.toObject(),
      balance,
    });
  } catch (err) {
    console.error("❌ Get Party Error:", err);
    return res.status(500).json({
      message: "Failed to fetch party",
      error: err.message,
    });
  }
};

exports.updateParty = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partyId = req.params.id;

    const {
      name,
      phone = "",
      email = "",
      address = "",
      notes = "",
      role = "both",
      openingBalance = 0,
      isActive,
    } = req.body;

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
    });

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const beforeUpdate = {
      name: party.name,
      phone: party.phone,
      email: party.email,
      address: party.address,
      notes: party.notes,
      role: party.role,
      openingBalance: party.openingBalance,
      isActive: party.isActive,
      hiddenReason: party.hiddenReason,
      account: party.account,
    };

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Party name is required" });
    }

    const cleanName = name.trim();

    const duplicate = await Party.findOne({
      userId,
      isDeleted: false,
      _id: { $ne: party._id },
      name: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
    });

    if (duplicate) {
      return res.status(400).json({
        message: "Another party with same name already exists",
      });
    }

    const oldOpening = Number(party.openingBalance) || 0;
    const newOpening = Number(openingBalance) || 0;

    party.name = cleanName;
    party.phone = phone;
    party.email = email;
    party.address = address;
    party.notes = notes;
    party.role = role;
    party.openingBalance = newOpening;

    if (typeof isActive === "boolean" && party.hiddenReason !== "converted") {
      party.isActive = isActive;
    }

    await party.save();

    await Account.updateOne(
      { _id: party.account, userId },
      {
        $set: {
          name: cleanName,
          openingBalance: newOpening,
          isActive: party.isActive,

          // ✅ Dynamic update
          type: role === "supplier" ? "Liability" : "Asset",

          normalBalance: role === "supplier" ? "credit" : "debit",
        },
      },
    );

    if (oldOpening !== newOpening) {
      const oldJournals = await JournalEntry.find({
        partyId: party._id,
        createdBy: userId,
        sourceType: {
          $in: [
            "opening_balance",
            "opening_sale_invoice",
            "opening_refund_invoice",
          ],
        },
        originModule: "party_opening_balance",
        isDeleted: false,
      });

      await JournalEntry.updateMany(
        {
          partyId: party._id,
          createdBy: userId,
          sourceType: {
            $in: [
              "opening_balance",
              "opening_sale_invoice",
              "opening_refund_invoice",
            ],
          },
          isDeleted: false,
        },
        {
          $set: { isDeleted: true },
        },
      );

      await Invoice.updateMany(
        {
          partyId: party._id,
          createdBy: userId,
          isOpening: true,
          isDeleted: false,
        },
        {
          $set: { isDeleted: true },
        },
      );

      await RefundInvoice.updateMany(
        {
          partyId: party._id,
          createdBy: userId,
          isOpening: true,
          isDeleted: false,
        },
        {
          $set: { isDeleted: true },
        },
      );

      for (const journal of oldJournals) {
        for (const line of journal.lines) {
          await recalculateAccountBalance(line.account);
        }
      }

      await createPartyOpeningEntry({
        userId,
        party,
        partyAccountId: party.account,
        openingBalance: newOpening,
      });
    }
    await recalculateAccountBalance(party.account);

    const updatedParty = await Party.findOne({
      _id: party._id,
      userId,
      isDeleted: false,
    }).populate("account");

    const balance = await getPartyBalance(party.account, userId);

    await logActivity({
      req,
      action: "update",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party Update کی گئی`,
      before: beforeUpdate,
      after: {
        name: party.name,
        phone: party.phone,
        email: party.email,
        address: party.address,
        notes: party.notes,
        role: party.role,
        openingBalance: party.openingBalance,
        isActive: party.isActive,
        hiddenReason: party.hiddenReason,
        account: party.account,
        balance,
      },
    });

    return res.json({
      ...updatedParty.toObject(),
      balance,
    });
  } catch (err) {
    console.error("❌ Update Party Error:", err);
    return res.status(500).json({
      message: "Party update failed",
      error: err.message,
    });
  }
};

exports.deleteParty = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partyId = req.params.id;

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
    });

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const beforeDelete = {
      name: party.name,
      phone: party.phone,
      email: party.email,
      address: party.address,
      notes: party.notes,
      role: party.role,
      openingBalance: party.openingBalance,
      isActive: party.isActive,
      hiddenReason: party.hiddenReason,
      account: party.account,
    };

    const hasLedger = await JournalEntry.exists({
      partyId: party._id,
      createdBy: userId,
      isDeleted: false,
    });

    if (hasLedger) {
      party.isActive = false;
      party.hiddenReason = "deleted";

      await party.save();

      await Account.updateOne(
        { _id: party.account, userId },
        { $set: { isActive: false } },
      );

      await logActivity({
        req,
        action: "delete",
        module: "parties",
        entityType: "Party",
        entityId: party._id,
        title: `Party ${party.name}`,
        description: `${party.name} Party Hidden کی گئی`,
        before: beforeDelete,
        after: {
          isActive: false,
          hiddenReason: "deleted",
          status: "hidden",
        },
      });

      return res.json({
        message: "Party has transactions, moved to hidden",
        status: "inactive",
        hiddenReason: "deleted",
      });
    }

    await Party.deleteOne({ _id: party._id, userId });
    await Account.deleteOne({ _id: party.account, userId });

    await logActivity({
      req,
      action: "delete",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party Permanently Delete کی گئی`,
      before: beforeDelete,
      after: {
        status: "deleted",
        isDeleted: true,
      },
    });

    return res.json({
      message: "Party deleted permanently",
      status: "deleted",
    });
  } catch (err) {
    console.error("❌ Delete Party Error:", err);
    return res.status(500).json({
      message: "Party delete failed",
      error: err.message,
    });
  }
};

// ✅ Restore deleted Party from Hidden
exports.restoreParty = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partyId = req.params.id;

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: false,
    });

    if (!party) {
      return res.status(404).json({
        message: "Hidden party not found",
      });
    }

    if (party.hiddenReason && party.hiddenReason !== "deleted") {
      return res.status(400).json({
        message: "Converted or merged party cannot be restored",
      });
    }

    // ✅ Same-name active Party check
    const activePartyExists = await Party.exists({
      _id: { $ne: party._id },
      name: new RegExp(`^${escapeRegex(party.name)}$`, "i"),
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (activePartyExists) {
      return res.status(400).json({
        message: "Active party with same name already exists",
      });
    }

    // ✅ Same-name active Customer check
    const activeCustomerExists = await Customer.exists({
      name: new RegExp(`^${escapeRegex(party.name)}$`, "i"),
      createdBy: userId,
      isActive: true,
    });

    if (activeCustomerExists) {
      return res.status(400).json({
        message: "Active customer with same name already exists",
      });
    }

    // ✅ Same-name active Supplier check
    const activeSupplierExists = await Supplier.exists({
      name: new RegExp(`^${escapeRegex(party.name)}$`, "i"),
      userId,
      isDeleted: false,
    });

    if (activeSupplierExists) {
      return res.status(400).json({
        message: "Active supplier with same name already exists",
      });
    }

    party.isActive = true;
    party.hiddenReason = null;

    await party.save();

    await Account.updateOne(
      {
        _id: party.account,
        userId,
      },
      {
        $set: {
          isActive: true,
        },
      },
    );

    await logActivity({
      req,
      action: "restore",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party Restore کی گئی`,
      before: {
        isActive: false,
        hiddenReason: "deleted",
      },
      after: {
        isActive: true,
        hiddenReason: null,
      },
    });

    return res.json({
      message: "Party restored successfully",
      party,
    });
  } catch (err) {
    console.error("❌ Restore Party Error:", err);

    return res.status(500).json({
      message: "Party restore failed",
      error: err.message,
    });
  }
};

exports.convertPartyToCustomer = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partyId = req.params.id;

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const existingCustomer = await Customer.findOne({
      name: new RegExp(`^${escapeRegex(party.name)}$`, "i"),
      createdBy: userId,
      isActive: true,
    });

    if (existingCustomer) {
      return res.status(400).json({
        message: "Customer with same name already exists",
      });
    }

    const closingBalance = await getPartyBalance(party.account, userId);

    const code = await generateAccountCode(userId);

    const account = await Account.create({
      userId,
      name: `Customer: ${party.name}`,
      code,
      type: "Asset",
      normalBalance: "debit",
      category: "customer",
      openingBalance: 0,
    });

    const customer = await Customer.create({
      name: party.name,
      email: party.email || "",
      phone: party.phone || "",
      address: party.address || "",
      type: "regular",
      openingBalance: closingBalance,
      account: account._id,
      createdBy: userId,
    });

    await createCustomerOpeningEntryFromParty({
      userId,
      customer,
      accountId: account._id,
      openingBalance: closingBalance,
    });

    party.isActive = false;
    party.hiddenReason = "converted";

    await party.save();

    await Account.updateOne(
      { _id: party.account, userId },
      { $set: { isActive: false } },
    );

    await recalculateAccountBalance(account._id);

    await logActivity({
      req,
      action: "convert",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party کو Customer میں Convert کیا گیا`,
      before: {
        partyId: party._id,
        name: party.name,
        role: party.role,
        account: party.account,
        closingBalance,
        isActive: true,
      },
      after: {
        customerId: customer._id,
        customerAccount: account._id,
        openingBalance: closingBalance,
        partyStatus: "converted",
      },
    });

    return res.status(201).json({
      message: "Party converted to customer successfully",
      customer,
      openingBalance: closingBalance,
    });
  } catch (err) {
    console.error("❌ Convert Party To Customer Error:", err);
    return res.status(500).json({
      message: "Convert party to customer failed",
      error: err.message,
    });
  }
};

exports.convertPartyToSupplier = async (req, res) => {
  try {
    const userId = getUserId(req);
    const partyId = req.params.id;

    const party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (!party) {
      return res.status(404).json({ message: "Party not found" });
    }

    const existingSupplier = await Supplier.findOne({
      name: new RegExp(`^${escapeRegex(party.name)}$`, "i"),
      userId,
      isDeleted: false,
    });

    if (existingSupplier) {
      return res.status(400).json({
        message: "Supplier with same name already exists",
      });
    }

    const partyClosingBalance = await getPartyBalance(party.account, userId);

    const supplierOpeningBalance = partyClosingBalance * -1;

    const code = await generateAccountCode(userId);

    const account = await Account.create({
      userId,
      name: party.name,
      code,
      type: "Liability",
      normalBalance: "credit",
      category: "supplier",
      openingBalance: 0,
    });

    const supplier = await Supplier.create({
      name: party.name,
      phone: party.phone || "",
      email: party.email || "",
      address: party.address || "",
      notes: party.notes || "",
      openingBalance: supplierOpeningBalance,
      supplierType: "vendor",
      userId,
      account: account._id,
    });

    await createSupplierOpeningEntryFromParty({
      userId,
      supplier,
      accountId: account._id,
      openingBalance: supplierOpeningBalance,
    });

    party.isActive = false;
    party.hiddenReason = "converted";

    await party.save();

    await Account.updateOne(
      { _id: party.account, userId },
      { $set: { isActive: false } },
    );

    await recalculateAccountBalance(account._id);

    await logActivity({
      req,
      action: "convert",
      module: "parties",
      entityType: "Party",
      entityId: party._id,
      title: `Party ${party.name}`,
      description: `${party.name} Party کو Supplier میں Convert کیا گیا`,
      before: {
        partyId: party._id,
        name: party.name,
        role: party.role,
        account: party.account,
        closingBalance: partyClosingBalance,
        isActive: true,
      },
      after: {
        supplierId: supplier._id,
        supplierAccount: account._id,
        openingBalance: supplierOpeningBalance,
        partyStatus: "converted",
      },
    });

    return res.status(201).json({
      message: "Party converted to supplier successfully",
      supplier,
      partyClosingBalance,
      supplierOpeningBalance,
    });
  } catch (err) {
    console.error("❌ Convert Party To Supplier Error:", err);
    return res.status(500).json({
      message: "Convert party to supplier failed",
      error: err.message,
    });
  }
};
