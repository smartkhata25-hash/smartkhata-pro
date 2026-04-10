const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Invoice = require("../models/Invoice");
const Account = require("../models/Account");

const Product = require("../models/Product");
const JournalEntry = require("../models/JournalEntry");
const fs = require("fs");
const path = require("path");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getCustomerBalanceFromJournal } = require("../utils/journalHelper");
const { createPaymentEntry } = require("../utils/paymentService");
const Counter = require("../models/Counter");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

// ✅ Create Invoice - UPDATED
exports.createInvoice = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user?.id || req.userId);

    const {
      customerName,
      customerPhone,
      by,
      invoiceDate,
      invoiceTime,
      dueDate,
      totalAmount,
      paidAmount,
      notes,
      paymentType,
      accountId,
    } = req.body;

    const parsedInvoiceDate = new Date(invoiceDate);

    if (paidAmount > 0 && !accountId) {
      return res.status(400).json({
        message: "Account is required for paid invoices.",
      });
    }

    const items =
      typeof req.body.items === "string"
        ? JSON.parse(req.body.items)
        : req.body.items;

    // 🔥 ATOMIC BILL NUMBER GENERATION
    let counter = await Counter.findOne({
      type: "sale_invoice",
      userId: userId,
    });

    if (!counter) {
      counter = await Counter.create({
        type: "sale_invoice",
        userId: userId,
        seq: 1000,
      });
    }

    counter.seq += 1;
    await counter.save();

    const billNo = counter.seq.toString();

    let status = "Unpaid";
    if (paidAmount >= totalAmount) status = "Paid";
    else if (paidAmount > 0) status = "Partial";

    const invoice = new Invoice({
      billNo,
      customerName,
      customerPhone,
      by,
      invoiceDate: parsedInvoiceDate,
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

    // ⚠️ CREDIT LIMIT WARNING ONLY (invoice save ہوگی)
    let creditLimitExceeded = false;

    if (customer.creditLimit && customer.creditLimit > 0) {
      const currentBalance = await getCustomerBalanceFromJournal(
        customer._id,
        userId,
      );

      if (currentBalance + totalAmount > customer.creditLimit) {
        creditLimitExceeded = true;
      }
    }
    invoice.customerId = customer._id;

    const saved = await invoice.save();

    // ✅ Stock Updates...
    for (let item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Sale Invoice #${billNo}`,
        invoiceId: saved._id,
        invoiceModel: "Invoice",
        userId: userId,
      });
    }

    const allIncomeAccounts = await Account.find({
      type: "Income",
      userId: userId,
    });

    // ✅ 🔑 FETCH or AUTO-CREATE Sales Income Account
    let incomeAccount = await Account.findOne({
      name: "sales",
      type: "Income",
      userId: userId,
    });

    if (!incomeAccount) {
      console.log(
        "⚠️ Sales income account not found. Creating automatically...",
      );

      incomeAccount = await Account.create({
        userId: userId,
        name: "sales",
        type: "Income",
        normalBalance: "credit",
        code: "INC-SALES",
        balance: 0,
        openingBalance: 0,
        category: "other",
      });

      console.log("✅ Sales income account AUTO-CREATED:", incomeAccount._id);
    } else {
      console.log("🏦 Sales income account FOUND:", incomeAccount._id);
    }

    let invoiceDateTime = new Date(parsedInvoiceDate);

    if (invoiceTime) {
      const combined = new Date(`${invoiceDate}T${invoiceTime}`);
      if (!isNaN(combined.getTime())) {
        invoiceDateTime = combined;
      }
    }

    // 🧮 COGS calculate (mal ki lagat)
    let totalCogs = 0;

    for (let item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        totalCogs += product.unitCost * item.quantity;
      }
    }

    // 🏦 Inventory & COGS accounts
    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId: userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId: userId,
    });

    let finalInventoryAccount = inventoryAccount;
    let finalCogsAccount = cogsAccount;

    if (!finalInventoryAccount) {
      finalInventoryAccount = await Account.create({
        userId: userId,
        name: "inventory",
        type: "Asset",
        normalBalance: "debit",
        category: "other",
        code: "INVENTORY",
        isSystem: true,
      });
    }

    if (!finalCogsAccount) {
      finalCogsAccount = await Account.create({
        userId: userId,
        name: "cogs",
        type: "Expense",
        normalBalance: "debit",
        category: "other",
        code: "COGS",
        isSystem: true,
      });
    }

    const journal = new JournalEntry({
      date: invoiceDateTime,
      time: invoiceTime || "",
      description: notes || "",
      sourceType: "sale_invoice",
      referenceId: saved._id,
      invoiceId: saved._id,
      billNo,

      createdBy: userId,
      customerId: customer._id,
      attachmentUrl: req.file?.filename || "",
      attachmentType: req.file?.mimetype?.split("/")[0] || "",
      lines: [
        // 👤 Customer debit
        {
          account: new mongoose.Types.ObjectId(customer.account),
          type: "debit",
          amount: totalAmount,
        },

        // 💰 Sales credit
        {
          account: new mongoose.Types.ObjectId(incomeAccount._id),
          type: "credit",
          amount: totalAmount,
        },

        // 📉 COGS (expense)
        {
          account: new mongoose.Types.ObjectId(finalCogsAccount._id),
          type: "debit",
          amount: totalCogs,
        },

        // 📦 Inventory kam
        {
          account: new mongoose.Types.ObjectId(finalInventoryAccount._id),
          type: "credit",
          amount: totalCogs,
        },
      ],
    });

    try {
      await journal.save();
      if (paidAmount > 0) {
        await createPaymentEntry({
          userId: userId,
          referenceId: saved._id,
          sourceType: "receive_payment",
          billNo: saved.billNo,
          accountId,
          counterPartyAccountId: customer.account,
          amount: paidAmount,
          paymentType,
          description: `Payment against Sale Invoice ${invoice.billNo}`,
          customerId: customer._id,
        });
      }

      console.log("✅ Journal SAVED successfully. ID:", journal._id);
    } catch (err) {
      console.error("❌ Journal SAVE FAILED");
      console.error("Message:", err.message);
      console.error("Errors:", err.errors);
    }

    if (accountId && paidAmount > 0) {
      await recalculateAccountBalance(accountId);
    }
    await recalculateAccountBalance(finalInventoryAccount._id);
    await recalculateAccountBalance(finalCogsAccount._id);

    res.status(201).json({
      invoice: saved,
      creditLimitExceeded,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        message: "Bill number already exists",
      });
    }

    console.error("Invoice save error:", error);
    res.status(500).json({ message: "Invoice creation failed", error });
  }
};

