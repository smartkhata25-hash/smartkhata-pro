const PurchaseInvoice = require("../models/purchaseInvoice");

const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const {
  createInventoryEntry,
  deleteTransactionsByReference,
} = require("../utils/stockHelper");

const Product = require("../models/Product");
const Account = require("../models/Account");
const asyncHandler = require("express-async-handler");
const { logActivity } = require("../utils/activityLogger");

const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const {
  uploadFile,
  deleteFile,
  getFileUrl,
} = require("../services/r2FileService");
const {
  createPaymentEntry,
  createDiscountEntry,
} = require("../utils/paymentService");
const canPayPurchaseBill = (req) => {
  if (req.user?.accountRole === "owner") {
    return true;
  }

  return Array.isArray(req.user?.permissions)
    ? req.user.permissions.includes("purchases.pay_bill")
    : false;
};

function formatPurchaseAttachments(invoice) {
  if (invoice.attachments?.length > 0) {
    return invoice.attachments.map((att) => {
      const plainAtt = att.toObject ? att.toObject() : att;

      return {
        ...plainAtt,
        fullUrl: getFileUrl(plainAtt.key),
      };
    });
  }

  if (invoice.attachment) {
    return [
      {
        key: invoice.attachment,
        type: invoice.attachmentType || "",
        size: 0,
        originalName: "",
        fullUrl: invoice.attachment.startsWith("users/")
          ? getFileUrl(invoice.attachment)
          : `/${invoice.attachment}`,
      },
    ];
  }

  return [];
}

