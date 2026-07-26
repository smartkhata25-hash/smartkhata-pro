const mongoose = require("mongoose");
const Customer = require("../models/Customer");
const Party = require("../models/Party");
const Invoice = require("../models/Invoice");
const Account = require("../models/Account");

const Product = require("../models/Product");
const JournalEntry = require("../models/JournalEntry");
const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const { getCustomerBalanceFromJournal } = require("../utils/journalHelper");
const {
  createPaymentEntry,
  createDiscountEntry,
} = require("../utils/paymentService");
const Counter = require("../models/Counter");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");
const { logActivity } = require("../utils/activityLogger");

function formatAttachments(invoice) {
  if (invoice.attachments?.length > 0) {
    return invoice.attachments.map((a) => ({
      ...a,
      fullUrl: getFileUrl(a.key),
    }));
  }

  if (invoice.attachmentUrl) {
    return [
      {
        key: invoice.attachmentUrl,
        type: invoice.attachmentType || "",
        size: invoice.attachmentSize || 0,
        originalName: invoice.attachmentOriginalName || "",
        fullUrl: getFileUrl(invoice.attachmentUrl),
      },
    ];
  }

  return [];
}

async function uploadInvoiceFiles(files, userId) {
  const uploadedAttachments = [];

  if (!files || files.length === 0) return uploadedAttachments;

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const uploadedFile = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName: "invoices",
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    uploadedAttachments.push({
      key: uploadedFile.key,
      type: uploadedFile.mimeType,
      size: uploadedFile.size,
      originalName: uploadedFile.originalName,
    });
  }

  return uploadedAttachments;
}

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
      subTotal,
      discountAmount,
      paidAmount,
      notes,
      paymentType,
      accountId,
      isOpening,
      partyId,
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

    // ✅ Normal invoice needs items
    if (
      (!isOpening || isOpening === "false") &&
      (!items || items.length === 0)
    ) {
      return res.status(400).json({
        message: "Invoice items are required",
      });
    }

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

    // ✅ Historical Snapshot Items
    const snapshotItems = [];

    for (let item of items) {
      const product = await Product.findById(item.productId);

      const quantity = Number(item.quantity || 0);

      const salePrice = Number(item.price || 0);

      const total = Number(item.total || 0);

      // ✅ Historical cost at sale time
      const costPrice = Number(product?.unitCost || 0);

      // ✅ Profit
      const profit = (salePrice - costPrice) * quantity;

      // ✅ Margin %
      const margin =
        salePrice > 0
          ? Number((((salePrice - costPrice) / salePrice) * 100).toFixed(2))
          : 0;

      snapshotItems.push({
        ...item,
        costPrice,
        profit,
        margin,
      });
    }

    let uploadedAttachments = await uploadInvoiceFiles(req.files, userId);

    const invoice = new Invoice({
      billNo,
      customerName,
      customerPhone,
      by,
      invoiceDate: parsedInvoiceDate,
      invoiceTime,
      dueDate,

      // ✅ Save snapshot items
      items: snapshotItems,

      totalAmount: Number(totalAmount),
      subTotal: Number(subTotal || totalAmount),
      discountAmount: Number(discountAmount || 0),

      paidAmount,
      status,
      notes,
      paymentType,
      accountId,
      isOpening: isOpening || false,
      createdBy: userId,
      attachments: uploadedAttachments,

      attachmentUrl: uploadedAttachments[0]?.key || "",
      attachmentType: uploadedAttachments[0]?.type || "",
      attachmentSize: uploadedAttachments[0]?.size || 0,
      attachmentOriginalName: uploadedAttachments[0]?.originalName || "",
    });

    let customer = null;
    let party = null;
    let counterPartyAccountId = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({ message: "Party not found" });
      }

      counterPartyAccountId = party.account;
    } else {
      customer = await Customer.findOne({
        name: customerName,
        createdBy: userId,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      counterPartyAccountId = customer.account;
    }

    // ⚠️ CREDIT LIMIT WARNING ONLY (invoice save ہوگی)
    let creditLimitExceeded = false;

    if (!partyId && customer?.creditLimit && customer.creditLimit > 0) {
      const currentBalance = await getCustomerBalanceFromJournal(
        customer._id,
        userId,
      );

      if (currentBalance + totalAmount > customer.creditLimit) {
        creditLimitExceeded = true;
      }
    }
    invoice.customerId = customer?._id || null;
    invoice.partyId = party?._id || null;

    const saved = await invoice.save();

    // ✅ Stock Updates (skip for opening invoice)
    if (!isOpening || isOpening === "false") {
      for (let item of snapshotItems) {
        await createInventoryEntry({
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          note: `Sale Invoice #${billNo}`,
          invoiceId: saved._id,
          invoiceModel: "Invoice",
          userId: userId,

          // ✅ Historical inventory rate
          rate: Number(item.costPrice || 0),
        });
      }
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

    // 🧮 COGS calculate using historical snapshot
    let totalCogs = 0;

    if (!isOpening || isOpening === "false") {
      for (let item of snapshotItems) {
        totalCogs += Number(item.costPrice || 0) * Number(item.quantity || 0);
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
      description:
        Number(discountAmount || 0) > 0
          ? `${notes || "Sale Invoice"} (Disc: ${discountAmount})`
          : notes || "Sale Invoice",
      sourceType: isOpening ? "opening_sale_invoice" : "sale_invoice",
      originModule: "sale_invoice",
      referenceId: saved._id,
      invoiceId: saved._id,
      billNo,

      createdBy: userId,
      customerId: customer?._id || null,
      partyId: party?._id || null,
      attachmentUrl: saved.attachmentUrl || "",
      attachmentType: saved.attachmentType || "",
      lines: isOpening
        ? [
            // ✅ Opening Balance Entry
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: totalAmount,
            },

            {
              account: new mongoose.Types.ObjectId(
                (
                  await Account.findOne({
                    code: "OPENING_BALANCE",
                    userId,
                  })
                )._id,
              ),
              type: "credit",
              amount: totalAmount,
            },
          ]
        : [
            // 👤 Customer debit
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: Number(subTotal || totalAmount),
            },

            // 💰 Sales credit
            {
              account: new mongoose.Types.ObjectId(incomeAccount._id),
              type: "credit",
              amount: Number(subTotal || totalAmount),
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
      const savedJournal = await journal.save();

      if (
        (!isOpening || isOpening === "false") &&
        Number(discountAmount || 0) > 0
      ) {
        await createDiscountEntry({
          userId,
          referenceId: saved._id,
          billNo: saved.billNo,
          customerAccountId: counterPartyAccountId,
          discountAmount: Number(discountAmount),
          description: "Sale Invoice Discount",
          originModule: "sale_invoice",
          customerId: customer?._id || null,
          partyId: party?._id || null,
        });
      }

      if ((!isOpening || isOpening === "false") && paidAmount > 0) {
        await createPaymentEntry({
          userId: userId,
          referenceId: saved._id,
          sourceType: "receive_payment",
          originModule: "sale_invoice",
          billNo: saved.billNo,
          accountId,
          counterPartyAccountId,
          amount: paidAmount,
          paymentType,
          description: "Sale Invoice Payment",
          customerId: customer?._id || null,
          partyId: party?._id || null,
        });
      }
    } catch (err) {
      console.error("❌ Journal SAVE FAILED");
      console.error("Message:", err.message);
      console.error("Errors:", err.errors);
    }

    if (accountId && paidAmount > 0) {
      await recalculateAccountBalance(accountId);
    }

    if (!isOpening || isOpening === "false") {
      await recalculateAccountBalance(finalInventoryAccount._id);
      await recalculateAccountBalance(finalCogsAccount._id);
    }

    await logActivity({
      req,
      action: "create",
      module: "sales",
      entityType: "Invoice",
      entityId: saved._id,
      title: `Sale Invoice ${saved.billNo}`,
      description: `${saved.customerName} کی Sale Invoice بنائی گئی`,
      billNo: saved.billNo,
      after: {
        customerName: saved.customerName,
        customerPhone: saved.customerPhone,
        invoiceDate: saved.invoiceDate,
        totalAmount: saved.totalAmount,
        paidAmount: saved.paidAmount,
        status: saved.status,
        itemCount: saved.items?.length || 0,
        isOpening: saved.isOpening,
      },
    });

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

// ✅ Get Invoices - Fast Pagination List
exports.getInvoices = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    // ✅ Pagination
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);

    const requestedLimit = parseInt(req.query.limit || "50", 10);

    // ✅ Maximum 100 records at one time
    const limit = Math.min(Math.max(requestedLimit, 1), 100);

    const skip = (page - 1) * limit;

    // ✅ Filters
    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim();

    // ✅ Search text safety
    const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    // ✅ Active customers and parties together
    const [activeCustomers, activeParties] = await Promise.all([
      Customer.find({
        createdBy: userId,
        isActive: true,
      })
        .select("_id")
        .lean(),

      Party.find({
        userId,
        isDeleted: false,
        isActive: true,
      })
        .select("_id")
        .lean(),
    ]);

    const activeCustomerIds = activeCustomers.map((customer) => customer._id);
    const activePartyIds = activeParties.map((party) => party._id);

    // ✅ Main invoice filter
    const filter = {
      createdBy: userId,
      isDeleted: { $ne: true },

      $and: [
        {
          $or: [
            { customerId: { $in: activeCustomerIds } },
            { partyId: { $in: activePartyIds } },
          ],
        },
      ],
    };

    // ✅ Status filter
    if (status) {
      filter.status = status;
    }

    // ✅ Search by bill number, customer/party name or phone
    if (safeSearch) {
      filter.$and.push({
        $or: [
          {
            billNo: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            customerName: {
              $regex: safeSearch,
              $options: "i",
            },
          },
          {
            customerPhone: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        ],
      });
    }

    // ✅ List data and total count together
    const [invoices, totalInvoices] = await Promise.all([
      Invoice.find(filter)
        // ✅ Only fields required on Sales Invoice List
        .select(
          [
            "billNo",
            "invoiceDate",
            "customerName",
            "customerPhone",
            "customerId",
            "partyId",
            "totalAmount",
            "paidAmount",
            "status",
            "paymentType",
            "isOpening",
            "createdAt",
          ].join(" "),
        )
        .sort({
          createdAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      Invoice.countDocuments(filter),
    ]);

    const totalPages = Math.max(Math.ceil(totalInvoices / limit), 1);

    return res.json({
      invoices,

      pagination: {
        page,
        limit,
        totalInvoices,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
    });
  } catch (error) {
    console.error("Failed to fetch invoices:", error);

    return res.status(500).json({
      message: "Failed to fetch invoices",
      error: error.message,
    });
  }
};

// ✅ Get Single Invoice
exports.getInvoiceById = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    }).lean();

    if (!invoice)
      return res.status(404).json({
        message: "Invoice not found",
      });

    invoice.attachments = formatAttachments(invoice);
    invoice.attachmentFullUrl = invoice.attachments[0]?.fullUrl || "";

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ message: "Error fetching invoice", error });
  }
};

