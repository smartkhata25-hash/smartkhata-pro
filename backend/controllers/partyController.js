const mongoose = require("mongoose");
const Party = require("../models/Party");
const Account = require("../models/Account");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");

/* =========================================================
   HELPERS
========================================================= */

const escapeRegex = (text = "") => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

const getUserId = (req) => req.user?.id || req.userId;

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
  partyId,
  partyAccountId,
  openingBalance,
}) => {
  const amount = Number(openingBalance) || 0;
  if (amount === 0) return null;

  const openingAccount = await getOrCreateOpeningBalanceAccount(userId);
  const absAmount = Math.abs(amount);

  /*
    + amount = Party se lena hai / receivable
    - amount = Party ko dena hai / payable
  */

  const lines =
    amount > 0
      ? [
          {
            account: partyAccountId,
            type: "debit",
            amount: absAmount,
          },
          {
            account: openingAccount._id,
            type: "credit",
            amount: absAmount,
          },
        ]
      : [
          {
            account: openingAccount._id,
            type: "debit",
            amount: absAmount,
          },
          {
            account: partyAccountId,
            type: "credit",
            amount: absAmount,
          },
        ];

  const journal = await JournalEntry.create({
    date: new Date(),
    time: new Date().toTimeString().slice(0, 8),
    createdBy: userId,
    partyId,
    sourceType: "opening_balance",
    originModule: "party_opening_balance",
    description:
      amount > 0 ? "Party Opening Receivable" : "Party Opening Payable",
    lines,
  });

  await recalculateAccountBalance(partyAccountId);
  await recalculateAccountBalance(openingAccount._id);

  return journal;
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

/* =========================================================
   CREATE PARTY
========================================================= */

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
      partyId: party._id,
      partyAccountId: account._id,
      openingBalance: Number(openingBalance) || 0,
    });

    const balance = await getPartyBalance(account._id, userId);

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

/* =========================================================
   GET PARTIES
========================================================= */

exports.getParties = async (req, res) => {
  try {
    const userId = getUserId(req);

    const {
      search = "",
      role = "",
      status = "active",
      limit = 0,
      page = 1,
    } = req.query;

    const query = {
      userId,
    };

    if (status === "active") query.isActive = true;
    if (status === "inactive") query.isActive = false;

    if (role && ["customer", "supplier", "both"].includes(role)) {
      query.role = role;
    }

    if (search.trim()) {
      const safe = escapeRegex(search.trim());
      query.$or = [
        { name: { $regex: safe, $options: "i" } },
        { phone: { $regex: safe, $options: "i" } },
        { email: { $regex: safe, $options: "i" } },
      ];
    }

    const cursor = Party.find(query)
      .populate("account")
      .sort({ createdAt: -1 });

    if (Number(limit) > 0) {
      cursor.skip((Number(page) - 1) * Number(limit)).limit(Number(limit));
    }

    const parties = await cursor.lean();

    const result = await Promise.all(
      parties.map(async (party) => {
        const accountId = party.account?._id || party.account;
        const balance = await getPartyBalance(accountId, userId);

        return {
          ...party,
          balance,
        };
      }),
    );

    return res.json(result);
  } catch (err) {
    console.error("❌ Get Parties Error:", err);
    return res.status(500).json({
      message: "Failed to fetch parties",
      error: err.message,
    });
  }
};

/* =========================================================
   GET SINGLE PARTY
========================================================= */

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

/* =========================================================
   UPDATE PARTY
========================================================= */

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

    if (typeof isActive === "boolean") {
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
        sourceType: "opening_balance",
        originModule: "party_opening_balance",
        isDeleted: false,
      });

      await JournalEntry.updateMany(
        {
          partyId: party._id,
          createdBy: userId,
          sourceType: "opening_balance",
          originModule: "party_opening_balance",
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
        partyId: party._id,
        partyAccountId: party.account,
        openingBalance: newOpening,
      });
    }

    await recalculateAccountBalance(party.account);

    const updatedParty = await Party.findById(party._id).populate("account");
    const balance = await getPartyBalance(party.account, userId);

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

/* =========================================================
   DELETE / HIDE PARTY
========================================================= */

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

    const hasLedger = await JournalEntry.exists({
      partyId: party._id,
      createdBy: userId,
      isDeleted: false,
    });

    if (hasLedger) {
      party.isActive = false;

      await party.save();

      await Account.updateOne(
        { _id: party.account, userId },
        { $set: { isActive: false } },
      );

      return res.json({
        message: "Party has transactions, marked as inactive",
        status: "inactive",
      });
    }

    await Party.deleteOne({ _id: party._id, userId });
    await Account.deleteOne({ _id: party.account, userId });

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