async function uploadPurchaseFiles(files, userId) {
  const attachments = [];

  if (!files || files.length === 0) return attachments;

  if (files.length > 3) {
    throw new Error("Maximum 3 attachments allowed");
  }

  for (const file of files) {
    const uploaded = await uploadFile({
      buffer: file.buffer,
      userId,
      moduleName: "purchase-invoices",
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    attachments.push({
      key: uploaded.key,
      type: uploaded.mimeType,
      size: uploaded.size,
      originalName: uploaded.originalName,
    });
  }

  return attachments;
}

async function deletePurchaseAttachment(att) {
  if (!att?.key) return;

  if (att.key.startsWith("users/")) {
    await deleteFile(att.key);
    return;
  }

  if (att.key.startsWith("uploads/")) {
    try {
      if (fs.existsSync(att.key)) {
        fs.unlinkSync(att.key);
      }
    } catch (err) {
      console.warn("Old local purchase attachment delete failed:", err.message);
    }
  }
}

// ✅ Create Purchase Invoice
const addPurchaseInvoice = asyncHandler(async (req, res) => {
  const {
    billNo,
    invoiceDate,
    invoiceTime,
    supplierName,
    supplierPhone,
    totalAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount,
    paymentType,
    accountId,
    items,
    partyId,
    isOpening,
  } = req.body;

  // ✅ STATUS CALCULATION (ADD HERE)
  let status = "Unpaid";
  if (paidAmount >= grandTotal) status = "Paid";
  else if (paidAmount > 0) status = "Partial";

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  parsedItems =
    isOpening === true || isOpening === "true"
      ? []
      : parsedItems.filter((i) => i.productId && i.quantity > 0 && i.price > 0);

  const userId = req.user?.id || req.userId;

  if (Number(paidAmount || 0) > 0 && !canPayPurchaseBill(req)) {
    return res.status(403).json({
      message: "You do not have permission to pay purchase bills",
    });
  }

  const attachments = await uploadPurchaseFiles(req.files, userId);

  const attachmentPath = attachments[0]?.key || "";
  const attachmentType = attachments[0]?.type || "";

  let supplier = null;
  let party = null;
  let counterPartyAccountId = null;

  if (partyId) {
    party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (!party || !party.account) {
      return res.status(400).json({ message: "Party account not linked" });
    }

    counterPartyAccountId = party.account;
  } else {
    supplier = await Supplier.findOne({
      name: {
        $regex: new RegExp(`^${supplierName.trim()}$`, "i"),
      },
      userId,
      isDeleted: false,
    });

    if (!supplier) {
      const account = await Account.create({
        name: supplierName,
        type: "Liability",
        normalBalance: "credit",
        category: "supplier",
        userId,
      });

      supplier = await Supplier.create({
        name: supplierName,
        phone: supplierPhone,
        account: account._id,
        userId,
      });
    }

    if (!supplier.account) {
      return res.status(400).json({ message: "Supplier account not linked" });
    }

    counterPartyAccountId = supplier.account;
  }

  // 💾 Save invoice
  const parsedInvoiceDate = new Date(`${invoiceDate}T12:00:00`);

  const invoice = await PurchaseInvoice.create({
    billNo,
    invoiceDate: parsedInvoiceDate,

    invoiceTime,
    supplier: supplier?._id || null,
    partyId: party?._id || null,
    supplierName,
    supplierPhone,
    totalAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount,
    paymentType,
    status,
    accountId: paidAmount > 0 ? accountId : null,
    attachments,
    attachment: attachmentPath,
    attachmentType,
    items: parsedItems,
    isOpening: isOpening === true || isOpening === "true",
    userId,
  });

  // 🔹 Inventory account nikalein
  const inventoryAccount = await Account.findOne({
    code: "INVENTORY",
    userId,
  });
  if (!inventoryAccount) {
    return res.status(400).json({
      message: "Inventory account not found",
    });
  }

  const openingBalanceAccount = await Account.findOne({
    code: "OPENING_BALANCE",
    userId,
  });

  const lines =
    isOpening === true || isOpening === "true"
      ? [
          {
            account: openingBalanceAccount._id,
            type: "debit",
            amount: grandTotal,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: grandTotal,
          },
        ]
      : [
          {
            account: inventoryAccount._id,
            type: "debit",
            amount: grandTotal,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: grandTotal,
          },
        ];

  await JournalEntry.create({
    date: parsedInvoiceDate,

    time: invoiceTime || "",
    billNo: billNo,
    description: req.body.description || "",

    createdBy: userId,
    sourceType:
      isOpening === true || isOpening === "true"
        ? "opening_purchase_invoice"
        : "purchase_invoice",

    supplierId: supplier?._id || null,
    partyId: party?._id || null,
    invoiceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    referenceId: invoice._id,

    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  //CREATE DISCOUNT ENTRY

  if (Number(discountAmount || 0) > 0) {
    await createDiscountEntry({
      userId,
      referenceId: invoice._id,
      billNo: invoice.billNo,

      customerAccountId: counterPartyAccountId,

      discountAmount: Number(discountAmount),

      description: "Purchase Invoice Discount",

      originModule: "purchase_invoice",

      sourceType: "purchase_discount",

      discountAccountCode: "PURCHASE_DISCOUNT",

      discountAccountName: "purchase discount",

      entryDate: parsedInvoiceDate,

      entryTime: invoiceTime || "",

      supplierId: supplier?._id || null,
      partyId: party?._id || null,
    });
  }

  if (paidAmount > 0 && accountId) {
    await createPaymentEntry({
      userId,
      referenceId: invoice._id,
      sourceType: "purchase_payment",
      billNo: invoice.billNo,
      accountId,
      counterPartyAccountId,
      amount: paidAmount,
      paymentType,
      description: `Payment against Purchase Invoice ${invoice.billNo}`,

      entryDate: parsedInvoiceDate,

      entryTime: invoiceTime || "",

      supplierId: supplier?._id || null,
      partyId: party?._id || null,
    });
  }

  // 📦 Stock via stockHelper
  if (!(isOpening === true || isOpening === "true")) {
    for (const item of parsedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        unitCost: item.price || 0,
        salePrice: item.salePrice || 0,
      });

      // ✅ Inventory Entry
      await createInventoryEntry({
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        note: `Purchase Invoice #${billNo}`,
        invoiceId: invoice._id,
        invoiceModel: "PurchaseInvoice",
        userId,
        rate: item.price || 0,
      });
    }
  }

  await recalculateAccountBalance(counterPartyAccountId);

  if (accountId) {
    await recalculateAccountBalance(accountId);
  }

  await logActivity({
    req,
    action: "create",
    module: "purchases",
    entityType: "PurchaseInvoice",
    entityId: invoice._id,
    title: `Purchase Invoice ${invoice.billNo}`,
    description: `${invoice.supplierName} کی Purchase Invoice بنائی گئی`,
    billNo: invoice.billNo,
    after: {
      supplierName: invoice.supplierName,
      supplierPhone: invoice.supplierPhone,
      invoiceDate: invoice.invoiceDate,
      invoiceTime: invoice.invoiceTime,
      totalAmount: invoice.totalAmount,
      discountPercent: invoice.discountPercent,
      discountAmount: invoice.discountAmount,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      paymentType: invoice.paymentType,
      status: invoice.status,
      accountId: invoice.accountId,
      itemCount: invoice.items?.length || 0,
      isOpening: invoice.isOpening,
    },
  });

  res.status(201).json({
    success: true,
    message: "Purchase invoice saved successfully.",
    data: invoice,
  });
});

// ✅ Get invoice
const getPurchaseInvoiceById = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    userId,
    isDeleted: false,
  }).populate("items.productId");

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const formattedAttachments = formatPurchaseAttachments(invoice);

  res.status(200).json({
    ...invoice.toObject(),
    attachments: formattedAttachments,
    attachmentFullUrl: formattedAttachments[0]?.fullUrl || "",
  });
});

