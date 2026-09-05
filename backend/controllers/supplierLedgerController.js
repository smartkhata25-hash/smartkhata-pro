const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");
const mongoose = require("mongoose");
const {
  getTravelVendorJournalFilter,
} = require("../services/travel/travelAccountingMetricsService");
const {
  buildBusinessDateRange,
  startOfBusinessDay,
} = require("../utils/businessDate");

const resolveSupplierSourceLabel = (entry) => {
  if (
    entry.sourceType === "pay_bill" &&
    ["travel_invoice", "travel_vendor_payment"].includes(entry.originModule)
  ) {
    return "Travel Vendor Payment";
  }

  if (
    entry.originModule === "travel_vendor_return" &&
    entry.sourceType === "purchase_return_payment"
  ) {
    return "Travel Vendor Return Receipt";
  }

  if (entry.sourceType === "travel_vendor_return") {
    return "Travel Vendor Return/Credit";
  }

  if (entry.sourceType === "travel_vendor_cost") {
    return "Travel Vendor Cost";
  }

  if (entry.sourceType === "travel_refund") {
    return "Travel Vendor Recovery";
  }

  if (entry.sourceType === "opening_purchase_invoice") {
    return "Opening Purchase Invoice";
  }

  if (entry.sourceType === "opening_purchase_return") {
    return "Opening Purchase Return";
  }

  if (entry.sourceType === "purchase_discount") {
    return "Purchase Discount";
  }

  return entry.description || "";
};

// ✅ Get Supplier Ledger with running balance from Journal
exports.getSupplierLedger = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      start = "",
      end = "",
      startDate = "",
      endDate = "",
      type = "",
      moduleScope = "",
    } = req.query;
    const fromDate = start || startDate;
    const toDate = end || endDate;
    const travelJournalFilter =
      moduleScope === "travel" ? getTravelVendorJournalFilter() : {};

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
      ...travelJournalFilter,
    };

    const ledgerDateRange = buildBusinessDateRange({
      startDate: fromDate,
      endDate: toDate,
    }).date;
    if (ledgerDateRange) {
      query.date = ledgerDateRange;
    }
    if (type) query.sourceType = type;

    const entries = await JournalEntry.find(query)
      .sort({
        date: 1,
        billNo: 1,
        createdAt: 1,
        _id: 1,
      })
      .lean();

    let balance = 0;

    if (fromDate) {
      const openingEntries = await JournalEntry.find({
        "lines.account": new mongoose.Types.ObjectId(accountId),
        createdBy: req.user.id,
        isDeleted: false,
        ...travelJournalFilter,
        date: { $lt: startOfBusinessDay(fromDate) },
      }).lean();

      for (const entry of openingEntries) {
        for (const line of entry.lines) {
          if (line.account?.toString() === accountId) {
            if (line.type === "credit") balance += Number(line.amount || 0);
            if (line.type === "debit") balance -= Number(line.amount || 0);
          }
        }
      }
    }

    const openingBalance = balance;
    const formattedEntries = [];

    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.account?.toString() === accountId) {
          const amount = Number(line.amount || 0);
          const isDebit = line.type === "debit";
          const isCredit = line.type === "credit";

          if (isCredit) balance += amount;
          if (isDebit) balance -= amount;

          formattedEntries.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time || "",
            description: entry.description || resolveSupplierSourceLabel(entry),
            sourceType: entry.sourceType || "",
            originModule: entry.originModule || "",
            sourceLabel: resolveSupplierSourceLabel(entry),
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

    // ✅ Final response
    res.json({
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        phone: supplier.phone,
        isDeleted: supplier.isDeleted,
        hiddenReason: supplier.hiddenReason || null,
      },

      supplierId: supplier._id,
      supplierName: supplier.name,
      isDeleted: supplier.isDeleted,
      hiddenReason: supplier.hiddenReason || null,

      openingBalance:
        moduleScope === "travel"
          ? openingBalance
          : balance -
            formattedEntries.reduce((s, e) => s + e.debit - e.credit, 0),

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