// ✅ Delete Invoice (Soft delete invoice + journal)
exports.deleteInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: { $ne: true },
    });

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const beforeDelete = {
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      invoiceDate: invoice.invoiceDate,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      status: invoice.status,
      itemCount: invoice.items?.length || 0,
      isOpening: invoice.isOpening,
    };

    invoice.isDeleted = true;
    await invoice.save();

    const attachmentsToDelete = formatAttachments(invoice);

    for (const att of attachmentsToDelete) {
      if (att.key) {
        await deleteFile(att.key);
      }
    }

    if (!invoice.isOpening) {
      await deleteTransactionsByReference({
        referenceId: invoice._id,
        invoiceModel: "Invoice",
        userId,
      });
    }

    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    if (invoice.accountId) {
      await recalculateAccountBalance(invoice.accountId);
    }

    await logActivity({
      req,
      action: "delete",
      module: "sales",
      entityType: "Invoice",
      entityId: invoice._id,
      title: `Sale Invoice ${invoice.billNo}`,
      description: `${invoice.customerName} کی Sale Invoice Delete کی گئی`,
      billNo: invoice.billNo,
      before: beforeDelete,
      after: {
        isDeleted: true,
      },
    });

    return res.json({
      message: "Invoice and related journal deleted successfully",
    });
  } catch (error) {
    console.error("Invoice Delete Error:", error);

    return res.status(500).json({
      message: "Invoice deletion failed",
      error: error.message,
    });
  }
};