// ✅ UPDATE PURCHASE INVOICE (SAFE PRO VERSION)
const updatePurchaseInvoice = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    userId,
    isDeleted: false,
  });

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const beforeUpdate = {
    billNo: invoice.billNo,
    invoiceDate: invoice.invoiceDate,
    invoiceTime: invoice.invoiceTime,
    supplier: invoice.supplier,
    partyId: invoice.partyId,
    supplierName: invoice.supplierName,
    supplierPhone: invoice.supplierPhone,
    totalAmount: invoice.totalAmount,
    discountPercent: invoice.discountPercent,
    discountAmount: invoice.discountAmount,
    grandTotal: invoice.grandTotal,
    paidAmount: invoice.paidAmount,
    paymentType: invoice.paymentType,
    status: invoice.status,
    accountId: invoice.accountId,
    itemCount: invoice.items?.length || 0,
    isOpening: invoice.isOpening,
  };

  const oldPaidAmount = Number(invoice.paidAmount || 0);

  const {
    billNo,
    invoiceDate,
    invoiceTime,
    supplierName,
    supplierPhone,
    totalAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount,
    paymentType,
    accountId,
    items,
    partyId,
    isOpening,
  } = req.body;

  const newPaidAmount = Number(paidAmount || 0);

  if (newPaidAmount !== oldPaidAmount && !canPayPurchaseBill(req)) {
    return res.status(403).json({
      message: "You do not have permission to change purchase payment",
    });
  }

  const parsedInvoiceDate = new Date(`${invoiceDate}T12:00:00`);

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;

  parsedItems =
    isOpening === true || isOpening === "true"
      ? []
      : parsedItems.filter((i) => i.productId && i.quantity > 0 && i.price > 0);

  //SAVE OLD ACCOUNTS

  const oldSupplier = invoice.supplier
    ? await Supplier.findById(invoice.supplier)
    : null;

  const oldSupplierAccount = oldSupplier?.account || null;

  const oldParty = invoice.partyId
    ? await Party.findById(invoice.partyId)
    : null;

  const oldPartyAccount = oldParty?.account || null;

  const oldPaymentAccount = invoice.accountId || null;

  // ATTACHMENT HANDLING

  let attachments = formatPurchaseAttachments(invoice).map((att) => ({
    key: att.key,
    type: att.type || "",
    size: att.size || 0,
    originalName: att.originalName || "",
  }));

  let keepAttachmentKeys = [];

  try {
    keepAttachmentKeys = JSON.parse(req.body.keepAttachmentKeys || "[]");
  } catch (err) {
    keepAttachmentKeys = [];
  }

  const removedAttachments = attachments.filter(
    (att) => !keepAttachmentKeys.includes(att.key),
  );

  for (const att of removedAttachments) {
    await deletePurchaseAttachment(att);
  }

  attachments = attachments.filter((att) =>
    keepAttachmentKeys.includes(att.key),
  );

  const newAttachments = await uploadPurchaseFiles(req.files, userId);

  if (attachments.length + newAttachments.length > 3) {
    for (const att of newAttachments) {
      await deletePurchaseAttachment(att);
    }

    return res.status(400).json({
      message: "Maximum 3 attachments allowed",
    });
  }

  attachments = [...attachments, ...newAttachments];

  const attachmentPath = attachments[0]?.key || "";
  const attachmentType = attachments[0]?.type || "";

  // REMOVE OLD STOCK

  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    userId,
  });

  //SOFT DELETE OLD JOURNALS

  await JournalEntry.updateMany(
    {
      $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
      sourceType: {
        $in: [
          "purchase_invoice",
          "opening_purchase_invoice",
          "purchase_payment",
          "purchase_discount",
        ],
      },
      isDeleted: false,
    },
    {
      $set: {
        isDeleted: true,
      },
    },
  );

  let supplier = null;
  let party = null;
  let counterPartyAccountId = null;

  if (partyId) {
    party = await Party.findOne({
      _id: partyId,
      userId,
      isDeleted: false,
      isActive: true,
    });

    if (!party || !party.account) {
      throw new Error("Party account not found");
    }

    counterPartyAccountId = party.account;
  } else {
    supplier = await Supplier.findOne({
      name: {
        $regex: new RegExp(`^${supplierName.trim()}$`, "i"),
      },
      userId,
      isDeleted: false,
    });

    if (!supplier || !supplier.account) {
      throw new Error("Supplier or supplier account not found");
    }

    counterPartyAccountId = supplier.account;
  }

  // STATUS CALCULATION

  let status = "Unpaid";

  if (paidAmount >= grandTotal) {
    status = "Paid";
  } else if (paidAmount > 0) {
    status = "Partial";
  }

  // UPDATE INVOICE

  Object.assign(invoice, {
    billNo,
    invoiceDate: parsedInvoiceDate,
    invoiceTime,
    supplier: supplier?._id || null,
    partyId: party?._id || null,
    supplierName,
    supplierPhone,
    totalAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount,
    paymentType,
    status,
    accountId: paidAmount > 0 ? accountId : null,
    attachments,
    attachment: attachmentPath,
    attachmentType,
    items: parsedItems,
    isOpening: isOpening === true || isOpening === "true",
  });

  await invoice.save();

  //INVENTORY ACCOUNT

  const inventoryAccount = await Account.findOne({
    code: "INVENTORY",
    userId,
  });

  if (!inventoryAccount) {
    throw new Error("Inventory account not found");
  }

  // CREATE JOURNAL ENTRY

  const openingBalanceAccount = await Account.findOne({
    code: "OPENING_BALANCE",
    userId,
  });

  const lines =
    isOpening === true || isOpening === "true"
      ? [
          {
            account: openingBalanceAccount._id,
            type: "debit",
            amount: grandTotal,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: grandTotal,
          },
        ]
      : [
          {
            account: inventoryAccount._id,
            type: "debit",
            amount: grandTotal,
          },
          {
            account: counterPartyAccountId,
            type: "credit",
            amount: grandTotal,
          },
        ];

  await JournalEntry.create({
    date: parsedInvoiceDate,
    time: invoiceTime || "",
    billNo,
    description: req.body.description || "",
    createdBy: userId,
    sourceType:
      isOpening === true || isOpening === "true"
        ? "opening_purchase_invoice"
        : "purchase_invoice",
    supplierId: supplier?._id || null,
    partyId: party?._id || null,
    invoiceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    referenceId: invoice._id,
    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  //CREATE DISCOUNT ENTRY

  if (Number(discountAmount || 0) > 0) {
    await createDiscountEntry({
      userId,
      referenceId: invoice._id,
      billNo: invoice.billNo,

      customerAccountId: counterPartyAccountId,

      discountAmount: Number(discountAmount),

      description: "Updated Purchase Invoice Discount",

      originModule: "purchase_invoice",

      sourceType: "purchase_discount",

      discountAccountCode: "PURCHASE_DISCOUNT",

      discountAccountName: "purchase discount",

      entryDate: parsedInvoiceDate,

      entryTime: invoiceTime || "",

      supplierId: supplier?._id || null,
      partyId: party?._id || null,
    });
  }

  // CREATE PAYMENT ENTRY

  if (paidAmount > 0 && accountId) {
    await createPaymentEntry({
      userId,
      referenceId: invoice._id,
      sourceType: "purchase_payment",
      billNo: invoice.billNo,
      accountId,
      counterPartyAccountId,
      amount: paidAmount,
      paymentType,
      description: `Payment against Purchase Invoice ${invoice.billNo}`,
      entryDate: parsedInvoiceDate,

      entryTime: invoiceTime || "",

      supplierId: supplier?._id || null,
      partyId: party?._id || null,
    });
  }

  // RE-APPLY STOCK

  if (!(isOpening === true || isOpening === "true")) {
    for (const item of parsedItems) {
      await Product.findByIdAndUpdate(item.productId, {
        unitCost: item.price || 0,
        salePrice: item.salePrice || 0,
      });

      // ✅ Re-Apply Stock
      await createInventoryEntry({
        productId: item.productId,
        type: "IN",
        quantity: item.quantity,
        note: `Updated Purchase Invoice #${billNo}`,
        invoiceId: invoice._id,
        invoiceModel: "PurchaseInvoice",
        userId,
        rate: item.price || 0,
      });
    }
  }

  // RECALCULATE NEW ACCOUNTS

  await recalculateAccountBalance(counterPartyAccountId);

  if (accountId) {
    await recalculateAccountBalance(accountId);
  }

  // RECALCULATE OLD SUPPLIER ACCOUNT

  if (
    oldPartyAccount &&
    oldPartyAccount.toString() !== counterPartyAccountId.toString()
  ) {
    await recalculateAccountBalance(oldPartyAccount);
  }

  if (
    oldSupplierAccount &&
    oldSupplierAccount.toString() !== counterPartyAccountId.toString()
  ) {
    await recalculateAccountBalance(oldSupplierAccount);
  }

  // RECALCULATE OLD PAYMENT ACCOUNT

  if (
    oldPaymentAccount &&
    accountId &&
    oldPaymentAccount.toString() !== accountId.toString()
  ) {
    await recalculateAccountBalance(oldPaymentAccount);
  }

  await logActivity({
    req,
    action: "update",
    module: "purchases",
    entityType: "PurchaseInvoice",
    entityId: invoice._id,
    title: `Purchase Invoice ${invoice.billNo}`,
    description: `${invoice.supplierName} کی Purchase Invoice Update کی گئی`,
    billNo: invoice.billNo,
    before: beforeUpdate,
    after: {
      billNo: invoice.billNo,
      invoiceDate: invoice.invoiceDate,
      invoiceTime: invoice.invoiceTime,
      supplier: invoice.supplier,
      partyId: invoice.partyId,
      supplierName: invoice.supplierName,
      supplierPhone: invoice.supplierPhone,
      totalAmount: invoice.totalAmount,
      discountPercent: invoice.discountPercent,
      discountAmount: invoice.discountAmount,
      grandTotal: invoice.grandTotal,
      paidAmount: invoice.paidAmount,
      paymentType: invoice.paymentType,
      status: invoice.status,
      accountId: invoice.accountId,
      itemCount: invoice.items?.length || 0,
      isOpening: invoice.isOpening,
    },
  });

  res.status(200).json({
    success: true,
    message: "Purchase invoice updated successfully.",
    data: invoice,
  });
});

