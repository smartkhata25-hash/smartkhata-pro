const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");

// ✅ Get Supplier Ledger with running balance from Journal
exports.getSupplierLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const { start = "", end = "", type = "" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid supplier ID" });
    }

    // 🔍 Supplier fetch & ownership check
    const supplier = await Supplier.findOne({
      _id: id,
      userId: req.user.id,
    }).populate("account");

    if (!supplier) {
      return res.status(404).json({ message: "Supplier not found" });
    }

    const accountId = supplier.account?._id?.toString();
    if (!accountId) {
      return res
        .status(400)
        .json({ message: "No account linked with supplier" });
    }

    // 📋 Ledger query build (ACCOUNT BASED – SAME AS CUSTOMER)
    const query = {
      "lines.account": new mongoose.Types.ObjectId(accountId),
      isDeleted: false,
      createdBy: req.user.id,
    };

    if (start) query.date = { ...(query.date || {}), $gte: new Date(start) };
    if (end) query.date = { ...(query.date || {}), $lte: new Date(end) };
    if (type) query.sourceType = type;

    const entries = await JournalEntry.find(query)
      .sort({ date: 1, time: 1 })
      .lean();

    let balance = 0;

    if (start) {
      const openingEntries = await JournalEntry.find({
        "lines.account": new mongoose.Types.ObjectId(accountId),
        createdBy: req.user.id,
        isDeleted: false,
        date: { $lt: new Date(start) },
      }).lean();

      for (const entry of openingEntries) {
        for (const line of entry.lines) {
          if (line.account?.toString() === accountId) {
            if (line.type === "debit") balance += Number(line.amount || 0);
            if (line.type === "credit") balance -= Number(line.amount || 0);
          }
        }
      }
    }

    const formattedEntries = [];

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account?.toString() === accountId) {
          const amount = Number(line.amount || 0);
          const isDebit = line.type === "debit";
          const isCredit = line.type === "credit";

          if (isDebit) balance += amount;
          if (isCredit) balance -= amount;

          formattedEntries.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || "",
            sourceType: entry.sourceType || "",
            billNo: entry.billNo || "",
            paymentType: line.paymentType || entry.paymentType || "-",
            referenceId: entry.referenceId || "",
            debit: isDebit ? amount : 0,
            credit: isCredit ? amount : 0,
            balance,
            attachmentUrl: line.attachmentUrl || entry.attachmentUrl || "",
            attachmentType: line.attachmentType || entry.attachmentType || "",
          });
        }
      }
    }

    // ✅ Final response (SAME SHAPE AS CUSTOMER LEDGER)
    res.json({
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        phone: supplier.phone,
      },
      openingBalance:
        balance - formattedEntries.reduce((s, e) => s + e.debit - e.credit, 0),
      ledger: formattedEntries,
    });
  } catch (err) {
    console.error("📛 Supplier ledger error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Delete Ledger Entry (Soft delete)
exports.deleteLedgerEntry = async (req, res) => {
  try {
    const { entryId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(entryId)) {
      return res.status(400).json({ message: "Invalid entry ID" });
    }

    const entry = await JournalEntry.findOne({
      _id: entryId,
      isDeleted: false,
    });

    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }

    entry.isDeleted = true;
    await entry.save();

    res.json({ message: "Entry deleted successfully" });
  } catch (err) {
    console.error("❌ Ledger delete error:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