// ✅ Get All Invoices (List Page)
exports.getInvoices = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const invoices = await Invoice.find({ createdBy: userId })
      .populate("items.productId", "name unit")
      .sort({ createdAt: -1 })
      .lean();

    const formatted = [];

    for (const inv of invoices) {
      const journal = await JournalEntry.findOne({
        referenceId: inv._id,
        sourceType: "receive_payment",
        isDeleted: false,
      }).populate("lines.account", "name");

      const paymentLine = journal?.lines?.find(
        (l) => l.paymentType && l.account,
      );

      formatted.push({
        ...inv,
        paymentMode: paymentLine?.paymentType || inv.paymentType || "-",
        accountName: paymentLine?.account?.name || "-",
      });
    }

    res.json(formatted);
  } catch (error) {
    console.error("Failed to fetch invoices:", error);
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
  invoice.isDeleted = true;
  await invoice.save();

  // ❗ Delete related inventory transactions
  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "Invoice",
    userId,
  });

  // 🟡 Soft Delete Related Journal
  await JournalEntry.updateMany(
    { referenceId: invoice._id, sourceType: "sale_invoice" },
    { isDeleted: true },
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
      customerName,
      customerPhone,
      by,
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
        invoice.attachmentUrl,
      );
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    await deleteTransactionsByReference({
      referenceId: invoice._id,
      invoiceModel: "Invoice",
      userId,
    });

    // ✅ Update invoice fields

    invoice.customerName = customerName;
    invoice.customerPhone = customerPhone;
    invoice.by = by;

    // ✅ Safely parse dates
    const parsedInvoiceDate = new Date(invoiceDate);
    invoice.invoiceDate = !isNaN(parsedInvoiceDate)
      ? parsedInvoiceDate
      : new Date();

    invoice.invoiceTime = invoiceTime;
    invoice.dueDate = dueDate;
    invoice.items = items;
    invoice.totalAmount = totalAmount;
    invoice.paidAmount =
      paidAmount !== undefined ? Number(paidAmount) : invoice.paidAmount;
    invoice.notes = notes;
    invoice.paymentType = paymentType;
    invoice.accountId = accountId;
    const finalPaid = invoice.paidAmount;

    invoice.status =
      finalPaid >= totalAmount ? "Paid" : finalPaid > 0 ? "Partial" : "Unpaid";

    if (req.file) {
      invoice.attachmentUrl = req.file.filename;
      invoice.attachmentType = req.file.mimetype?.split("/")[0] || "";
    }

    await invoice.save();

    for (let item of items) {
      await createInventoryEntry({
        productId: item.productId,
        type: "OUT",
        quantity: item.quantity,
        note: `Updated Sale Invoice #${invoice.billNo}`,
        invoiceId: invoice._id,
        invoiceModel: "Invoice",
        userId: userId,
      });
    }

    // ✅ Remove old journal entries
    await JournalEntry.updateMany(
      { referenceId: invoice._id, sourceType: "sale_invoice" },
      { isDeleted: true },
    );

    // 🧮 COGS calculate (mal ki lagat)
    let totalCogs = 0;

    for (let item of items) {
      const product = await Product.findById(item.productId);
      if (product) {
        totalCogs += product.unitCost * item.quantity;
      }
    }

    // 🏦 Inventory & COGS accounts
    const inventoryAccount = await Account.findOne({
      code: "INVENTORY",
      userId: userId,
    });

    const cogsAccount = await Account.findOne({
      code: "COGS",
      userId: userId,
    });

    let finalInventoryAccount = inventoryAccount;
    let finalCogsAccount = cogsAccount;

    if (!finalInventoryAccount) {
      finalInventoryAccount = await Account.create({
        userId: userId,
        name: "inventory",
        type: "Asset",
        category: "other",
        code: "INVENTORY",
        isSystem: true,
      });
    }

    if (!finalCogsAccount) {
      finalCogsAccount = await Account.create({
        userId: userId,
        name: "cogs",
        type: "Expense",
        category: "other",
        code: "COGS",
        isSystem: true,
      });
    }

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
      let parsedInvoiceDate = new Date(invoiceDate);

      let journalDateTime = parsedInvoiceDate;

      if (invoiceTime) {
        const combined = new Date(`${invoiceDate}T${invoiceTime}`);
        if (!isNaN(combined.getTime())) {
          journalDateTime = combined;
        }
      }

      const journal = new JournalEntry({
        date: journalDateTime,
        time: invoiceTime || "",
        description: "Updated Sale Invoice",
        sourceType: "sale_invoice",
        referenceId: invoice._id,
        invoiceId: invoice._id,
        createdBy: userId,

        lines: [
          // 👤 Customer debit (sale total)
          {
            account: new mongoose.Types.ObjectId(customer.account),
            type: "debit",
            amount: totalAmount,
          },

          // 💰 Sales credit
          {
            account: new mongoose.Types.ObjectId(incomeAccount._id),
            type: "credit",
            amount: totalAmount,
          },

          // 📉 COGS (expense)
          {
            account: new mongoose.Types.ObjectId(finalCogsAccount._id),
            type: "debit",
            amount: totalCogs,
          },

          // 📦 Inventory kam
          {
            account: new mongoose.Types.ObjectId(finalInventoryAccount._id),
            type: "credit",
            amount: totalCogs,
          },
        ],

        attachmentUrl: invoice.attachmentUrl || "",
        attachmentType: invoice.attachmentType || "",
      });

      await journal.save();
      if (paidAmount > 0) {
        await createPaymentEntry({
          userId: userId,
          referenceId: invoice._id,
          sourceType: "receive_payment",
          billNo: invoice.billNo,
          accountId,
          counterPartyAccountId: customer.account,
          amount: paidAmount,
          paymentType,
          description: `Payment against Sale Invoice ${invoice.billNo}`,
          customerId: customer._id,
        });
      }

      invoice.journalEntryId = journal._id;
      await invoice.save();

      await recalculateAccountBalance(finalInventoryAccount._id);
      await recalculateAccountBalance(finalCogsAccount._id);

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
    const { amount, accountId, paymentType } = req.body;

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
      await createPaymentEntry({
        userId,
        referenceId: invoice._id,
        sourceType: "receive_payment",
        billNo: invoice.billNo,
        accountId,
        counterPartyAccountId: customer.account,
        amount,
        paymentType,
        description: `Additional payment for Invoice ${invoice.billNo}`,
        customerId: customer._id,
      });

      if (accountId) {
        await recalculateAccountBalance(accountId);
      }
    }

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Payment update failed", error });
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
// ✅ 🔍 Search Invoices by multiple fields
exports.searchInvoices = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const queryText = req.query.q || "";

    const filters = { createdBy: userId };
    queryText.split(" ").forEach((pair) => {
      const [key, value] = pair.split(":");
      if (key && value) {
        if (key === "billNo") filters.billNo = value;
        if (key === "customerName")
          filters.customerName = { $regex: value, $options: "i" };
        if (key === "customerPhone")
          filters.customerPhone = { $regex: value, $options: "i" };
        if (key === "startDate") {
          filters.invoiceDate = {
            ...filters.invoiceDate,
            $gte: new Date(value),
          };
        }

        if (key === "endDate") {
          filters.invoiceDate = {
            ...filters.invoiceDate,
            $lte: new Date(value + "T23:59:59.999Z"),
          };
        }
      }
    });

    const invoices = await Invoice.find(filters).sort({ createdAt: -1 });
    res.json(invoices);
  } catch (error) {
    console.error("❌ Invoice search error:", error);
    res.status(500).json({ message: "Invoice search failed", error });
  }
};