// ✅ Delete invoice
const deletePurchaseInvoice = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    userId,
    isDeleted: false,
  });

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const beforeDelete = {
    billNo: invoice.billNo,
    invoiceDate: invoice.invoiceDate,
    invoiceTime: invoice.invoiceTime,
    supplier: invoice.supplier,
    partyId: invoice.partyId,
    supplierName: invoice.supplierName,
    supplierPhone: invoice.supplierPhone,
    totalAmount: invoice.totalAmount,
    discountPercent: invoice.discountPercent,
    discountAmount: invoice.discountAmount,
    grandTotal: invoice.grandTotal,
    paidAmount: invoice.paidAmount,
    paymentType: invoice.paymentType,
    status: invoice.status,
    accountId: invoice.accountId,
    itemCount: invoice.items?.length || 0,
    isOpening: invoice.isOpening,
  };

  // ✅ Save old accounts
  const supplier = invoice.supplier
    ? await Supplier.findById(invoice.supplier)
    : null;

  const party = invoice.partyId ? await Party.findById(invoice.partyId) : null;

  const supplierAccount = supplier?.account || party?.account || null;

  const paymentAccount = invoice.accountId || null;

  // ✅ STOCK ROLLBACK
  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    userId,
  });

  // ✅ 🔥 SOFT DELETE JOURNA

  await JournalEntry.updateMany(
    {
      $or: [{ referenceId: invoice._id }, { invoiceId: invoice._id }],
      sourceType: {
        $in: [
          "purchase_invoice",
          "opening_purchase_invoice",
          "purchase_payment",
          "purchase_discount",
        ],
      },
    },
    { isDeleted: true },
  );

  const attachmentsToDelete = formatPurchaseAttachments(invoice);

  for (const att of attachmentsToDelete) {
    await deletePurchaseAttachment(att);
  }

  // ✅ DELETE INVOICE
  invoice.isDeleted = true;
  await invoice.save();

  // ✅ Recalculate supplier account
  if (supplierAccount) {
    await recalculateAccountBalance(supplierAccount);
  }

  // ✅ Recalculate payment account
  if (paymentAccount) {
    await recalculateAccountBalance(paymentAccount);
  }

  await logActivity({
    req,
    action: "delete",
    module: "purchases",
    entityType: "PurchaseInvoice",
    entityId: invoice._id,
    title: `Purchase Invoice ${invoice.billNo}`,
    description: `${invoice.supplierName} کی Purchase Invoice Delete کی گئی`,
    billNo: invoice.billNo,
    before: beforeDelete,
    after: {
      isDeleted: true,
    },
  });

  res.status(200).json({
    success: true,
    message: "Purchase invoice and related records deleted.",
  });
});

