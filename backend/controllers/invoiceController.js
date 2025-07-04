const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const Account = require("../models/Account");
const InventoryTransaction = require("../models/InventoryTransaction");
const Product = require("../models/Product");
const JournalEntry = require("../models/JournalEntry");
const fs = require("fs");
const path = require("path");
const { recalculateAccountBalance } = require("../utils/accountHelper");

// ✅ Create Invoice - UPDATED
exports.createInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const {
      billNo,
      customerName,
      customerPhone,
      invoiceDate,
      invoiceTime,
      dueDate,
      totalAmount,
      paidAmount,
      notes,
      paymentType,
      accountId,
    } = req.body;

    if (paidAmount > 0 && !accountId) {
      return res.status(400).json({
        message: "Account is required for paid invoices.",
      });
    }

    const items = JSON.parse(req.body.items);
    let status = "Unpaid";
    if (paidAmount >= totalAmount) status = "Paid";
    else if (paidAmount > 0) status = "Partial";

    const invoice = new Invoice({
      billNo,
      customerName,
      customerPhone,
      invoiceDate,
      invoiceTime,
      dueDate,
      items,
      totalAmount,
      paidAmount,
      status,
      notes,
      paymentType,
      accountId,
      createdBy: userId,
    });

    const customer = await Customer.findOne({
      name: customerName,
      createdBy: userId,
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    invoice.customerId = customer._id;

    const saved = await invoice.save();

    // ✅ Stock Updates...
    for (let item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }

      await InventoryTransaction.create({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Sale Invoice #${billNo}`,
        invoiceId: saved._id,
        invoiceModel: "Invoice",
        userId: userId,
      });
    }

    // ✅ 🔑 FETCH Sales Income Account
    const incomeAccount = await Account.findOne({
      name: "sales",
      type: "Income",
      userId: userId,
    });

    if (!incomeAccount) {
      return res
        .status(400)
        .json({ message: "Income account 'sales' not found" });
    }

    let invoiceDateTime = new Date(`${invoiceDate}T${invoiceTime}`);
    if (isNaN(invoiceDateTime.getTime())) {
      invoiceDateTime = new Date(invoiceDate);
    }

    const journal = new JournalEntry({
      date: invoiceDateTime,
      time: invoiceTime || "",
      description: "Sale Invoice",
      sourceType: "sale_invoice",
      referenceId: saved._id,
      billNo,
      paymentType: paymentType || "cash",
      createdBy: userId,
      customerId: customer._id,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      lines: [
        {
          account: new mongoose.Types.ObjectId(customer.account),
          type: "debit",
          amount: totalAmount,
        },
        {
          account: new mongoose.Types.ObjectId(incomeAccount._id),
          type: "credit",
          amount: totalAmount,
        },
        ...(paidAmount > 0
          ? [
              {
                account: new mongoose.Types.ObjectId(accountId),
                type: "debit",
                amount: paidAmount,
              },
              {
                account: new mongoose.Types.ObjectId(customer.account),
                type: "credit",
                amount: paidAmount,
              },
            ]
          : []),
      ],
    });

    await journal.save();

    if (accountId && paidAmount > 0) {
      await recalculateAccountBalance(accountId);
    }

    res.status(201).json(saved);
  } catch (error) {
    console.error("Invoice save error:", error);
    res.status(500).json({ message: "Invoice creation failed", error });
  }
};

// ✅ Get All Invoices (List Page)
exports.getInvoices = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId; // ✅ Add this line

    const invoices = await Invoice.find({ createdBy: userId }).sort({
      createdAt: -1,
    });

    res.json(invoices);
  } catch (error) {
    console.error("Failed to fetch invoices:", error); // 👈 helpful for debugging
    res.status(500).json({ message: "Failed to fetch invoices", error });
  }
};

// ✅ Get Single Invoice
exports.getInvoiceById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Error fetching invoice", error });
  }
};

// ✅ Delete Invoice (Soft delete invoice + journal)
exports.deleteInvoice = async (req, res) => {
  const userId = req.user?.id || req.userId;

  const invoice = await Invoice.findOne({
    _id: req.params.id,
    createdBy: userId,
  });

  if (!invoice) {
    return res.status(404).json({ message: "Invoice not found" });
  }

  // 🟡 Delete Invoice
  await Invoice.findByIdAndDelete(invoice._id);

  // 🟡 Soft Delete Related Journal
  await JournalEntry.updateMany(
    { referenceId: invoice._id, sourceType: "sale_invoice" },
    { isDeleted: true }
  );

  if (invoice.accountId) {
    await recalculateAccountBalance(invoice.accountId);
  }

  res.json({ message: "Invoice and related journal deleted successfully" });
};

