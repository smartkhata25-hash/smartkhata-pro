const RefundInvoice = require("../models/RefundInvoice");
const Product = require("../models/Product");
const JournalEntry = require("../models/JournalEntry");
const Customer = require("../models/Customer");
const Account = require("../models/Account");
const Invoice = require("../models/Invoice");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

const Counter = require("../models/Counter");

const { createPaymentEntry } = require("../utils/paymentService");
const { recalculateAccountBalance } = require("../utils/accountHelper");

// ✅ Create Refund - Updated Version (with InventoryTransaction)
exports.createRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const {
      billNo,
      invoiceDate,
      invoiceTime,
      customerId,
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    // ✅ Basic validation
    if (!customerId || items.length === 0) {
      return res.status(400).json({ error: "Customer ID and items required" });
    }

    // ✅ Customer
    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // ✅ Accounts
    const salesReturnAccount = await Account.findOne({
      name: "sales return",
      type: "Income",
      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId,
    });

    if (!salesReturnAccount || !inventoryAccount || !cogsAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    // ✅ Customer account (MOST IMPORTANT FOR LEDGER)
    const customerAccountId =
      typeof customer.account === "object"
        ? customer.account?._id
        : customer.account;

    if (!customerAccountId) {
      return res.status(400).json({
        error: "Customer account not linked",
      });
    }

    // ✅ Refund Counter (Per User)
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

    const refundBillNo = `R-${counter.seq}`;

    // ✅ Save Refund Invoice
    const refundInvoice = new RefundInvoice({
      billNo: refundBillNo,
      invoiceDate,
      invoiceTime,
      customerId: customer._id,
      customerName: customer.name,
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType,
      accountId: paymentType === "cash" ? accountId : null,
      notes,
      items,
      createdBy: userId,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
    });

    if (originalInvoiceId) {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original sale invoice not found",
        });
      }

      // اصل quantity محفوظ کریں
      const originalQtyMap = {};
      originalInvoice.items.forEach((item) => {
        originalQtyMap[item.productId.toString()] = item.quantity;
      });

      // پہلے کتنے ریفنڈ ہو چکے
      const previousRefunds = await RefundInvoice.find({
        originalInvoiceId,
      });

      const refundedQtyMap = {};

      previousRefunds.forEach((ref) => {
        ref.items.forEach((item) => {
          const key = item.productId.toString();
          if (!refundedQtyMap[key]) refundedQtyMap[key] = 0;
          refundedQtyMap[key] += item.quantity;
        });
      });

      // اب نیا ریفنڈ چیک کریں
      for (const item of items) {
        const key = item.productId.toString();

        const originalQty = originalQtyMap[key] || 0;
        const alreadyRefunded = refundedQtyMap[key] || 0;

        if (item.quantity + alreadyRefunded > originalQty) {
          return res.status(400).json({
            error: "Refund quantity exceeds original sold quantity",
          });
        }
      }
    }

    await refundInvoice.save();

    // ✅ Date handling
    let refundDateTime = new Date(`${invoiceDate}T${invoiceTime}`);
    if (isNaN(refundDateTime.getTime())) {
      refundDateTime = new Date(invoiceDate);
    }

    // ✅ JOURNAL LINES (FINAL & CORRECT)
    const lines = [
      // 🔴 Customer refund (ledger entry – balance kam)
      {
        account: customerAccountId,
        type: "credit",
        amount: totalAmount,
      },

      // 🟢 Sales return
      {
        account: salesReturnAccount._id,
        type: "debit",
        amount: totalAmount,
      },

      // 🟢 Inventory back
      {
        account: inventoryAccount._id,
        type: "debit",
        amount: totalAmount,
      },

      // 🔴 COGS reverse
      {
        account: cogsAccount._id,
        type: "credit",
        amount: totalAmount,
      },
    ];

    // ✅ Journal Entry
    const journal = new JournalEntry({
      date: refundDateTime,
      time: invoiceTime || "",
      description: notes || "",

      sourceType: "refund_invoice",
      referenceId: refundInvoice._id,
      invoiceId: refundInvoice._id,
      billNo,
      paymentType,
      createdBy: userId,
      customerId: customer._id,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      lines,
    });

    await journal.save();
    if (paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: refundInvoice._id,
        sourceType: "refund_payment",
        billNo: refundInvoice.billNo,
        accountId,
        counterPartyAccountId: customerAccountId,
        amount: totalAmount,
        paymentType,
        description: `Refund Payment - ${refundInvoice.billNo}`,
      });
      await recalculateAccountBalance(customerAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    // ✅ Inventory transactions via stockHelper
    for (const item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        note: `Refund Invoice #${refundInvoice.billNo}`,
        invoiceId: refundInvoice._id,
        invoiceModel: "RefundInvoice",
        userId,
      });
    }

    res.status(201).json({
      message: "✅ Refund created successfully",
      refundInvoice,
    });
  } catch (err) {
    console.error("❌ Refund Save Error:", err);
    res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Get Refund by ID
exports.getRefundById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const refund = await RefundInvoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!refund) {
      return res.status(404).json({ error: "Refund not found" });
    }

    // 🔍 Journal Entry نکالیں
    const journal = await JournalEntry.findOne({
      referenceId: refund._id,
      sourceType: "refund_invoice",
    }).populate("lines.account", "name");

    // 💡 Payment line (credit side)
    const paymentLine = journal?.lines?.find(
      (line) => line.type === "credit" && line.paymentType,
    );

    res.json({
      ...refund.toObject(),
      paymentMode: paymentLine?.paymentType || refund.paymentType || "cash",
      accountId: paymentLine?.account?._id || "",
      accountName: paymentLine?.account?.name || "-",
    });
  } catch (err) {
    console.error("❌ Get Refund Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

// ✅ Update Refund Invoice with Journal + Stock Update
exports.updateRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // ✅ Refund find
    const refund = await RefundInvoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!refund) {
      return res.status(404).json({ error: "Refund not found" });
    }

    const {
      billNo,
      invoiceDate,
      invoiceTime,
      customerId,
      customerPhone,
      totalAmount,
      paidAmount,
      paymentType,
      accountId,
      notes,
      originalInvoiceId,
    } = req.body;

    const items = JSON.parse(req.body.items || "[]");

    // ✅ Customer
    const customer = await Customer.findOne({
      _id: customerId,
      createdBy: userId,
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // ✅ Accounts
    const salesReturnAccount = await Account.findOne({
      name: "sales return",
      type: "Income",
      userId,
    });

    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId,
    });

    if (!salesReturnAccount || !inventoryAccount || !cogsAccount) {
      return res.status(400).json({
        error: "Required accounts not found",
      });
    }

    // ✅ Customer account (ledger key)
    const customerAccountId =
      typeof customer.account === "object"
        ? customer.account?._id
        : customer.account;

    if (!customerAccountId) {
      return res.status(400).json({
        error: "Customer account not linked",
      });
    }

    // ✅ Update refund invoice

    const oldItems = refund.items;

    refund.billNo = billNo;
    refund.invoiceDate = invoiceDate;
    refund.invoiceTime = invoiceTime;
    refund.customerId = customer._id;
    refund.customerName = customer.name;
    refund.customerPhone = customerPhone;
    refund.totalAmount = totalAmount;
    refund.paidAmount = paidAmount;
    refund.paymentType = paymentType;
    refund.accountId = paymentType === "cash" ? accountId : null;
    refund.notes = notes;
    refund.items = items;

    if (req.file) {
      refund.attachmentUrl = req.file.filename;
      refund.attachmentType = req.file.mimetype?.split("/")[0] || "";
    }

    if (originalInvoiceId) {
      const originalInvoice = await Invoice.findById(originalInvoiceId);

      if (!originalInvoice) {
        return res.status(404).json({
          error: "Original sale invoice not found",
        });
      }

      // اصل quantity map
      const originalQtyMap = {};
      originalInvoice.items.forEach((item) => {
        originalQtyMap[item.productId.toString()] = item.quantity;
      });

      // پہلے کتنے ریفنڈ ہو چکے (اپنے آپ کو چھوڑ کر)
      const previousRefunds = await RefundInvoice.find({
        originalInvoiceId,
        _id: { $ne: refund._id }, // 🔥 IMPORTANT
      });

      const refundedQtyMap = {};

      previousRefunds.forEach((ref) => {
        ref.items.forEach((item) => {
          const key = item.productId.toString();
          if (!refundedQtyMap[key]) refundedQtyMap[key] = 0;
          refundedQtyMap[key] += item.quantity;
        });
      });

      // نیا ریفنڈ چیک کریں
      for (const item of items) {
        const key = item.productId.toString();

        const originalQty = originalQtyMap[key] || 0;
        const alreadyRefunded = refundedQtyMap[key] || 0;

        if (item.quantity + alreadyRefunded > originalQty) {
          return res.status(400).json({
            error: "Refund quantity exceeds original sold quantity",
          });
        }
      }
    }

    await refund.save();

    // ✅ Delete old journal
    await JournalEntry.deleteOne({
      referenceId: refund._id,
      sourceType: "refund_invoice",
      createdBy: userId,
    });

    // ✅ Delete old inventory transactions
    await deleteTransactionsByReference({
      referenceId: refund._id,
      invoiceModel: "RefundInvoice",
      userId,
    });

    // ✅ Date handling
    let refundDateTime = new Date(`${invoiceDate}T${invoiceTime}`);
    if (isNaN(refundDateTime.getTime())) {
      refundDateTime = new Date(invoiceDate);
    }

    // ✅ JOURNAL LINES (FINAL & CORRECT)
    const lines = [
      // 🔴 Customer refund (ledger)
      {
        account: customerAccountId,
        type: "credit",
        amount: totalAmount,
      },

      // 🟢 Sales return
      {
        account: salesReturnAccount._id,
        type: "debit",
        amount: totalAmount,
      },

      // 🟢 Inventory back
      {
        account: inventoryAccount._id,
        type: "debit",
        amount: totalAmount,
      },

      // 🔴 COGS reverse
      {
        account: cogsAccount._id,
        type: "credit",
        amount: totalAmount,
      },
    ];

    // ✅ New journal entry
    const journal = new JournalEntry({
      date: refundDateTime,
      time: invoiceTime || "",
      description: notes || "",
      sourceType: "refund_invoice",
      referenceId: refund._id,
      invoiceId: refund._id,
      billNo: refund.billNo,
      paymentType,
      createdBy: userId,
      customerId: customer._id,
      attachmentUrl: refund.attachmentUrl || "",
      attachmentType: refund.attachmentType || "",
      lines,
    });

    await journal.save();

    if (paymentType && accountId) {
      await createPaymentEntry({
        userId,
        referenceId: refund._id,
        sourceType: "refund_payment",
        billNo: refund.billNo,
        accountId,
        counterPartyAccountId: customerAccountId,
        amount: totalAmount,
        paymentType,
        description: `Refund Payment - ${refund.billNo}`,
      });
      await recalculateAccountBalance(customerAccountId);
      if (accountId) await recalculateAccountBalance(accountId);
    }

    // ✅ New inventory transactions
    for (const item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        note: `Updated Refund Invoice #${refund.billNo}`,
        invoiceId: refund._id,
        invoiceModel: "RefundInvoice",
        userId,
      });
    }

    res.json({
      message: "✅ Refund updated successfully",
      refund,
    });
  } catch (err) {
    console.error("❌ Update Refund Error:", err);
    res.status(500).json({
      error: "Server Error",
      detail: err.message,
    });
  }
};