// ✅ Update Invoice - Safe DateTime Version
exports.updateInvoice = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
    });

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const beforeUpdate = {
      customerName: invoice.customerName,
      customerPhone: invoice.customerPhone,
      invoiceDate: invoice.invoiceDate,
      invoiceTime: invoice.invoiceTime,
      dueDate: invoice.dueDate,
      totalAmount: invoice.totalAmount,
      subTotal: invoice.subTotal,
      discountAmount: invoice.discountAmount,
      paidAmount: invoice.paidAmount,
      status: invoice.status,
      paymentType: invoice.paymentType,
      accountId: invoice.accountId,
      notes: invoice.notes,
      itemCount: invoice.items?.length || 0,
      isOpening: invoice.isOpening,
    };

    const {
      customerName,
      customerPhone,
      by,
      invoiceDate,
      invoiceTime,
      dueDate,
      totalAmount,
      subTotal,
      discountAmount,
      paidAmount,
      notes,
      paymentType,
      accountId,
      isOpening,
      partyId,
    } = req.body;

    const items =
      typeof req.body.items === "string"
        ? JSON.parse(req.body.items)
        : req.body.items;

    // ✅ Normal invoice needs items
    if (
      (!isOpening || isOpening === "false") &&
      (!items || items.length === 0)
    ) {
      return res.status(400).json({
        message: "Invoice items are required",
      });
    }

    let currentAttachments = formatAttachments(invoice).map((a) => ({
      key: a.key,
      type: a.type,
      size: a.size,
      originalName: a.originalName,
    }));

    let keepAttachmentKeys = null;

    if (req.body.keepAttachmentKeys) {
      try {
        keepAttachmentKeys = JSON.parse(req.body.keepAttachmentKeys);
      } catch (err) {
        keepAttachmentKeys = null;
      }
    }

    if (Array.isArray(keepAttachmentKeys)) {
      const removedAttachments = currentAttachments.filter(
        (att) => !keepAttachmentKeys.includes(att.key),
      );

      for (const att of removedAttachments) {
        await deleteFile(att.key);
      }

      currentAttachments = currentAttachments.filter((att) =>
        keepAttachmentKeys.includes(att.key),
      );
    }

    const newAttachments = await uploadInvoiceFiles(req.files, userId);

    if (currentAttachments.length + newAttachments.length > 3) {
      for (const att of newAttachments) {
        await deleteFile(att.key);
      }

      return res.status(400).json({
        message: "Maximum 3 attachments allowed",
      });
    }
    const finalAttachments = [...currentAttachments, ...newAttachments];

    if (!invoice.isOpening) {
      await deleteTransactionsByReference({
        referenceId: invoice._id,
        invoiceModel: "Invoice",
        userId,
      });
    }
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

    // ✅ Historical Snapshot Items
    const snapshotItems = [];

    for (let item of items) {
      const product = await Product.findById(item.productId);

      const quantity = Number(item.quantity || 0);

      const salePrice = Number(item.price || 0);

      // ✅ Historical cost at update time
      const costPrice = Number(product?.unitCost || 0);

      // ✅ Item Profit
      const profit = (salePrice - costPrice) * quantity;

      // ✅ Margin %
      const margin =
        salePrice > 0
          ? Number((((salePrice - costPrice) / salePrice) * 100).toFixed(2))
          : 0;

      snapshotItems.push({
        ...item,
        costPrice,
        profit,
        margin,
      });
    }

    // ✅ Save snapshot items
    invoice.items = snapshotItems;

    invoice.totalAmount = Number(totalAmount);
    invoice.subTotal = Number(subTotal || totalAmount);
    invoice.discountAmount = Number(discountAmount || 0);
    invoice.paidAmount =
      paidAmount !== undefined ? Number(paidAmount) : invoice.paidAmount;
    invoice.notes = notes;
    invoice.paymentType = paymentType;
    invoice.accountId = accountId;
    invoice.isOpening = isOpening || false;

    const finalPaid = invoice.paidAmount;

    invoice.status =
      finalPaid >= totalAmount ? "Paid" : finalPaid > 0 ? "Partial" : "Unpaid";

    invoice.attachments = finalAttachments;

    invoice.attachmentUrl = finalAttachments[0]?.key || "";
    invoice.attachmentType = finalAttachments[0]?.type || "";
    invoice.attachmentSize = finalAttachments[0]?.size || 0;
    invoice.attachmentOriginalName = finalAttachments[0]?.originalName || "";

    // ✅ Skip stock for opening invoice
    if (!isOpening || isOpening === "false") {
      for (let item of snapshotItems) {
        await createInventoryEntry({
          productId: item.productId,
          type: "OUT",
          quantity: item.quantity,
          note: `Updated Sale Invoice #${invoice.billNo}`,
          invoiceId: invoice._id,
          invoiceModel: "Invoice",
          userId: userId,

          // ✅ Historical inventory rate
          rate: Number(item.costPrice || 0),
        });
      }
    }

    const oldEntries = await JournalEntry.find({
      $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
      isDeleted: false,
    });

    // ✅ Remove old journal entries
    await JournalEntry.updateMany(
      {
        $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
        },
      },
    );

    // 🧮 COGS calculate using historical snapshot
    let totalCogs = 0;

    if (!isOpening || isOpening === "false") {
      for (let item of snapshotItems) {
        totalCogs += Number(item.costPrice || 0) * Number(item.quantity || 0);
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

    let customer = null;
    let party = null;
    let counterPartyAccountId = null;

    if (partyId) {
      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party) {
        return res.status(404).json({ message: "Party not found" });
      }

      counterPartyAccountId = party.account;
    } else {
      customer = await Customer.findOne({
        name: customerName,
        createdBy: userId,
      });

      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      counterPartyAccountId = customer.account;
    }

    // ✅ update customer/party link
    invoice.customerId = customer?._id || null;
    invoice.partyId = party?._id || null;
    await invoice.save();
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

    if (customer || party) {
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
        description:
          Number(discountAmount || 0) > 0
            ? `Updated Sale Invoice (Disc: ${discountAmount})`
            : "Updated Sale Invoice",
        sourceType: isOpening ? "opening_sale_invoice" : "sale_invoice",
        originModule: "sale_invoice",
        referenceId: invoice._id,
        invoiceId: invoice._id,
        billNo: invoice.billNo,
        createdBy: userId,

        customerId: customer?._id || null,
        partyId: party?._id || null,

        lines: isOpening
          ? [
              // ✅ Opening Balance Entry
              {
                account: new mongoose.Types.ObjectId(counterPartyAccountId),
                type: "debit",
                amount: totalAmount,
              },

              {
                account: new mongoose.Types.ObjectId(
                  (
                    await Account.findOne({
                      code: "OPENING_BALANCE",
                      userId,
                    })
                  )._id,
                ),
                type: "credit",
                amount: totalAmount,
              },
            ]
          : [
              // 👤 Customer debit

              {
                account: new mongoose.Types.ObjectId(counterPartyAccountId),
                type: "debit",
                amount: Number(subTotal || totalAmount),
              },

              // 💰 Sales credit
              {
                account: new mongoose.Types.ObjectId(incomeAccount._id),
                type: "credit",
                amount: Number(subTotal || totalAmount),
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

      if (
        (!isOpening || isOpening === "false") &&
        Number(discountAmount || 0) > 0
      ) {
        await createDiscountEntry({
          userId,
          referenceId: invoice._id,
          billNo: invoice.billNo,
          customerAccountId: counterPartyAccountId,
          discountAmount: Number(discountAmount),
          description: "Updated Sale Invoice Discount",
          originModule: "sale_invoice",
          customerId: customer?._id || null,
          partyId: party?._id || null,
        });
      }

      const allEntries = await JournalEntry.find({
        $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
      });

      if ((!isOpening || isOpening === "false") && paidAmount > 0) {
        await createPaymentEntry({
          userId: userId,
          referenceId: invoice._id,
          sourceType: "receive_payment",
          originModule: "sale_invoice",
          billNo: invoice.billNo,
          accountId,
          counterPartyAccountId,
          amount: paidAmount,
          paymentType,
          description: "Sale Invoice Payment",
          customerId: customer?._id || null,
          partyId: party?._id || null,
        });
      }

      invoice.journalEntryId = journal._id;

      if (!isOpening || isOpening === "false") {
        await recalculateAccountBalance(finalInventoryAccount._id);
        await recalculateAccountBalance(finalCogsAccount._id);
      }

      if (accountId) {
        await recalculateAccountBalance(accountId);
      }
    }

    await logActivity({
      req,
      action: "update",
      module: "sales",
      entityType: "Invoice",
      entityId: invoice._id,
      title: `Sale Invoice ${invoice.billNo}`,
      description: `${invoice.customerName} کی Sale Invoice Update کی گئی`,
      billNo: invoice.billNo,
      before: beforeUpdate,
      after: {
        customerName: invoice.customerName,
        customerPhone: invoice.customerPhone,
        invoiceDate: invoice.invoiceDate,
        invoiceTime: invoice.invoiceTime,
        dueDate: invoice.dueDate,
        totalAmount: invoice.totalAmount,
        subTotal: invoice.subTotal,
        discountAmount: invoice.discountAmount,
        paidAmount: invoice.paidAmount,
        status: invoice.status,
        paymentType: invoice.paymentType,
        accountId: invoice.accountId,
        notes: invoice.notes,
        itemCount: invoice.items?.length || 0,
        isOpening: invoice.isOpening,
      },
    });

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

    const payAmount = Number(amount || 0);

    if (payAmount <= 0) {
      return res.status(400).json({ message: "Invalid payment amount" });
    }

    if (!accountId) {
      return res.status(400).json({ message: "Payment account required" });
    }

    const invoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: { $ne: true },
    });

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    let customer = null;
    let party = null;
    let counterPartyAccountId = null;

    if (invoice.partyId) {
      party = await Party.findOne({
        _id: invoice.partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party || !party.account) {
        return res.status(404).json({ message: "Party account not found" });
      }

      counterPartyAccountId = party.account;
    } else {
      customer = await Customer.findOne({
        _id: invoice.customerId,
        createdBy: userId,
      });

      if (!customer || !customer.account) {
        return res.status(404).json({ message: "Customer account not found" });
      }

      counterPartyAccountId = customer.account;
    }

    invoice.paidAmount = Number(invoice.paidAmount || 0) + payAmount;

    invoice.status =
      invoice.paidAmount >= invoice.totalAmount
        ? "Paid"
        : invoice.paidAmount > 0
          ? "Partial"
          : "Unpaid";

    await invoice.save();

    await createPaymentEntry({
      userId,
      referenceId: invoice._id,
      sourceType: "receive_payment",
      originModule: "sale_invoice",
      billNo: invoice.billNo,
      accountId,
      counterPartyAccountId,
      amount: payAmount,
      paymentType,
      description: `Additional payment for Invoice ${invoice.billNo}`,
      customerId: customer?._id || null,
      partyId: party?._id || null,
    });

    await recalculateAccountBalance(counterPartyAccountId);
    await recalculateAccountBalance(accountId);

    await logActivity({
      req,
      action: "update",
      module: "sales",
      entityType: "Invoice",
      entityId: invoice._id,
      title: `Invoice Payment ${invoice.billNo}`,
      description: `Sale Invoice ${invoice.billNo} میں مزید Payment شامل کی گئی`,
      billNo: invoice.billNo,
      after: {
        paymentAdded: payAmount,
        paymentType,
        accountId,
        totalPaidAmount: invoice.paidAmount,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
      },
    });

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
