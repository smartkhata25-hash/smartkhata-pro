const mongoose = require("mongoose");
const PayBill = require("../models/PayBill");
const Supplier = require("../models/Supplier");
const JournalEntry = require("../models/JournalEntry");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { createPaymentEntry } = require("../utils/paymentService");

const fs = require("fs");
const path = require("path");
const ALLOWED_PAYMENT_TYPES = ["cash", "online", "cheque"];

// ✅ Create Pay Bill
exports.createPayBill = async (req, res) => {
  try {
  } catch (e) {
    console.log("❌ paymentEntries JSON parse error", e);
  }

  try {
    const { supplier, date, time, description, paymentType, paymentEntries } =
      req.body;
    const normalizedPaymentType = paymentType?.toLowerCase();

    const payments = JSON.parse(paymentEntries || "[]");
    // ✅ Per-payment paymentType validation
    for (const p of payments) {
      if (!ALLOWED_PAYMENT_TYPES.includes(p.paymentType?.toLowerCase())) {
        return res.status(400).json({
          error: "Invalid payment type in payment entries",
        });
      }
    }

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

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
      amount: totalAmount, // ✅
      paymentType: normalizedPaymentType,

      description,
      attachment: attachmentPath,
      userId,
    });

    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: newBill._id,
        sourceType: "pay_bill",
        billNo: `PB-${newBill._id.toString().slice(-6)}`,
        accountId: p.account,
        counterPartyAccountId: supplierAccount._id,
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || "cash",
        description: description || "Pay Bill",
      });
    }

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
      .sort({ createdAt: -1 });

    const result = [];

    for (const bill of bills) {
      const journal = await JournalEntry.findOne({
        referenceId: bill._id,
        sourceType: "pay_bill",
      }).populate("lines.account", "name");

      let paymentMode = "-";
      let accountName = "-";

      if (journal?.lines?.length) {
        const creditLine = journal.lines.find((line) => line.type === "credit");

        paymentMode = creditLine?.paymentType || "-";
        accountName = creditLine?.account?.name || "-";
      }

      result.push({
        ...bill.toObject(),
        paymentMode,
        accountName,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("❌ Get Pay Bills Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get One Pay Bill
exports.getPayBillById = async (req, res) => {
  try {
    const bill = await PayBill.findById(req.params.id).populate(
      "supplier",
      "name phone email",
    );

    if (!bill) {
      return res.status(404).json({ error: "Record not found" });
    }

    // 🔍 Journal se payment accounts nikaalna
    const journal = await JournalEntry.findOne({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    let paymentEntries = [];

    if (journal?.lines?.length) {
      paymentEntries = journal.lines
        .filter((line) => line.type === "credit")
        .map((line) => ({
          account: line.account,
          amount: line.amount,
          paymentType: line.paymentType,
        }));
    }

    // ✅ Frontend ko complete data
    res.json({
      ...bill.toObject(),
      paymentEntries,
    });
  } catch (err) {
    console.error("❌ Get Single Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
// ✅ Update Pay Bill (CENTRALIZED PAYMENT SERVICE)
exports.updatePayBill = async (req, res) => {
  try {
    const { supplier, date, time, description, paymentType, paymentEntries } =
      req.body;

    const normalizedPaymentType = paymentType?.toLowerCase();
    const payments = JSON.parse(paymentEntries || "[]");

    if (!ALLOWED_PAYMENT_TYPES.includes(normalizedPaymentType)) {
      return res.status(400).json({
        error: "Invalid payment type. Allowed: cash, online, cheque",
      });
    }

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const userId = req.user?.id || req.userId;

    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) return res.status(404).json({ error: "Record not found" });

    // ✅ Safe recalculation helper
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      }
    };

    // 🔍 Get old supplier account
    const oldSupplierData = await Supplier.findById(bill.supplier).populate(
      "account",
    );
    const oldSupplierAccountId = oldSupplierData?.account?._id;

    // 🔍 Get new supplier account
    const supplierData = await Supplier.findOne({
      _id: supplier,
      userId,
    }).populate("account");

    if (!supplierData || !supplierData.account)
      return res.status(404).json({
        error: "Supplier or linked account not found",
      });

    const supplierAccount = supplierData.account;

    // ✅ Remove old attachment if replaced
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
    bill.amount = totalAmount;
    bill.paymentType = normalizedPaymentType;
    bill.description = description;

    if (req.file) {
      bill.attachment = `uploads/${req.file.filename}`;
    }

    await bill.save();

    // 🔍 Fetch old journals before deleting
    const oldJournals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // 🧹 Delete old journal entries
    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // 🔄 Recalculate old accounts (before recreating)
    for (const entry of oldJournals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🔁 Create new payment entries (MULTIPLE SAFE)
    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: bill._id,
        sourceType: "pay_bill",
        billNo: `PB-${bill._id.toString().slice(-6)}`,
        accountId: p.account,
        counterPartyAccountId: supplierAccount._id,
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || "cash",
        description: description || "Pay Bill",
      });
    }

    // 🔄 Recalculate supplier accounts
    if (oldSupplierAccountId) {
      await safeRecalculate(oldSupplierAccountId);
    }

    await safeRecalculate(supplierAccount._id);

    res.json({
      message: "Bill updated successfully",
      data: bill,
    });
  } catch (err) {
    console.error("❌ Update Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete Pay Bill (CENTRALIZED SAFE VERSION)
exports.deletePayBill = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const bill = await PayBill.findOne({ _id: req.params.id, userId });
    if (!bill) {
      return res.status(404).json({ error: "Record not found" });
    }

    // 🔍 Supplier account
    const supplierData = await Supplier.findOne({
      _id: bill.supplier,
      userId,
    }).populate("account");

    if (!supplierData || !supplierData.account) {
      return res.status(404).json({ error: "Supplier or account missing" });
    }

    const supplierAccount = supplierData.account;

    // 🔍 Get ALL related journals (IMPORTANT for multiple payments)
    const journals = await JournalEntry.find({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    if (bill.attachment) {
      try {
        fs.unlinkSync(path.join(__dirname, "..", bill.attachment));
      } catch (e) {
        console.warn("⚠️ Attachment removal error:", e.message);
      }
    }

    // 🧹 Delete bill
    await bill.deleteOne();

    // 🧹 Delete all related journals
    await JournalEntry.deleteMany({
      referenceId: bill._id,
      sourceType: "pay_bill",
    });

    // ✅ Safe recalculation helper
    const safeRecalculate = async (id) => {
      if (mongoose.Types.ObjectId.isValid(id)) {
        try {
          await recalculateAccountBalance(id);
        } catch (err) {
          console.warn("⚠️ Error recalculating balance:", err.message);
        }
      }
    };

    // 🔄 Recalculate ALL involved accounts
    for (const entry of journals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🔄 Recalculate supplier account
    await safeRecalculate(supplierAccount._id);

    res.json({
      message: "Bill deleted successfully",
    });
  } catch (err) {
    console.error("❌ Delete Pay Bill Error:", err);
    res.status(500).json({ error: err.message });
  }
};
