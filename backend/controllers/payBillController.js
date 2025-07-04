const mongoose = require("mongoose");
const PayBill = require("../models/PayBill");
const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const fs = require("fs");
const path = require("path");

// ✅ Create Pay Bill
exports.createPayBill = async (req, res) => {
  try {
    const { supplier, date, time, amount, paymentType, account, description } =
      req.body;
    const userId = req.user?.id || req.userId;
    if (!userId) return res.status(400).json({ error: "User ID is required." });

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : null;

    const supplierData = await Supplier.findOne({
      _id: supplier,
      userId,
    }).populate("account");
    if (!supplierData || !supplierData.account)
      return res
        .status(404)
        .json({ error: "Supplier or linked account not found" });

    const supplierAccount = supplierData.account;

    const newBill = await PayBill.create({
      supplier,
      date,
      time,
      amount: Number(amount),
      paymentType,
      account,
      description,
      attachment: attachmentPath,
      userId,
    });

    // ✅ Journal Entry
    await JournalEntry.create({
      date,
      time,
      description: description || "Pay Bill",
      createdBy: userId,
      sourceType: "pay_bill",
      referenceId: newBill._id,
      lines: [
        { account: supplierAccount._id, type: "debit", amount: Number(amount) },
        { account, type: "credit", amount: Number(amount) },
      ],
    });

    await recalculateAccountBalance(supplierAccount._id);
    await recalculateAccountBalance(account);

    console.log("✅ Pay Bill Created:", newBill._id);
    res
      .status(201)
      .json({ message: "Bill created successfully", data: newBill });
  } catch (err) {
    console.error("❌ Pay Bill Save Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Get All Pay Bills
exports.getAllPayBills = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const bills = await PayBill.find({ userId })
      .populate("supplier", "name")
      .populate("account", "name")
      .sort({ createdAt: -1 });

    res.json(bills);
  } catch (err) {
    console.error("❌ Get Pay Bills Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get One Pay Bill
exports.getPayBillById = async (req, res) => {
  try {
    const bill = await PayBill.findById(req.params.id)
      .populate("supplier", "name phone email")
      .populate("account", "name");

    if (!bill) return res.status(404).json({ error: "Record not found" });
    res.json(bill);
  } catch (err) {
    console.error("❌ Get Single Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update Pay Bill
exports.updatePayBill = async (req, res) => {
  try {
    const { supplier, date, time, amount, paymentType, account, description } =
      req.body;
    const userId = req.user?.id || req.userId;

    console.log("📥 Incoming accountId:", account);
    console.log("📥 Incoming supplierId:", supplier);

    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) return res.status(404).json({ error: "Record not found" });

    const oldSupplier = bill.supplier;
    const oldAccount = bill.account;

    const supplierData = await Supplier.findOne({
      _id: supplier,
      userId,
    }).populate("account");
    if (!supplierData || !supplierData.account)
      return res
        .status(404)
        .json({ error: "Supplier or linked account not found" });

    const supplierAccount = supplierData.account;

    // ✅ Remove old attachment if new one uploaded
    if (req.file && bill.attachment) {
      try {
        fs.unlinkSync(path.join(__dirname, "..", bill.attachment));
      } catch (e) {
        console.warn("⚠️ Could not remove old attachment:", e.message);
      }
    }

    // ✅ Update bill fields
    bill.supplier = supplier;
    bill.date = date;
    bill.time = time;
    bill.amount = Number(amount);
    bill.paymentType = paymentType;
    bill.account = account;
    bill.description = description;
    if (req.file) {
      bill.attachment = `uploads/${req.file.filename}`;
    }

    await bill.save();

    // 🧹 Delete old journal entries
    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // 🔁 Create new journal entry
    await JournalEntry.create({
      date,
      time,
      description: description || "Pay Bill",
      createdBy: userId,
      sourceType: "pay_bill",
      referenceId: bill._id,
      lines: [
        { account: supplierAccount._id, type: "debit", amount: Number(amount) },
        { account, type: "credit", amount: Number(amount) },
      ],
    });

    // ✅ Safe recalculation
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      } else {
        console.warn("⚠️ Invalid ObjectId for balance recalculation:", id);
      }
    };

    await safeRecalculate(oldSupplier);
    await safeRecalculate(oldAccount);
    await safeRecalculate(supplierAccount._id);
    await safeRecalculate(account);

    console.log("📝 Pay Bill Updated:", bill._id);
    res.json({ message: "Bill updated successfully", data: bill });
  } catch (err) {
    console.error("❌ Update Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete Pay Bill
exports.deletePayBill = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) return res.status(404).json({ error: "Record not found" });

    const supplierData = await Supplier.findOne({
      _id: bill.supplier,
      userId,
    }).populate("account");
    if (!supplierData || !supplierData.account)
      return res.status(404).json({ error: "Supplier or account missing" });

    const supplierAccount = supplierData.account;

    if (bill.attachment) {
      try {
        fs.unlinkSync(path.join(__dirname, "..", bill.attachment));
      } catch (e) {
        console.warn("⚠️ Attachment removal error:", e.message);
      }
    }

    await bill.deleteOne();

    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // ✅ Safe recalculation
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      } else {
        console.warn("⚠️ Invalid ObjectId for balance recalculation:", id);
      }
    };

    await safeRecalculate(supplierAccount._id);
    await safeRecalculate(bill.account);

    console.log("🗑️ Pay Bill deleted:", bill._id);
    res.json({ message: "Bill deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Pay Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