// ✅ Update Invoice - Safe DateTime Version
exports.updateInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    const {
      billNo,
      customerName,
      customerPhone,
      invoiceDate,
      invoiceTime,
      dueDate,
      totalAmount,
      paidAmount,
      notes,
      paymentType,
      accountId,
    } = req.body;

    const items = JSON.parse(req.body.items);

    if (req.file && invoice.attachmentUrl) {
      const oldPath = path.join(
        __dirname,
        "../uploads/",
        invoice.attachmentUrl
      );
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    // ✅ Restore old stock
    for (let oldItem of invoice.items) {
      const oldProduct = await Product.findById(oldItem.productId);
      if (oldProduct) {
        oldProduct.stock += oldItem.quantity;
        await oldProduct.save();
      }
    }

    await InventoryTransaction.deleteMany({
      invoiceId: invoice._id,
      invoiceModel: "Invoice",
    });

    // ✅ Update invoice fields
    invoice.billNo = billNo;
    invoice.customerName = customerName;
    invoice.customerPhone = customerPhone;

    // ✅ Safely parse dates
    const parsedInvoiceDate = new Date(invoiceDate);
    invoice.invoiceDate = !isNaN(parsedInvoiceDate)
      ? parsedInvoiceDate
      : new Date();

    invoice.invoiceTime = invoiceTime;
    invoice.dueDate = dueDate;
    invoice.items = items;
    invoice.totalAmount = totalAmount;
    invoice.paidAmount = paidAmount;
    invoice.notes = notes;
    invoice.paymentType = paymentType;
    invoice.accountId = accountId;
    invoice.status =
      paidAmount >= totalAmount
        ? "Paid"
        : paidAmount > 0
        ? "Partial"
        : "Unpaid";

    if (req.file) {
      invoice.attachmentUrl = req.file.filename;
      invoice.attachmentType = req.file.mimetype?.split("/")[0] || "";
    }

    await invoice.save();

    // ✅ Stock adjust
    for (let item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        product.stock -= item.quantity;
        await product.save();
      }

      await InventoryTransaction.create({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Sale Invoice #${billNo}`,
        invoiceId: invoice._id,
        invoiceModel: "Invoice",
        userId: userId,
      });
    }

    // ✅ Remove old journal entries
    await JournalEntry.updateMany(
      { referenceId: invoice._id, sourceType: "sale_invoice" },
      { isDeleted: true }
    );

    const customer = await Customer.findById(invoice.customerId);
    const incomeAccount = await Account.findOne({
      name: "sales",
      type: "Income",
      userId: userId,
    });

    if (!incomeAccount) {
      return res
        .status(400)
        .json({ message: "Income account 'sales' not found" });
    }

    if (customer) {
      // ✅ Safe DateTime for journal entry
      const safeDateTime = () => {
        if (invoiceDate && invoiceTime) {
          const dt = new Date(`${invoiceDate}T${invoiceTime}`);
          if (!isNaN(dt)) return dt;
        }
        return new Date(); // fallback
      };

      const journal = new JournalEntry({
        date: safeDateTime(),
        time: invoiceTime || "",
        description: "Updated Sale Invoice",
        sourceType: "sale_invoice",
        referenceId: invoice._id,
        createdBy: userId,
        customerId: customer._id,
        billNo: billNo,
        paymentType,
        lines: [
          {
            account: new mongoose.Types.ObjectId(customer.account),
            type: "debit",
            amount: totalAmount,
          },
          {
            account: new mongoose.Types.ObjectId(incomeAccount._id),
            type: "credit",
            amount: totalAmount,
          },
          ...(paidAmount > 0
            ? [
                {
                  account: new mongoose.Types.ObjectId(accountId),
                  type: "debit",
                  amount: paidAmount,
                },
                {
                  account: new mongoose.Types.ObjectId(customer.account),
                  type: "credit",
                  amount: paidAmount,
                },
              ]
            : []),
        ],
        attachmentUrl: invoice.attachmentUrl || "",
        attachmentType: invoice.attachmentType || "",
      });

      await journal.save();

      invoice.journalEntryId = journal._id;
      await invoice.save();

      if (accountId) {
        await recalculateAccountBalance(accountId);
      }
    }

    res.json(invoice);
  } catch (error) {
    console.error("Invoice update error:", error);
    res.status(500).json({ message: "Invoice update failed", error });
  }
};

// ✅ Record Additional Payment
exports.recordPayment = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { amount, accountId } = req.body;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });
    if (!invoice) return res.status(404).json({ message: "Invoice not found" });

    invoice.paidAmount += amount;
    invoice.status =
      invoice.paidAmount >= invoice.totalAmount
        ? "Paid"
        : invoice.paidAmount > 0
        ? "Partial"
        : "Unpaid";

    await invoice.save();

    // ✅ Record journal for additional payment
    const customer = await Customer.findById(invoice.customerId);

    if (customer) {
      const journal = new JournalEntry({
        date: new Date(),
        time: new Date().toTimeString().slice(0, 8),
        billNo: invoice.billNo,
        sourceType: "sale_invoice",
        referenceId: invoice._id,
        createdBy: userId,
        customerId: customer._id,
        note: "Additional Payment", // ✅ یہ ضرور رکھیں
        lines: [
          {
            account: new mongoose.Types.ObjectId(customer.account),
            type: "debit",
            amount,
          },
          {
            account: new mongoose.Types.ObjectId(accountId),
            type: "credit",
            amount,
          },
        ],
      });

      console.log(
        "📤 [recordPayment] Journal Lines for Customer Ledger:",
        journal.lines
      );
      console.log(
        "📤 [recordPayment] customer.account:",
        customer.account?.toString()
      );

      await journal.save();

      if (accountId) {
        await recalculateAccountBalance(accountId);
      }
    }

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Payment update failed", error });
  }
};

// ✅ Get Last Bill No - updated
exports.getLastBillNo = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const lastInvoice = await Invoice.findOne({ createdBy: userId })
      .sort({ createdAt: -1 })
      .select("billNo");

    let lastBillNo = "1000";

    if (lastInvoice?.billNo) {
      const parsed = parseInt(lastInvoice.billNo, 10);
      if (!isNaN(parsed)) {
        lastBillNo = parsed.toString();
      }
    }

    res.json({ lastBillNo: Number(lastBillNo) }); // 👈 return as number
  } catch (error) {
    console.error("Error getting last bill no:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ Get Invoice By Bill No
exports.getInvoiceByBillNo = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      billNo: req.params.billNo,
      createdBy: userId,
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Error fetching invoice by bill no:", error);
    res.status(500).json({ message: "Failed to fetch invoice", error });
  }
};
