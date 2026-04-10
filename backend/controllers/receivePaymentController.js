const ReceivePayment = require("../models/ReceivePayment");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { createPaymentEntry } = require("../utils/paymentService");

const fs = require("fs");
const path = require("path");

// ✅ Create Receive Payment (CENTRALIZED VERSION)
exports.createReceivePayment = async (req, res) => {
  try {
    const { customer, date, time, description, paymentType, paymentEntries } =
      req.body;

    const userId = req.user?.id || req.userId;
    if (!userId) {
      return res.status(400).json({ error: "User ID is required." });
    }

    const payments = JSON.parse(paymentEntries || "[]");

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : "";

    const cleanPaymentType = paymentType?.toLowerCase() || "";

    const customerData = await Customer.findById(customer).populate("account");

    if (!customerData || !customerData.account) {
      return res.status(404).json({
        error: "Customer or linked account not found",
      });
    }

    const customerAccountId = customerData.account._id;

    // ✅ Save ReceivePayment
    const newPayment = await ReceivePayment.create({
      customer,
      date,
      time,
      amount: totalAmount,
      paymentType: cleanPaymentType,
      description,
      attachment: attachmentPath,
      userId,
    });

    // 🔁 Create centralized payment entries (MULTIPLE SAFE)
    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: newPayment._id,
        sourceType: "receive_payment",
        billNo: `RCV-${newPayment._id.toString().slice(-6)}`,
        accountId: p.account, // Cash / Bank
        counterPartyAccountId: customerAccountId, // Customer
        amount: Number(p.amount),
        paymentType: p.paymentType?.toLowerCase() || cleanPaymentType || "cash",
        description: description || "Receive Payment",
      });
    }

    res.status(201).json({
      message: "Receive payment saved successfully",
      data: newPayment,
    });
  } catch (err) {
    console.error("❌ Receive Payment Save Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ✅ Get all receive payments
exports.getAllReceivePayments = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // 🔹 Receive payments لائیں
    const payments = await ReceivePayment.find({ userId })
      .populate("customer", "name")
      .sort({ createdAt: -1 });

    // 🔹 Journal سے payment mode + account نکالیں
    const formatted = await Promise.all(
      payments.map(async (p) => {
        const journal = await JournalEntry.findOne({
          referenceId: p._id,
          sourceType: "receive_payment",
        }).populate("lines.account", "name");

        const firstDebitLine = journal?.lines?.find(
          (line) => line.type === "debit",
        );

        return {
          ...p.toObject(),
          paymentMode: firstDebitLine?.paymentType || p.paymentType || "-",
          accountName: firstDebitLine?.account?.name || "-",
        };
      }),
    );

    res.json(formatted);
  } catch (err) {
    console.error("❌ Get Receive Payments Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get single receive payment
exports.getReceivePaymentById = async (req, res) => {
  try {
    const payment = await ReceivePayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ error: "Record not found" });
    }

    // 🔍 Journal se payment entries nikaalni hain
    const journal = await JournalEntry.findOne({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    let paymentEntries = [];

    if (journal?.lines?.length) {
      paymentEntries = journal.lines
        .filter((line) => line.type === "debit") // cash/bank
        .map((line) => ({
          account: line.account,
          amount: line.amount,
          paymentType: line.paymentType || payment.paymentType || "cash",
        }));
    }

    // ✅ Frontend ko sab kuch wapas bhejna
    res.json({
      ...payment.toObject(),
      paymentEntries,
    });
  } catch (err) {
    console.error("❌ Get ReceivePayment Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update Receive Payment (CENTRALIZED VERSION)
exports.updateReceivePayment = async (req, res) => {
  try {
    const { customer, date, time, description, paymentType, paymentEntries } =
      req.body;

    const userId = req.user?.id || req.userId;

    const payments = JSON.parse(paymentEntries || "[]");

    const totalAmount = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "Invalid payment amount" });
    }

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
    });

    if (!payment) {
      return res.status(404).json({ error: "Record not found" });
    }

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

    // 🔍 Get old journals before deleting
    const oldJournals = await JournalEntry.find({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    // 🔍 Get customer account
    const customerData = await Customer.findById(customer).populate("account");

    if (!customerData || !customerData.account) {
      return res.status(404).json({
        error: "Customer or linked account not found",
      });
    }

    const customerAccountId = customerData.account._id;

    // 🧹 Remove old attachment if replaced
    if (req.file && payment.attachment) {
      try {
        fs.unlinkSync(path.resolve(payment.attachment));
      } catch (e) {
        console.warn("⚠️ Attachment delete failed:", e.message);
      }
    }

    const attachmentPath = req.file
      ? `uploads/${req.file.filename}`
      : payment.attachment;

    // 🔄 Update payment
    payment.customer = customer;
    payment.date = date;
    payment.time = time;
    payment.amount = totalAmount;
    payment.paymentType = paymentType?.toLowerCase() || "";
    payment.description = description;
    payment.attachment = attachmentPath;

    await payment.save();

    // 🧹 Delete old journal entries
    await JournalEntry.deleteMany({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    // 🔄 Recalculate old accounts
    for (const entry of oldJournals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🔁 Create new centralized payment entries
    for (const p of payments) {
      await createPaymentEntry({
        userId,
        referenceId: payment._id,
        sourceType: "receive_payment",
        billNo: `RCV-${payment._id.toString().slice(-6)}`,
        accountId: p.account,
        counterPartyAccountId: customerAccountId,
        amount: Number(p.amount),
        paymentType:
          p.paymentType?.toLowerCase() || payment.paymentType || "cash",
        description: description || "Receive Payment",
      });
    }

    // 🔄 Recalculate customer account
    await safeRecalculate(customerAccountId);

    res.json({
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (err) {
    console.error("❌ Error updating payment:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete Receive Payment (CENTRALIZED SAFE VERSION)
exports.deleteReceivePayment = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
    });

    if (!payment) {
      return res.status(404).json({ error: "Not found" });
    }

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

    // 🔍 Get all related journal entries
    const journals = await JournalEntry.find({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    // 🧹 Remove attachment if exists
    if (payment.attachment && fs.existsSync(path.resolve(payment.attachment))) {
      try {
        fs.unlinkSync(path.resolve(payment.attachment));
      } catch (e) {
        console.warn("⚠️ Attachment delete error:", e.message);
      }
    }

    // 🧹 Delete journal entries
    await JournalEntry.deleteMany({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    // 🔄 Recalculate all involved accounts
    for (const entry of journals) {
      for (const line of entry.lines) {
        await safeRecalculate(line.account);
      }
    }

    // 🗑 Delete payment
    await payment.deleteOne();

    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Payment Error:", err);
    res.status(500).json({ error: err.message });
  }
};