// ✅ Get Purchase Invoices - Fast Pagination List
const getAllPurchaseInvoices = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  // ✅ Page number
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);

  // ✅ One page records
  const requestedLimit = parseInt(req.query.limit || "50", 10);
  const limit = Math.min(Math.max(requestedLimit, 1), 100);

  const skip = (page - 1) * limit;

  // ✅ Search and status
  const search = (req.query.search || "").trim();
  const status = (req.query.status || "").trim();

  // ✅ Search special characters safe
  const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // ✅ Active suppliers and parties together
  const [activeSuppliers, activeParties] = await Promise.all([
    Supplier.find({
      userId,
      isDeleted: false,
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

  const activeSupplierIds = activeSuppliers.map((supplier) => supplier._id);
  const activePartyIds = activeParties.map((party) => party._id);

  // ✅ Main filter
  const filter = {
    userId,
    isDeleted: false,

    $and: [
      {
        $or: [
          { supplier: { $in: activeSupplierIds } },
          { partyId: { $in: activePartyIds } },
        ],
      },
    ],
  };

  // ✅ Status filter
  if (status) {
    filter.status = status;
  }

  // ✅ Search by bill, supplier/party name or phone
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
          supplierName: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          supplierPhone: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ],
    });
  }

  // ✅ List and total count together
  const [invoices, totalInvoices] = await Promise.all([
    PurchaseInvoice.find(filter)
      // ✅ List page کے لیے صرف ضروری fields
      .select(
        [
          "billNo",
          "invoiceDate",
          "supplier",
          "partyId",
          "supplierName",
          "supplierPhone",
          "totalAmount",
          "grandTotal",
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

    PurchaseInvoice.countDocuments(filter),
  ]);

  const totalPages = Math.max(Math.ceil(totalInvoices / limit), 1);

  return res.status(200).json({
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
});
// ✅ SEARCH Purchase Invoices
const searchPurchaseInvoices = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;
  const { query } = req.query;

  // ✅ ONLY ACTIVE SUPPLIERS
  const activeSuppliers = await Supplier.find({
    userId,
    isDeleted: false,
  }).select("_id");
  const activeSupplierIds = activeSuppliers.map((s) => s._id);

  const activeParties = await Party.find({
    userId,
    isDeleted: false,
    isActive: true,
  }).select("_id");

  const activePartyIds = activeParties.map((p) => p._id);

  if (!query || !query.trim()) {
    return res.status(400).json({
      message: "Search query required",
    });
  }

  const conditions = query
    .split(" ")
    .map((pair) => {
      const [key, value] = pair.split(":");

      if (!value) return null;

      switch (key) {
        case "billNo":
          return { billNo: { $regex: value, $options: "i" } };

        case "supplierName":
          return { supplierName: { $regex: value, $options: "i" } };

        case "supplierPhone":
          return { supplierPhone: { $regex: value, $options: "i" } };

        case "startDate":
          return {
            invoiceDate: {
              $gte: new Date(value),
            },
          };

        case "endDate":
          return {
            invoiceDate: {
              $lte: new Date(value + "T23:59:59.999Z"),
            },
          };

        default:
          return null;
      }
    })
    .filter(Boolean);

  const invoices = await PurchaseInvoice.find({
    userId,
    isDeleted: false,

    $or: [
      { supplier: { $in: activeSupplierIds } },
      { partyId: { $in: activePartyIds } },
    ],

    $and: conditions,
  })
    .populate("items.productId")
    .sort({ createdAt: -1 });

  const formatted = invoices.map((inv) => {
    const obj = inv.toObject ? inv.toObject() : inv;
    const attachments = formatPurchaseAttachments(obj);

    return {
      ...obj,
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
    };
  });

  res.status(200).json(formatted);
});

