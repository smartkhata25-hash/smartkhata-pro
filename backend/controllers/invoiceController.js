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

exports.createInvoice = async (req, res) => {
  const session = await mongoose.startSession();

  let uploadedAttachments = [];
  let savedInvoice = null;
  let creditLimitExceeded = false;

  try {
    const rawUserId = req.user?.id || req.userId;

    if (!rawUserId || !mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(401).json({
        message: "Invalid or missing user.",
      });
    }

    const userId = new mongoose.Types.ObjectId(rawUserId);

    const {
      customerName,
      customerPhone,
      customerId,
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

    const openingInvoice = isOpening === true || isOpening === "true";

    const numericTotalAmount = Number(totalAmount || 0);
    const numericSubTotal = Number(subTotal || totalAmount || 0);
    const numericDiscountAmount = Number(discountAmount || 0);
    const numericPaidAmount = Number(paidAmount || 0);

    if (!Number.isFinite(numericTotalAmount) || numericTotalAmount < 0) {
      return res.status(400).json({
        message: "Invalid invoice total amount.",
      });
    }

    if (!Number.isFinite(numericSubTotal) || numericSubTotal < 0) {
      return res.status(400).json({
        message: "Invalid invoice subtotal.",
      });
    }

    if (!Number.isFinite(numericDiscountAmount) || numericDiscountAmount < 0) {
      return res.status(400).json({
        message: "Invalid discount amount.",
      });
    }

    if (!Number.isFinite(numericPaidAmount) || numericPaidAmount < 0) {
      return res.status(400).json({
        message: "Invalid paid amount.",
      });
    }

    if (!customerName?.trim()) {
      return res.status(400).json({
        message: "Customer name is required.",
      });
    }

    const parsedInvoiceDate = new Date(invoiceDate);

    if (Number.isNaN(parsedInvoiceDate.getTime())) {
      return res.status(400).json({
        message: "Invalid invoice date.",
      });
    }

    let items = [];

    try {
      items =
        typeof req.body.items === "string"
          ? JSON.parse(req.body.items)
          : req.body.items;
    } catch (err) {
      return res.status(400).json({
        message: "Invalid invoice items.",
      });
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    if (!openingInvoice && items.length === 0) {
      return res.status(400).json({
        message: "Invoice items are required.",
      });
    }

    if (numericPaidAmount > 0) {
      if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
        return res.status(400).json({
          message: "Valid payment account is required for paid invoices.",
        });
      }

      const paymentAccount = await Account.findOne({
        _id: accountId,
        userId,
      }).lean();

      if (!paymentAccount) {
        return res.status(400).json({
          message: "Payment account not found.",
        });
      }
    }

    let customer = null;
    let party = null;
    let counterPartyAccountId = null;

    if (partyId) {
      if (!mongoose.Types.ObjectId.isValid(partyId)) {
        return res.status(400).json({
          message: "Invalid party.",
        });
      }

      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party || !party.account) {
        return res.status(404).json({
          message: "Party or party account not found.",
        });
      }

      counterPartyAccountId = party.account;
    } else {
      if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        customer = await Customer.findOne({
          _id: customerId,
          createdBy: userId,
        });
      }

      if (!customer) {
        customer = await Customer.findOne({
          name: customerName.trim(),
          createdBy: userId,
        });
      }

      if (!customer || !customer.account) {
        return res.status(404).json({
          message: "Customer or customer account not found.",
        });
      }

      counterPartyAccountId = customer.account;
    }

    if (!openingInvoice && customer?.creditLimit > 0) {
      const currentBalance = await getCustomerBalanceFromJournal(
        customer._id,
        userId,
      );

      if (
        Number(currentBalance || 0) + numericTotalAmount >
        Number(customer.creditLimit)
      ) {
        creditLimitExceeded = true;
      }
    }

    const snapshotItems = [];

    if (!openingInvoice) {
      for (const item of items) {
        if (
          !item?.productId ||
          !mongoose.Types.ObjectId.isValid(item.productId)
        ) {
          return res.status(400).json({
            message: "Invalid product in invoice.",
          });
        }

        const quantity = Number(item.quantity || 0);
        const salePrice = Number(item.price || 0);

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(salePrice) ||
          salePrice <= 0
        ) {
          return res.status(400).json({
            message: "Invalid product quantity or price.",
          });
        }

        const product = await Product.findById(item.productId);

        if (!product) {
          return res.status(404).json({
            message: "Invoice product not found.",
          });
        }

        const productOwner =
          product.userId || product.createdBy || product.ownerId || null;

        if (productOwner && productOwner.toString() !== userId.toString()) {
          return res.status(403).json({
            message: "Invalid product ownership.",
          });
        }

        const costPrice = Number(product.unitCost || 0);
        const itemTotal = quantity * salePrice;
        const profit = (salePrice - costPrice) * quantity;

        const margin =
          salePrice > 0
            ? Number((((salePrice - costPrice) / salePrice) * 100).toFixed(2))
            : 0;

        snapshotItems.push({
          ...item,
          productId: product._id,
          quantity,
          price: salePrice,
          total: itemTotal,
          costPrice,
          profit,
          margin,
        });
      }
    }

    uploadedAttachments = await uploadInvoiceFiles(req.files, userId);

    await session.withTransaction(async () => {
      /*
       * REAL ATOMIC COUNTER
       */
      const counter = await Counter.findOneAndUpdate(
        {
          type: "sale_invoice",
          userId,
        },
        {
          $inc: {
            seq: 1,
          },
          $setOnInsert: {
            type: "sale_invoice",
            userId,
          },
        },
        {
          new: true,
          upsert: true,
          session,
          setDefaultsOnInsert: true,
        },
      );

      if (!counter) {
        throw new Error("Unable to generate invoice number.");
      }

      const billNo = counter.seq.toString();

      let status = "Unpaid";

      if (numericPaidAmount >= numericTotalAmount) {
        status = "Paid";
      } else if (numericPaidAmount > 0) {
        status = "Partial";
      }

      let incomeAccount = null;
      let finalInventoryAccount = null;
      let finalCogsAccount = null;
      let openingBalanceAccount = null;

      if (openingInvoice) {
        openingBalanceAccount = await Account.findOne({
          code: "OPENING_BALANCE",
          userId,
        }).session(session);

        if (!openingBalanceAccount) {
          throw new Error(
            "Opening Balance account not found. Please repair base accounts.",
          );
        }
      } else {
        incomeAccount = await Account.findOne({
          name: "sales",
          type: "Income",
          userId,
        }).session(session);

        if (!incomeAccount) {
          const createdIncomeAccounts = await Account.create(
            [
              {
                userId,
                name: "sales",
                type: "Income",
                normalBalance: "credit",
                code: "INC-SALES",
                balance: 0,
                openingBalance: 0,
                category: "other",
              },
            ],
            { session },
          );

          incomeAccount = createdIncomeAccounts[0];
        }

        finalInventoryAccount = await Account.findOne({
          code: "INVENTORY",
          userId,
        }).session(session);

        if (!finalInventoryAccount) {
          const createdInventoryAccounts = await Account.create(
            [
              {
                userId,
                name: "inventory",
                type: "Asset",
                normalBalance: "debit",
                category: "other",
                code: "INVENTORY",
                isSystem: true,
              },
            ],
            { session },
          );

          finalInventoryAccount = createdInventoryAccounts[0];
        }

        finalCogsAccount = await Account.findOne({
          code: "COGS",
          userId,
        }).session(session);

        if (!finalCogsAccount) {
          const createdCogsAccounts = await Account.create(
            [
              {
                userId,
                name: "cogs",
                type: "Expense",
                normalBalance: "debit",
                category: "other",
                code: "COGS",
                isSystem: true,
              },
            ],
            { session },
          );

          finalCogsAccount = createdCogsAccounts[0];
        }
      }

      const invoice = new Invoice({
        billNo,
        customerName: customerName.trim(),
        customerPhone,
        by,
        invoiceDate: parsedInvoiceDate,
        invoiceTime,
        dueDate,

        items: snapshotItems,

        totalAmount: numericTotalAmount,
        subTotal: numericSubTotal,
        discountAmount: numericDiscountAmount,
        paidAmount: numericPaidAmount,

        status,
        notes,
        paymentType: numericPaidAmount > 0 ? paymentType : "credit",

        accountId: numericPaidAmount > 0 ? accountId : null,

        isOpening: openingInvoice,

        createdBy: userId,

        customerId: customer?._id || null,
        partyId: party?._id || null,

        attachments: uploadedAttachments,

        attachmentUrl: uploadedAttachments[0]?.key || "",
        attachmentType: uploadedAttachments[0]?.type || "",
        attachmentSize: uploadedAttachments[0]?.size || 0,
        attachmentOriginalName: uploadedAttachments[0]?.originalName || "",
      });

      savedInvoice = await invoice.save({ session });

      /*
       * STOCK
       */
      if (!openingInvoice) {
        for (const item of snapshotItems) {
          await createInventoryEntry({
            productId: item.productId,
            type: "OUT",
            quantity: item.quantity,
            note: `Sale Invoice #${billNo}`,
            invoiceId: savedInvoice._id,
            invoiceModel: "Invoice",
            userId,
            rate: Number(item.costPrice || 0),

            session,
          });
        }
      }

      let invoiceDateTime = new Date(parsedInvoiceDate);

      if (invoiceTime) {
        const combined = new Date(`${invoiceDate}T${invoiceTime}`);

        if (!Number.isNaN(combined.getTime())) {
          invoiceDateTime = combined;
        }
      }

      let totalCogs = 0;

      if (!openingInvoice) {
        totalCogs = snapshotItems.reduce(
          (sum, item) =>
            sum + Number(item.costPrice || 0) * Number(item.quantity || 0),
          0,
        );
      }

      const journalLines = openingInvoice
        ? [
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: numericTotalAmount,
            },
            {
              account: new mongoose.Types.ObjectId(openingBalanceAccount._id),
              type: "credit",
              amount: numericTotalAmount,
            },
          ]
        : [
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: numericSubTotal,
            },
            {
              account: new mongoose.Types.ObjectId(incomeAccount._id),
              type: "credit",
              amount: numericSubTotal,
            },
            {
              account: new mongoose.Types.ObjectId(finalCogsAccount._id),
              type: "debit",
              amount: totalCogs,
            },
            {
              account: new mongoose.Types.ObjectId(finalInventoryAccount._id),
              type: "credit",
              amount: totalCogs,
            },
          ];

      const journal = new JournalEntry({
        date: invoiceDateTime,
        time: invoiceTime || "",

        description:
          numericDiscountAmount > 0
            ? `${notes || "Sale Invoice"} (Disc: ${numericDiscountAmount})`
            : notes || "Sale Invoice",

        sourceType: openingInvoice ? "opening_sale_invoice" : "sale_invoice",

        originModule: "sale_invoice",

        referenceId: savedInvoice._id,
        invoiceId: savedInvoice._id,
        billNo,

        createdBy: userId,

        customerId: customer?._id || null,
        partyId: party?._id || null,

        attachmentUrl: savedInvoice.attachmentUrl || "",
        attachmentType: savedInvoice.attachmentType || "",

        lines: journalLines,
      });

      await journal.save({ session });

      savedInvoice.journalEntryId = journal._id;
      await savedInvoice.save({ session });

      if (!openingInvoice && numericDiscountAmount > 0) {
        await createDiscountEntry({
          userId,
          referenceId: savedInvoice._id,
          billNo: savedInvoice.billNo,
          customerAccountId: counterPartyAccountId,
          discountAmount: numericDiscountAmount,
          description: "Sale Invoice Discount",
          originModule: "sale_invoice",
          customerId: customer?._id || null,
          partyId: party?._id || null,

          session,
        });
      }

      if (!openingInvoice && numericPaidAmount > 0) {
        await createPaymentEntry({
          userId,
          referenceId: savedInvoice._id,
          sourceType: "receive_payment",
          originModule: "sale_invoice",
          billNo: savedInvoice.billNo,
          accountId,
          counterPartyAccountId,
          amount: numericPaidAmount,
          paymentType,
          description: "Sale Invoice Payment",
          customerId: customer?._id || null,
          partyId: party?._id || null,

          session,
        });
      }
    });

    if (savedInvoice) {
      const accountsToRecalculate = new Set();

      if (counterPartyAccountId) {
        accountsToRecalculate.add(counterPartyAccountId.toString());
      }

      if (accountId && numericPaidAmount > 0) {
        accountsToRecalculate.add(accountId.toString());
      }

      const inventoryAccount = await Account.findOne({
        code: "INVENTORY",
        userId,
      }).select("_id");

      const cogsAccount = await Account.findOne({
        code: "COGS",
        userId,
      }).select("_id");

      const salesAccount = await Account.findOne({
        name: "sales",
        type: "Income",
        userId,
      }).select("_id");

      const openingAccount = await Account.findOne({
        code: "OPENING_BALANCE",
        userId,
      }).select("_id");

      if (inventoryAccount?._id && !openingInvoice) {
        accountsToRecalculate.add(inventoryAccount._id.toString());
      }

      if (cogsAccount?._id && !openingInvoice) {
        accountsToRecalculate.add(cogsAccount._id.toString());
      }

      if (salesAccount?._id && !openingInvoice) {
        accountsToRecalculate.add(salesAccount._id.toString());
      }

      if (openingAccount?._id && openingInvoice) {
        accountsToRecalculate.add(openingAccount._id.toString());
      }

      for (const accId of accountsToRecalculate) {
        try {
          await recalculateAccountBalance(accId);
        } catch (balanceError) {
          console.error(
            "Balance recalculation failed:",
            accId,
            balanceError.message,
          );
        }
      }
    }

    try {
      await logActivity({
        req,
        action: "create",
        module: "sales",
        entityType: "Invoice",
        entityId: savedInvoice._id,
        title: `Sale Invoice ${savedInvoice.billNo}`,
        description: `${savedInvoice.customerName} کی Sale Invoice بنائی گئی`,
        billNo: savedInvoice.billNo,

        after: {
          customerName: savedInvoice.customerName,
          customerPhone: savedInvoice.customerPhone,
          invoiceDate: savedInvoice.invoiceDate,
          totalAmount: savedInvoice.totalAmount,
          paidAmount: savedInvoice.paidAmount,
          status: savedInvoice.status,
          itemCount: savedInvoice.items?.length || 0,
          isOpening: savedInvoice.isOpening,
        },
      });
    } catch (logError) {
      console.error("Activity log failed:", logError.message);
    }

    return res.status(201).json({
      invoice: savedInvoice,
      creditLimitExceeded,
    });
  } catch (error) {
    if (uploadedAttachments.length > 0) {
      for (const attachment of uploadedAttachments) {
        try {
          if (attachment.key) {
            await deleteFile(attachment.key);
          }
        } catch (cleanupError) {
          console.error("Attachment cleanup failed:", cleanupError.message);
        }
      }
    }

    if (error?.code === 11000) {
      return res.status(400).json({
        message: "Bill number already exists.",
      });
    }

    console.error("Invoice save error:", error);

    return res.status(500).json({
      message: "Invoice creation failed",
      error: error.message,
    });
  } finally {
    await session.endSession();
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
      isDeleted: { $ne: true },
    })
      .populate({
        path: "items.productId",
        select: "name description uom unit unitCost salePrice",
      })
      .lean();

    if (!invoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const attachments = formatAttachments(invoice);

    return res.json({
      ...invoice,
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
    });
  } catch (error) {
    console.error("Get Invoice By ID Error:", error);

    return res.status(500).json({
      message: "Error fetching invoice",
      error: error.message,
    });
  }
};