// ✅ Get All Refunds
exports.getAllRefunds = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const refunds = await RefundInvoice.find({ createdBy: userId })
      .sort({ createdAt: -1 })
      .lean();

    const formatted = [];

    for (const r of refunds) {
      const journal = await JournalEntry.findOne({
        referenceId: r._id,
        sourceType: "refund_invoice",
      }).populate("lines.account", "name");

      const paymentLine = journal?.lines?.find(
        (l) => l.paymentType && l.account,
      );

      formatted.push({
        ...r,
        paymentMode: paymentLine?.paymentType || r.paymentType || "-",
        accountName: paymentLine?.account?.name || "-",
      });
    }

    res.json(formatted);
  } catch (err) {
    console.error("❌ Get All Refunds Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};

// ✅ Delete Refund Invoice (with stock update)
exports.deleteRefundInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { id } = req.params;

    // 🔍 Step 0: Find refund invoice with items
    const refundInvoice = await RefundInvoice.findOne({
      _id: id,
      createdBy: userId,
    });

    if (!refundInvoice) {
      return res
        .status(404)
        .json({ error: "Refund not found or already deleted" });
    }

    // 🗑️ Step 2: Delete InventoryTransaction
    await deleteTransactionsByReference({
      referenceId: id,
      invoiceModel: "RefundInvoice",
      userId,
    });

    // 🧾 Step 3: Delete journal entry
    await JournalEntry.deleteOne({
      referenceId: id,
      sourceType: "refund_invoice",
      createdBy: userId,
    });

    await JournalEntry.deleteMany({
      referenceId: id,
      sourceType: "refund_payment",
      createdBy: userId,
    });

    // 🧾 Step 4: Delete refund invoice itself
    const result = await RefundInvoice.deleteOne({
      _id: id,
      createdBy: userId,
    });

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: "Refund not found or already deleted" });
    }

    res.json({ message: "✅ Refund deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Refund Error:", err);
    res.status(500).json({ error: "Server Error" });
  }
};
