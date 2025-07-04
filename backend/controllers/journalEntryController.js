const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const mongoose = require("mongoose");
const Invoice = require("../models/Invoice");

// ✅ Helper: Check if entry is balanced
const isBalanced = (lines) => {
  const debit = lines
    .filter((l) => l.type === "debit")
    .reduce((sum, l) => sum + l.amount, 0);
  const credit = lines
    .filter((l) => l.type === "credit")
    .reduce((sum, l) => sum + l.amount, 0);
  return debit === credit;
};

// ✅ Helper: Recalculate all involved accounts
const recalculateInvolvedAccounts = async (lines) => {
  const uniqueAccounts = [
    ...new Set(lines.map((line) => line.account.toString())),
  ];
  for (let accId of uniqueAccounts) {
    await recalculateAccountBalance(accId);
  }
};

// ✅ Create Entry
exports.createEntry = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const {
      date,
      time,
      description,
      lines,
      customerId,
      supplierId,
      billNo,
      paymentType,
      sourceType,
      attachmentUrl,
      attachmentType,
      invoiceId,
      invoiceModel,
      referenceId,
    } = req.body;

    if (!lines || lines.length < 2) {
      return res.status(400).json({ message: "کم از کم دو لائنز ہونی چاہئیں" });
    }

    if (!isBalanced(lines)) {
      return res
        .status(400)
        .json({ message: "Total Debit اور Credit برابر ہونے چاہئیں" });
    }

    const entry = new JournalEntry({
      date,
      time,
      description,
      lines,
      customerId: customerId || null,
      supplierId: supplierId || null,
      billNo: billNo || "",
      paymentType: paymentType || "",
      sourceType: sourceType || "manual",
      attachmentUrl: attachmentUrl || "",
      attachmentType: attachmentType || "",
      invoiceId: invoiceId || null,
      invoiceModel: invoiceModel || null,
      referenceId: referenceId || null,
      createdBy: userId,
      isDeleted: false,
    });

    await entry.save();
    await recalculateInvolvedAccounts(lines);

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Update Entry
exports.updateEntry = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const {
      date,
      time,
      description,
      lines,
      billNo,
      paymentType,
      sourceType,
      attachmentUrl,
      attachmentType,
      invoiceId,
      invoiceModel,
      customerId,
      supplierId,
      referenceId,
    } = req.body;

    if (!lines || lines.length < 2) {
      return res.status(400).json({ message: "کم از کم دو لائنز ہونی چاہئیں" });
    }

    if (!isBalanced(lines)) {
      return res
        .status(400)
        .json({ message: "Total Debit اور Credit برابر ہونے چاہئیں" });
    }

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!entry) {
      return res
        .status(404)
        .json({ message: "Entry نہیں ملی یا delete ہو چکی ہے" });
    }

    const oldLines = entry.lines;

    entry.date = date;
    entry.time = time;
    entry.description = description;
    entry.lines = lines;
    entry.customerId = customerId || null;
    entry.supplierId = supplierId || null;
    entry.billNo = billNo || "";
    entry.paymentType = paymentType || "";
    entry.sourceType = sourceType || "manual";
    entry.attachmentUrl = attachmentUrl || "";
    entry.attachmentType = attachmentType || "";
    entry.invoiceId = invoiceId || null;
    entry.invoiceModel = invoiceModel || null;
    entry.referenceId = referenceId || null;

    await entry.save();
    await recalculateInvolvedAccounts([...oldLines, ...lines]);

    res.json(entry);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};
// ✅ Get All Entries
exports.getEntries = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { startDate, endDate } = req.query;
    const filter = { createdBy: userId, isDeleted: false };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const entries = await JournalEntry.find(filter).populate("lines.account");
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Soft Delete (and delete related invoice if exists)
exports.deleteEntry = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: false,
    });

    if (!entry) {
      return res
        .status(404)
        .json({ message: "Entry نہیں ملی یا delete ہو چکی ہے" });
    }

    // 🔁 اگر یہ سیل انوائس سے لنکڈ ہے تو انوائس بھی ہٹائیں
    if (entry.sourceType === "sale_invoice" && entry.referenceId) {
      await Invoice.findByIdAndDelete(entry.referenceId);
    }

    entry.isDeleted = true;
    await entry.save();

    await recalculateInvolvedAccounts(entry.lines);

    res.json({ message: "Journal entry (and linked invoice if any) deleted." });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

