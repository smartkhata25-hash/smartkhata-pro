const ReceivePayment = require("../models/ReceivePayment");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const fs = require("fs");
const path = require("path");

// ✅ Create Receive Payment
exports.createReceivePayment = async (req, res) => {
  try {
    const { customer, date, time, amount, paymentType, account, description } =
      req.body;
    const userId = req.user?.id || req.userId;

    if (!userId) return res.status(400).json({ error: "User ID is required." });

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : "";

    console.log("🧾 Received paymentType from frontend:", paymentType);
    const cleanPaymentType = paymentType.toLowerCase();

    const customerData = await Customer.findById(customer);
    if (!customerData)
      return res.status(404).json({ error: "Customer not found" });

    const customerAccountId = customerData.account;

    const newPayment = new ReceivePayment({
      customer,
      date,
      time,
      amount: Number(amount),
      paymentType: cleanPaymentType,
      account,
      description,
      attachment: attachmentPath,
      userId,
    });

    console.log("💾 Saving ReceivePayment...", newPayment);

    await newPayment.save();

    const journal = new JournalEntry({
      date,
      time,
      description: description || "Receive Payment",
      createdBy: userId,
      source: "receive_payment",
      sourceType: "receive_payment",
      referenceId: newPayment._id,
      billNo: `RCV-${newPayment._id.toString().slice(-6)}`,
      paymentType: cleanPaymentType,
      attachmentUrl: attachmentPath,
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      customerId: customer,
      note: "Receive payment from customer",
      lines: [
        { account, type: "debit", amount: Number(amount) },
        { account: customerAccountId, type: "credit", amount: Number(amount) },
      ],
    });

    console.log("🧾 Creating Journal Entry:", journal);

    await journal.save();

    await recalculateAccountBalance(account);
    await recalculateAccountBalance(customerAccountId);

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
    const payments = await ReceivePayment.find({ userId })
      .populate("customer", "name")
      .populate("account", "name")
      .sort({ createdAt: -1 });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get single receive payment
exports.getReceivePaymentById = async (req, res) => {
  try {
    const payment = await ReceivePayment.findById(req.params.id);
    if (!payment) return res.status(404).json({ error: "Record not found" });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update receive payment
exports.updateReceivePayment = async (req, res) => {
  try {
    const { customer, date, time, amount, paymentType, account, description } =
      req.body;
    const userId = req.user?.id || req.userId;

    console.log("🧾 Update paymentType received:", paymentType);
    const cleanPaymentType = paymentType.toLowerCase();

    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
    });
    if (!payment) return res.status(404).json({ error: "Record not found" });

    const oldAccount = payment.account;
    const oldCustomer = payment.customer;

    const customerData = await Customer.findById(customer);
    if (!customerData)
      return res.status(404).json({ error: "Customer not found" });

    const customerAccountId = customerData.account;

    const attachmentPath = req.file ? `uploads/${req.file.filename}` : "";

    try {
      if (
        payment.attachment &&
        fs.existsSync(path.resolve(payment.attachment))
      ) {
        fs.unlinkSync(path.resolve(payment.attachment));
      }
    } catch (e) {
      console.warn("⚠️ Attachment delete failed:", e.message);
    }

    payment.customer = customer;
    payment.date = date;
    payment.time = time;
    payment.amount = Number(amount);
    payment.paymentType = cleanPaymentType;
    payment.account = account;
    payment.description = description;
    if (attachmentPath) {
      payment.attachment = attachmentPath;
    }

    console.log("💾 Updating ReceivePayment...", payment);
    await payment.save();

    await JournalEntry.deleteMany({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    const journal = new JournalEntry({
      date,
      time,
      description: description || "Receive Payment",
      createdBy: userId,
      source: "receive_payment",
      sourceType: "receive_payment",
      referenceId: payment._id,
      billNo: `RCV-${payment._id.toString().slice(-6)}`,
      paymentType: cleanPaymentType,
      attachmentUrl: attachmentPath,
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      customerId: customer,
      note: "Updated receive payment",
      lines: [
        { account, type: "debit", amount: Number(amount) },
        { account: customerAccountId, type: "credit", amount: Number(amount) },
      ],
    });

    console.log("🧾 Updating Journal Entry:", journal);

    await journal.save();

    await recalculateAccountBalance(oldAccount);
    await recalculateAccountBalance(oldCustomer);
    await recalculateAccountBalance(account);
    await recalculateAccountBalance(customerAccountId);

    res.json({ message: "Payment updated successfully", data: payment });
  } catch (err) {
    console.error("❌ Update Payment Error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete receive payment
exports.deleteReceivePayment = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const payment = await ReceivePayment.findOne({
      _id: req.params.id,
      userId,
    });

    if (!payment) return res.status(404).json({ error: "Not found" });

    const customerData = await Customer.findById(payment.customer);
    if (!customerData)
      return res.status(404).json({ error: "Customer not found" });

    const customerAccountId = customerData.account;

    try {
      if (
        payment.attachment &&
        fs.existsSync(path.resolve(payment.attachment))
      ) {
        fs.unlinkSync(path.resolve(payment.attachment));
      }
    } catch (e) {
      console.warn("⚠️ Delete attachment error:", e.message);
    }

    await payment.deleteOne();

    await JournalEntry.deleteMany({
      referenceId: payment._id,
      sourceType: "receive_payment",
    });

    await recalculateAccountBalance(payment.account);
    await recalculateAccountBalance(customerAccountId);

    res.json({ message: "Payment deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Payment Error:", err);
    res.status(500).json({ error: err.message });
  }
};