exports.deleteInvoice = async (req, res) => {
  const session = await mongoose.startSession();

  let deletedInvoice = null;
  let attachmentsToDelete = [];
  const accountsToRecalculate = new Set();

  try {
    const rawUserId = req.user?.id || req.userId;

    if (!rawUserId || !mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(401).json({
        message: "Invalid or missing user.",
      });
    }

    const userId = new mongoose.Types.ObjectId(rawUserId);

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

    attachmentsToDelete = formatAttachments(invoice);

    await session.withTransaction(async () => {
      const currentInvoice = await Invoice.findOne({
        _id: req.params.id,
        createdBy: userId,
        isDeleted: { $ne: true },
      }).session(session);

      if (!currentInvoice) {
        throw new Error("Invoice not found.");
      }

      const journalEntries = await JournalEntry.find({
        $or: [
          { referenceId: currentInvoice._id },
          { invoiceId: currentInvoice._id },
        ],
        isDeleted: { $ne: true },
      }).session(session);

      for (const entry of journalEntries) {
        for (const line of entry.lines || []) {
          if (line.account) {
            accountsToRecalculate.add(line.account.toString());
          }
        }
      }

      if (currentInvoice.accountId) {
        accountsToRecalculate.add(currentInvoice.accountId.toString());
      }

      if (!currentInvoice.isOpening) {
        await deleteTransactionsByReference({
          referenceId: currentInvoice._id,
          invoiceModel: "Invoice",
          userId,
          session,
        });
      }

      await JournalEntry.updateMany(
        {
          $or: [
            { referenceId: currentInvoice._id },
            { invoiceId: currentInvoice._id },
          ],
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isDeleted: true,
          },
        },
        { session },
      );

      currentInvoice.isDeleted = true;

      await currentInvoice.save({ session });

      deletedInvoice = currentInvoice;
    });

    /*
     * DB delete کامیاب ہونے کے بعد attachments delete کریں۔
     */
    for (const att of attachmentsToDelete) {
      try {
        if (att.key) {
          await deleteFile(att.key);
        }
      } catch (fileError) {
        console.error("Attachment delete failed:", fileError.message);
      }
    }

    for (const accId of accountsToRecalculate) {
      try {
        await recalculateAccountBalance(accId);
      } catch (balanceError) {
        console.error(
          "Balance recalculation failed:",
          accId,
          balanceError.message,
        );
      }
    }

    try {
      await logActivity({
        req,
        action: "delete",
        module: "sales",
        entityType: "Invoice",
        entityId: deletedInvoice._id,
        title: `Sale Invoice ${deletedInvoice.billNo}`,
        description: `${deletedInvoice.customerName} کی Sale Invoice Delete کی گئی`,
        billNo: deletedInvoice.billNo,

        before: beforeDelete,

        after: {
          isDeleted: true,
        },
      });
    } catch (logError) {
      console.error("Activity log failed:", logError.message);
    }

    return res.json({
      message: "Invoice and related journal deleted successfully",
    });
  } catch (error) {
    console.error("Invoice Delete Error:", error);

    return res.status(500).json({
      message: "Invoice deletion failed",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

exports.updateInvoice = async (req, res) => {
  const session = await mongoose.startSession();

  let newUploadedAttachments = [];
  let removedAttachments = [];
  let updatedInvoice = null;
  let accountsToRecalculate = new Set();

  try {
    const rawUserId = req.user?.id || req.userId;

    if (!rawUserId || !mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(401).json({
        message: "Invalid or missing user.",
      });
    }

    const userId = new mongoose.Types.ObjectId(rawUserId);

    const existingInvoice = await Invoice.findOne({
      _id: req.params.id,
      createdBy: userId,
      isDeleted: { $ne: true },
    });

    if (!existingInvoice) {
      return res.status(404).json({
        message: "Invoice not found",
      });
    }

    const beforeUpdate = {
      customerName: existingInvoice.customerName,
      customerPhone: existingInvoice.customerPhone,
      invoiceDate: existingInvoice.invoiceDate,
      invoiceTime: existingInvoice.invoiceTime,
      dueDate: existingInvoice.dueDate,
      totalAmount: existingInvoice.totalAmount,
      subTotal: existingInvoice.subTotal,
      discountAmount: existingInvoice.discountAmount,
      paidAmount: existingInvoice.paidAmount,
      status: existingInvoice.status,
      paymentType: existingInvoice.paymentType,
      accountId: existingInvoice.accountId,
      notes: existingInvoice.notes,
      itemCount: existingInvoice.items?.length || 0,
      isOpening: existingInvoice.isOpening,
    };

    const {
      customerName,
      customerPhone,
      customerId,
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

    const openingInvoice = isOpening === true || isOpening === "true";

    const numericTotalAmount = Number(totalAmount || 0);
    const numericSubTotal = Number(subTotal || totalAmount || 0);
    const numericDiscountAmount = Number(discountAmount || 0);
    const numericPaidAmount = Number(paidAmount || 0);

    if (!customerName?.trim()) {
      return res.status(400).json({
        message: "Customer name is required.",
      });
    }

    if (
      !Number.isFinite(numericTotalAmount) ||
      numericTotalAmount < 0 ||
      !Number.isFinite(numericSubTotal) ||
      numericSubTotal < 0 ||
      !Number.isFinite(numericDiscountAmount) ||
      numericDiscountAmount < 0 ||
      !Number.isFinite(numericPaidAmount) ||
      numericPaidAmount < 0
    ) {
      return res.status(400).json({
        message: "Invalid invoice amounts.",
      });
    }

    const parsedInvoiceDate = new Date(invoiceDate);

    if (Number.isNaN(parsedInvoiceDate.getTime())) {
      return res.status(400).json({
        message: "Invalid invoice date.",
      });
    }

    let items = [];

    try {
      items =
        typeof req.body.items === "string"
          ? JSON.parse(req.body.items)
          : req.body.items;
    } catch (err) {
      return res.status(400).json({
        message: "Invalid invoice items.",
      });
    }

    if (!Array.isArray(items)) {
      items = [];
    }

    if (!openingInvoice && items.length === 0) {
      return res.status(400).json({
        message: "Invoice items are required.",
      });
    }

    if (numericPaidAmount > 0) {
      if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
        return res.status(400).json({
          message: "Valid payment account is required.",
        });
      }

      const paymentAccount = await Account.findOne({
        _id: accountId,
        userId,
      }).lean();

      if (!paymentAccount) {
        return res.status(400).json({
          message: "Payment account not found.",
        });
      }
    }

    let customer = null;
    let party = null;
    let counterPartyAccountId = null;

    if (partyId) {
      if (!mongoose.Types.ObjectId.isValid(partyId)) {
        return res.status(400).json({
          message: "Invalid party.",
        });
      }

      party = await Party.findOne({
        _id: partyId,
        userId,
        isDeleted: false,
        isActive: true,
      });

      if (!party || !party.account) {
        return res.status(404).json({
          message: "Party or party account not found.",
        });
      }

      counterPartyAccountId = party.account;
    } else {
      if (customerId && mongoose.Types.ObjectId.isValid(customerId)) {
        customer = await Customer.findOne({
          _id: customerId,
          createdBy: userId,
        });
      }

      if (!customer) {
        customer = await Customer.findOne({
          name: customerName.trim(),
          createdBy: userId,
        });
      }

      if (!customer || !customer.account) {
        return res.status(404).json({
          message: "Customer or customer account not found.",
        });
      }

      counterPartyAccountId = customer.account;
    }

    const snapshotItems = [];

    if (!openingInvoice) {
      for (const item of items) {
        if (
          !item?.productId ||
          !mongoose.Types.ObjectId.isValid(item.productId)
        ) {
          return res.status(400).json({
            message: "Invalid product in invoice.",
          });
        }

        const quantity = Number(item.quantity || 0);
        const salePrice = Number(item.price || 0);

        if (
          !Number.isFinite(quantity) ||
          quantity <= 0 ||
          !Number.isFinite(salePrice) ||
          salePrice <= 0
        ) {
          return res.status(400).json({
            message: "Invalid product quantity or price.",
          });
        }

        const product = await Product.findById(item.productId);

        if (!product) {
          return res.status(404).json({
            message: "Invoice product not found.",
          });
        }

        const productOwner =
          product.userId || product.createdBy || product.ownerId || null;

        if (productOwner && productOwner.toString() !== userId.toString()) {
          return res.status(403).json({
            message: "Invalid product ownership.",
          });
        }

        const costPrice = Number(product.unitCost || 0);
        const itemTotal = quantity * salePrice;
        const profit = (salePrice - costPrice) * quantity;

        const margin =
          salePrice > 0
            ? Number((((salePrice - costPrice) / salePrice) * 100).toFixed(2))
            : 0;

        snapshotItems.push({
          ...item,
          productId: product._id,
          quantity,
          price: salePrice,
          total: itemTotal,
          costPrice,
          profit,
          margin,
        });
      }
    }

    let currentAttachments = formatAttachments(existingInvoice).map((a) => ({
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
      removedAttachments = currentAttachments.filter(
        (att) => !keepAttachmentKeys.includes(att.key),
      );

      currentAttachments = currentAttachments.filter((att) =>
        keepAttachmentKeys.includes(att.key),
      );
    }

    newUploadedAttachments = await uploadInvoiceFiles(req.files, userId);

    if (currentAttachments.length + newUploadedAttachments.length > 3) {
      for (const att of newUploadedAttachments) {
        if (att.key) {
          await deleteFile(att.key);
        }
      }

      newUploadedAttachments = [];

      return res.status(400).json({
        message: "Maximum 3 attachments allowed",
      });
    }

    const finalAttachments = [...currentAttachments, ...newUploadedAttachments];

    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        createdBy: userId,
        isDeleted: { $ne: true },
      }).session(session);

      if (!invoice) {
        throw new Error("Invoice not found.");
      }

      const oldEntries = await JournalEntry.find({
        $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
        isDeleted: { $ne: true },
      }).session(session);

      for (const entry of oldEntries) {
        for (const line of entry.lines || []) {
          if (line.account) {
            accountsToRecalculate.add(line.account.toString());
          }
        }
      }

      if (invoice.accountId) {
        accountsToRecalculate.add(invoice.accountId.toString());
      }

      if (!invoice.isOpening) {
        await deleteTransactionsByReference({
          referenceId: invoice._id,
          invoiceModel: "Invoice",
          userId,
          session,
        });
      }

      await JournalEntry.updateMany(
        {
          $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
          isDeleted: { $ne: true },
        },
        {
          $set: {
            isDeleted: true,
          },
        },
        { session },
      );

      let incomeAccount = null;
      let inventoryAccount = null;
      let cogsAccount = null;
      let openingBalanceAccount = null;

      if (openingInvoice) {
        openingBalanceAccount = await Account.findOne({
          code: "OPENING_BALANCE",
          userId,
        }).session(session);

        if (!openingBalanceAccount) {
          throw new Error("Opening Balance account not found.");
        }
      } else {
        incomeAccount = await Account.findOne({
          name: "sales",
          type: "Income",
          userId,
        }).session(session);

        if (!incomeAccount) {
          const created = await Account.create(
            [
              {
                userId,
                name: "sales",
                type: "Income",
                normalBalance: "credit",
                code: "INC-SALES",
                balance: 0,
                openingBalance: 0,
                category: "other",
              },
            ],
            { session },
          );

          incomeAccount = created[0];
        }

        inventoryAccount = await Account.findOne({
          code: "INVENTORY",
          userId,
        }).session(session);

        if (!inventoryAccount) {
          const created = await Account.create(
            [
              {
                userId,
                name: "inventory",
                type: "Asset",
                normalBalance: "debit",
                category: "other",
                code: "INVENTORY",
                isSystem: true,
              },
            ],
            { session },
          );

          inventoryAccount = created[0];
        }

        cogsAccount = await Account.findOne({
          code: "COGS",
          userId,
        }).session(session);

        if (!cogsAccount) {
          const created = await Account.create(
            [
              {
                userId,
                name: "cogs",
                type: "Expense",
                normalBalance: "debit",
                category: "other",
                code: "COGS",
                isSystem: true,
              },
            ],
            { session },
          );

          cogsAccount = created[0];
        }
      }

      invoice.customerName = customerName.trim();
      invoice.customerPhone = customerPhone || "";
      invoice.by = by || "";

      invoice.invoiceDate = parsedInvoiceDate;
      invoice.invoiceTime = invoiceTime || "";
      invoice.dueDate = dueDate || null;

      invoice.items = snapshotItems;

      invoice.totalAmount = numericTotalAmount;
      invoice.subTotal = numericSubTotal;
      invoice.discountAmount = numericDiscountAmount;
      invoice.paidAmount = numericPaidAmount;

      invoice.notes = notes || "";

      invoice.paymentType = numericPaidAmount > 0 ? paymentType : "credit";

      invoice.accountId = numericPaidAmount > 0 ? accountId : null;

      invoice.isOpening = openingInvoice;

      invoice.customerId = customer?._id || null;
      invoice.partyId = party?._id || null;

      invoice.status =
        numericPaidAmount >= numericTotalAmount
          ? "Paid"
          : numericPaidAmount > 0
            ? "Partial"
            : "Unpaid";

      invoice.attachments = finalAttachments;

      invoice.attachmentUrl = finalAttachments[0]?.key || "";

      invoice.attachmentType = finalAttachments[0]?.type || "";

      invoice.attachmentSize = finalAttachments[0]?.size || 0;

      invoice.attachmentOriginalName = finalAttachments[0]?.originalName || "";

      await invoice.save({ session });

      if (!openingInvoice) {
        for (const item of snapshotItems) {
          await createInventoryEntry({
            productId: item.productId,
            type: "OUT",
            quantity: item.quantity,
            note: `Updated Sale Invoice #${invoice.billNo}`,
            invoiceId: invoice._id,
            invoiceModel: "Invoice",
            userId,
            rate: Number(item.costPrice || 0),
            session,
          });
        }
      }

      let journalDateTime = new Date(parsedInvoiceDate);

      if (invoiceTime) {
        const combined = new Date(`${invoiceDate}T${invoiceTime}`);

        if (!Number.isNaN(combined.getTime())) {
          journalDateTime = combined;
        }
      }

      const totalCogs = openingInvoice
        ? 0
        : snapshotItems.reduce(
            (sum, item) =>
              sum + Number(item.costPrice || 0) * Number(item.quantity || 0),
            0,
          );

      const lines = openingInvoice
        ? [
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: numericTotalAmount,
            },
            {
              account: new mongoose.Types.ObjectId(openingBalanceAccount._id),
              type: "credit",
              amount: numericTotalAmount,
            },
          ]
        : [
            {
              account: new mongoose.Types.ObjectId(counterPartyAccountId),
              type: "debit",
              amount: numericSubTotal,
            },
            {
              account: new mongoose.Types.ObjectId(incomeAccount._id),
              type: "credit",
              amount: numericSubTotal,
            },
            {
              account: new mongoose.Types.ObjectId(cogsAccount._id),
              type: "debit",
              amount: totalCogs,
            },
            {
              account: new mongoose.Types.ObjectId(inventoryAccount._id),
              type: "credit",
              amount: totalCogs,
            },
          ];

      const journal = new JournalEntry({
        date: journalDateTime,
        time: invoiceTime || "",

        description:
          numericDiscountAmount > 0
            ? `Updated Sale Invoice (Disc: ${numericDiscountAmount})`
            : "Updated Sale Invoice",

        sourceType: openingInvoice ? "opening_sale_invoice" : "sale_invoice",

        originModule: "sale_invoice",

        referenceId: invoice._id,
        invoiceId: invoice._id,
        billNo: invoice.billNo,

        createdBy: userId,

        customerId: customer?._id || null,
        partyId: party?._id || null,

        attachmentUrl: invoice.attachmentUrl || "",
        attachmentType: invoice.attachmentType || "",

        lines,
      });

      await journal.save({ session });

      invoice.journalEntryId = journal._id;
      await invoice.save({ session });

      for (const line of lines) {
        if (line.account) {
          accountsToRecalculate.add(line.account.toString());
        }
      }

      if (!openingInvoice && numericDiscountAmount > 0) {
        await createDiscountEntry({
          userId,
          referenceId: invoice._id,
          billNo: invoice.billNo,
          customerAccountId: counterPartyAccountId,
          discountAmount: numericDiscountAmount,
          description: "Updated Sale Invoice Discount",
          originModule: "sale_invoice",
          customerId: customer?._id || null,
          partyId: party?._id || null,
          session,
        });
      }

      if (!openingInvoice && numericPaidAmount > 0) {
        await createPaymentEntry({
          userId,
          referenceId: invoice._id,
          sourceType: "receive_payment",
          originModule: "sale_invoice",
          billNo: invoice.billNo,
          accountId,
          counterPartyAccountId,
          amount: numericPaidAmount,
          paymentType,
          description: "Sale Invoice Payment",
          customerId: customer?._id || null,
          partyId: party?._id || null,
          session,
        });

        accountsToRecalculate.add(accountId.toString());
        accountsToRecalculate.add(counterPartyAccountId.toString());
      }

      updatedInvoice = invoice;
    });

    for (const att of removedAttachments) {
      try {
        if (att.key) {
          await deleteFile(att.key);
        }
      } catch (fileError) {
        console.error("Old attachment cleanup failed:", fileError.message);
      }
    }

    for (const accId of accountsToRecalculate) {
      try {
        await recalculateAccountBalance(accId);
      } catch (balanceError) {
        console.error(
          "Balance recalculation failed:",
          accId,
          balanceError.message,
        );
      }
    }

    try {
      await logActivity({
        req,
        action: "update",
        module: "sales",
        entityType: "Invoice",
        entityId: updatedInvoice._id,
        title: `Sale Invoice ${updatedInvoice.billNo}`,
        description: `${updatedInvoice.customerName} کی Sale Invoice Update کی گئی`,
        billNo: updatedInvoice.billNo,

        before: beforeUpdate,

        after: {
          customerName: updatedInvoice.customerName,
          customerPhone: updatedInvoice.customerPhone,
          invoiceDate: updatedInvoice.invoiceDate,
          invoiceTime: updatedInvoice.invoiceTime,
          dueDate: updatedInvoice.dueDate,
          totalAmount: updatedInvoice.totalAmount,
          subTotal: updatedInvoice.subTotal,
          discountAmount: updatedInvoice.discountAmount,
          paidAmount: updatedInvoice.paidAmount,
          status: updatedInvoice.status,
          paymentType: updatedInvoice.paymentType,
          accountId: updatedInvoice.accountId,
          notes: updatedInvoice.notes,
          itemCount: updatedInvoice.items?.length || 0,
          isOpening: updatedInvoice.isOpening,
        },
      });
    } catch (logError) {
      console.error("Activity log failed:", logError.message);
    }

    return res.json(updatedInvoice);
  } catch (error) {
    for (const att of newUploadedAttachments) {
      try {
        if (att.key) {
          await deleteFile(att.key);
        }
      } catch (cleanupError) {
        console.error("New attachment cleanup failed:", cleanupError.message);
      }
    }

    console.error("Invoice update error:", error);

    return res.status(500).json({
      message: "Invoice update failed",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

// ✅ Record Additional Payment
exports.recordPayment = async (req, res) => {
  const session = await mongoose.startSession();

  let updatedInvoice = null;
  const accountsToRecalculate = new Set();

  try {
    const rawUserId = req.user?.id || req.userId;

    if (!rawUserId || !mongoose.Types.ObjectId.isValid(rawUserId)) {
      return res.status(401).json({
        message: "Invalid or missing user.",
      });
    }

    const userId = new mongoose.Types.ObjectId(rawUserId);

    const { amount, accountId, paymentType } = req.body;

    const payAmount = Number(amount || 0);

    if (!Number.isFinite(payAmount) || payAmount <= 0) {
      return res.status(400).json({
        message: "Invalid payment amount",
      });
    }

    if (!accountId || !mongoose.Types.ObjectId.isValid(accountId)) {
      return res.status(400).json({
        message: "Valid payment account required",
      });
    }

    const paymentAccount = await Account.findOne({
      _id: accountId,
      userId,
    }).lean();

    if (!paymentAccount) {
      return res.status(404).json({
        message: "Payment account not found",
      });
    }

    await session.withTransaction(async () => {
      const invoice = await Invoice.findOne({
        _id: req.params.id,
        createdBy: userId,
        isDeleted: { $ne: true },
      }).session(session);

      if (!invoice) {
        throw new Error("Invoice not found.");
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
        }).session(session);

        if (!party || !party.account) {
          throw new Error("Party account not found.");
        }

        counterPartyAccountId = party.account;
      } else {
        customer = await Customer.findOne({
          _id: invoice.customerId,
          createdBy: userId,
        }).session(session);

        if (!customer || !customer.account) {
          throw new Error("Customer account not found.");
        }

        counterPartyAccountId = customer.account;
      }

      invoice.paidAmount = Number(invoice.paidAmount || 0) + payAmount;

      invoice.status =
        invoice.paidAmount >= Number(invoice.totalAmount || 0)
          ? "Paid"
          : invoice.paidAmount > 0
            ? "Partial"
            : "Unpaid";

      await invoice.save({ session });

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
        session,
      });

      accountsToRecalculate.add(accountId.toString());
      accountsToRecalculate.add(counterPartyAccountId.toString());

      updatedInvoice = invoice;
    });

    for (const accId of accountsToRecalculate) {
      try {
        await recalculateAccountBalance(accId);
      } catch (balanceError) {
        console.error(
          "Balance recalculation failed:",
          accId,
          balanceError.message,
        );
      }
    }

    try {
      await logActivity({
        req,
        action: "update",
        module: "sales",
        entityType: "Invoice",
        entityId: updatedInvoice._id,
        title: `Invoice Payment ${updatedInvoice.billNo}`,
        description: `Sale Invoice ${updatedInvoice.billNo} میں مزید Payment شامل کی گئی`,
        billNo: updatedInvoice.billNo,

        after: {
          paymentAdded: payAmount,
          paymentType,
          accountId,
          totalPaidAmount: updatedInvoice.paidAmount,
          totalAmount: updatedInvoice.totalAmount,
          status: updatedInvoice.status,
        },
      });
    } catch (logError) {
      console.error("Activity log failed:", logError.message);
    }

    return res.json(updatedInvoice);
  } catch (error) {
    console.error("Payment update failed:", error);

    return res.status(500).json({
      message: "Payment update failed",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

// ✅ Get Invoice By Bill No
exports.getInvoiceByBillNo = async (req, res) => {
  try {
    const userId = req.user?.id || req.userId;
    const invoice = await Invoice.findOne({
      billNo: req.params.billNo,
      createdBy: userId,
      isDeleted: { $ne: true },
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

    const filters = {
      createdBy: userId,
      isDeleted: { $ne: true },
    };
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
      return res.status(400).json({
        message: "billNo and direction required",
      });
    }

    if (!["next", "previous"].includes(direction)) {
      return res.status(400).json({
        message: "Invalid navigation direction",
      });
    }

    const numericBillNo = Number(billNo);

    if (!Number.isFinite(numericBillNo)) {
      return res.status(400).json({
        message: "Invalid bill number",
      });
    }

    const comparison =
      direction === "next" ? { $gt: numericBillNo } : { $lt: numericBillNo };

    const sortDirection = direction === "next" ? 1 : -1;

    const invoices = await Invoice.aggregate([
      {
        $match: {
          createdBy: new mongoose.Types.ObjectId(userId),
          isDeleted: { $ne: true },
        },
      },
      {
        $addFields: {
          numericBillNo: {
            $convert: {
              input: "$billNo",
              to: "long",
              onError: null,
              onNull: null,
            },
          },
        },
      },
      {
        $match: {
          numericBillNo: comparison,
        },
      },
      {
        $sort: {
          numericBillNo: sortDirection,
        },
      },
      {
        $limit: 1,
      },
    ]);

    const invoice = invoices[0];

    if (!invoice) {
      return res.status(404).json({
        message: "No more invoices",
      });
    }

    return res.json(invoice);
  } catch (error) {
    console.error("Navigation error:", error);

    return res.status(500).json({
      message: "Navigation failed",
      error: error.message,
    });
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