const getItemPurchaseHistory = asyncHandler(async (req, res) => {
  const mongoose = require("mongoose");

  const userId = req.user?.id || req.userId;
  const { productId } = req.params;

  // ✅ Optional filters
  const supplierId = String(req.query.supplierId || "").trim();
  const partyId = String(req.query.partyId || "").trim();

  if (!productId) {
    return res.status(400).json({
      message: "Product ID required",
    });
  }

  // ✅ Invalid Product ID سے server error روکیں
  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(400).json({
      message: "Invalid Product ID",
    });
  }

  // ✅ Invalid User ID سے server error روکیں
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      message: "Invalid User ID",
    });
  }

  // ✅ اگر Supplier ID بھیجی گئی ہو تو اسے validate کریں
  if (supplierId && !mongoose.Types.ObjectId.isValid(supplierId)) {
    return res.status(400).json({
      message: "Invalid Supplier ID",
    });
  }

  // ✅ اگر Party ID بھیجی گئی ہو تو اسے validate کریں
  if (partyId && !mongoose.Types.ObjectId.isValid(partyId)) {
    return res.status(400).json({
      message: "Invalid Party ID",
    });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const productObjectId = new mongoose.Types.ObjectId(productId);

  const invoiceMatch = {
    userId: userObjectId,
    isDeleted: false,
    isOpening: { $ne: true },
    "items.productId": productObjectId,
  };

  if (supplierId) {
    invoiceMatch.supplier = new mongoose.Types.ObjectId(supplierId);
  }

  if (partyId) {
    invoiceMatch.partyId = new mongoose.Types.ObjectId(partyId);
  }

  const records = await PurchaseInvoice.aggregate([
    {
      $match: invoiceMatch,
    },

    {
      $unwind: "$items",
    },

    {
      $match: {
        "items.productId": productObjectId,
      },
    },

    {
      $project: {
        _id: 1,
        supplierName: 1,
        supplier: 1,
        partyId: 1,
        billNo: 1,
        invoiceDate: 1,
        invoiceTime: 1,
        price: "$items.price",
        quantity: "$items.quantity",
        total: "$items.total",
      },
    },

    {
      $sort: {
        invoiceDate: -1,
        _id: -1,
      },
    },

    {
      $limit: 5,
    },
  ]);

  return res.status(200).json(records);
});
module.exports = {
  addPurchaseInvoice,
  getAllPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  searchPurchaseInvoices,
  getItemPurchaseHistory,
};