// ✅ Trial Balance
exports.getTrialBalance = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { startDate, endDate } = req.query;
    const filter = { createdBy: userId, isDeleted: false };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const entries = await JournalEntry.find(filter).populate("lines.account");
    const accountMap = {};

    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const acc = line.account;
        if (!acc) return;

        const name = acc.name;
        if (!accountMap[name]) {
          accountMap[name] = { debit: 0, credit: 0 };
        }

        if (line.type === "debit") accountMap[name].debit += line.amount;
        if (line.type === "credit") accountMap[name].credit += line.amount;
      });
    });

    const trialBalance = Object.keys(accountMap).map((name) => ({
      accountName: name,
      debit: accountMap[name].debit,
      credit: accountMap[name].credit,
    }));

    const totalDebit = trialBalance.reduce((sum, a) => sum + a.debit, 0);
    const totalCredit = trialBalance.reduce((sum, a) => sum + a.credit, 0);

    res.json({
      trialBalance,
      totalDebit,
      totalCredit,
      isBalanced: totalDebit === totalCredit,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Trial balance error", error: err.message });
  }
};

// ✅ Ledger by Account (with Opening Balance)
exports.getLedgerByAccount = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const { accountId } = req.params;
    const { startDate, endDate } = req.query;

    // ✅ Correctly cast accountId to ObjectId
    const objectId = new mongoose.Types.ObjectId(accountId);

    const filter = {
      createdBy: userId,
      "lines.account": objectId,
      isDeleted: false,
    };

    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 🧾 Debug Filter Inputs
    console.log("🧾 Final accountId in filter:", accountId);
    console.log("🧾 Full filter:", filter);

    // 🔢 All matching entries for date range
    const entries = await JournalEntry.find(filter)
      .populate("lines.account")
      .sort({ date: 1 });

    // 🧾 Log fetched entries
    console.log("📥 entries fetched:", entries.length);
    console.log("📥 sample entry:", JSON.stringify(entries[0], null, 2));
    console.log("📥 All entries (raw):", entries);

    let balance = 0;
    const ledger = [];

    // 🔢 Opening balance = entries before startDate
    let openingBalance = 0;

    if (startDate) {
      const openingEntries = await JournalEntry.find({
        createdBy: userId,
        "lines.account": accountId,
        date: { $lt: new Date(startDate) },
        isDeleted: false,
      });

      console.log("🔓 Opening entries fetched:", openingEntries.length);

      openingEntries.forEach((entry) => {
        entry.lines.forEach((line) => {
          if (line.account && line.account.toString() === accountId) {
            if (line.type === "debit") openingBalance += line.amount;
            else if (line.type === "credit") openingBalance -= line.amount;
          }
        });
      });

      balance = openingBalance;

      ledger.push({
        date: null,
        description: "Opening Balance",
        debit: 0,
        credit: 0,
        balance,
        isOpening: true,
      });
    }

    // 🔁 Entries with running balance
    entries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const accId = line.account?._id?.toString() || line.account?.toString();
        const targetId = accountId.toString();

        console.log("🧪 Matching Line Account:", accId, "==", targetId);

        if (accId === targetId) {
          const debit = line.type === "debit" ? line.amount : 0;
          const credit = line.type === "credit" ? line.amount : 0;
          balance += debit - credit;

          ledger.push({
            _id: entry._id,
            date: entry.date,
            time: entry.time,
            description: entry.description,
            billNo: entry.billNo || "",
            paymentType: entry.paymentType || "",
            sourceType: entry.sourceType || "",
            invoiceId: entry.invoiceId || null,
            attachmentUrl: entry.attachmentUrl || "",
            attachmentType: entry.attachmentType || "",
            debit,
            credit,
            balance,
            isOpening: false,
          });
        }
      });
    });

    res.json({
      openingBalance,
      ledger,
    });
  } catch (error) {
    console.error("❌ Ledger error:", error);
    res.status(500).json({ message: "Ledger error", error: error.message });
  }
};

// ✅ Monthly Cash Flow Summary for Dashboard
exports.getMonthlyCashFlow = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const entries = await JournalEntry.find({
      createdBy: userId,
      isDeleted: false,
      date: {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`),
      },
    }).populate("lines.account");

    const inflow = new Array(12).fill(0);
    const outflow = new Array(12).fill(0);

    entries.forEach((entry) => {
      const month = new Date(entry.date).getMonth();

      entry.lines.forEach((line) => {
        const category = line.account?.category;
        const isCashOrBank = category === "cash" || category === "bank";
        if (!isCashOrBank) return;

        if (line.type === "debit") outflow[month] += line.amount;
        else if (line.type === "credit") inflow[month] += line.amount;
      });
    });

    res.json({ inflow, outflow });
  } catch (err) {
    res.status(500).json({ message: "Cash flow error", error: err.message });
  }
};