// ✅ Navigate Invoice (Next / Previous by billNo)
exports.navigateInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const { billNo, direction } = req.query;

    if (!billNo || !direction) {
      return res.status(400).json({ message: "billNo and direction required" });
    }

    let invoice;

    if (direction === "next") {
      invoice = await Invoice.findOne({
        createdBy: userId,
        billNo: { $gt: billNo },
      }).sort({ billNo: 1 });
    } else if (direction === "previous") {
      invoice = await Invoice.findOne({
        createdBy: userId,
        billNo: { $lt: billNo },
      }).sort({ billNo: -1 });
    }

    if (!invoice) {
      return res.status(404).json({ message: "No more invoices" });
    }

    res.json(invoice);
  } catch (error) {
    console.error("Navigation error:", error);
    res.status(500).json({ message: "Navigation failed", error });
  }
};

// ✅ Get Last Bill Number (From Counter - Correct Way)
exports.getLastInvoiceNo = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const counter = await Counter.findOne({
      type: "sale_invoice",
      userId: userId,
    });

    if (!counter) {
      return res.json({ lastBillNo: 1000 });
    }

    res.json({ lastBillNo: counter.seq });
  } catch (error) {
    console.error("❌ Error fetching last bill number:", error);
    res.status(500).json({ message: "Failed to fetch last bill number" });
  }
};
