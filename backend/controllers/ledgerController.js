const mongoose = require("mongoose");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");

// 🧾 Get Ledger for a Specific Customer (journal-based)
const getCustomerLedger = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    // ✅ Step 1: Fetch customer with populated account
    const customer = await Customer.findById(customerId).populate("account");
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // ✅ Step 2: Resolve accountId safely
    const account =
      typeof customer.account === "object" && customer.account?._id
        ? customer.account._id
        : customer.account;

    if (!account) {
      return res
        .status(400)
        .json({ message: "No account linked with customer" });
    }

    const accountId = account.toString();
    const objectId = new mongoose.Types.ObjectId(accountId);

    // ✅ Step 3: Build filter
    const matchFilter = {
      createdBy: userId,
      "lines.account": objectId,
      isDeleted: false,
    };

    if (startDate && endDate) {
      matchFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // ✅ Step 4: Get entries
    const entries = await JournalEntry.find(matchFilter)
      .sort({ date: 1, time: 1 })
      .lean();

    // ✅ Step 5: Opening balance
    let opening = 0;
    if (startDate) {
      const prevEntries = await JournalEntry.find({
        createdBy: userId,
        isDeleted: false,
        "lines.account": objectId,
        date: { $lt: new Date(startDate) },
      }).lean();

      for (let entry of prevEntries) {
        for (let line of entry.lines) {
          if (line.account?.toString() === accountId) {
            opening += line.type === "debit" ? line.amount : -line.amount;
          }
        }
      }
    }

    // ✅ Step 6: Running balance calculation
    let balance = opening;
    const ledger = [];

    for (let entry of entries) {
      for (let line of entry.lines) {
        if (line.account?.toString() === accountId) {
          const debit = line.type === "debit" ? line.amount : 0;
          const credit = line.type === "credit" ? line.amount : 0;
          balance += debit - credit;

          ledger.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || "",
            sourceType: entry.sourceType || "",
            billNo: entry.billNo || "",
            debit,
            credit,
            balance,
            runningBalance: balance,
            attachmentUrl: entry.attachmentUrl || "",
            attachmentType: entry.attachmentType || "",
            invoiceId: entry.invoiceId || null,
          });
        }
      }
    }

    // ✅ Final Response
    res.json({
      customerName: customer.name,
      openingBalance: opening,
      ledger,
    });
  } catch (err) {
    console.error("❌ Ledger fetch error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

module.exports = {
  getCustomerLedger,
};
