const PurchaseInvoice = require("../models/purchaseInvoice");

const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const {
  deleteTransactionsByReference,
  getMultipleProductsStock,
} = require("../utils/stockHelper");

const Product = require("../models/Product");
const InventoryTransaction = require("../models/InventoryTransaction");
const mongoose = require("mongoose");
const Account = require("../models/Account");
const asyncHandler = require("express-async-handler");
const { logActivity } = require("../utils/activityLogger");
const {
  MODULE_SCOPES,
  applySupplierModuleScopeFilter,
} = require("../utils/moduleScope");

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

const getVersionSnapshot = async (Model, match) => {
  const rows = await Model.aggregate([
    {
      $match: match,
    },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        latest: {
          $max: {
            $ifNull: ["$updatedAt", "$createdAt"],
          },
        },
      },
    },
  ]);

  const row = rows[0] || {};

  const timestamp = row.latest ? new Date(row.latest).getTime() : 0;

  return `${Number(row.count || 0)}:${timestamp}`;
};

const getTradingSupplierQuery = (userId, extra = {}) =>
  applySupplierModuleScopeFilter(
    {
      userId,
      ...extra,
    },
    MODULE_SCOPES.TRADING,
  );

const getPurchaseFormVersions = async (userId) => {
  const [
    suppliersVersion,
    partiesVersion,
    productsVersion,
    inventoryVersion,
    accountsVersion,
  ] = await Promise.all([
    getVersionSnapshot(
      Supplier,
      getTradingSupplierQuery(userId, { isDeleted: false }),
    ),

    getVersionSnapshot(Party, {
      userId,
      isDeleted: false,
      isActive: true,
      role: { $in: ["supplier", "both"] },
    }),

    getVersionSnapshot(Product, {
      userId,
    }),

    getVersionSnapshot(InventoryTransaction, {
      userId,
    }),

    getVersionSnapshot(Account, {
      userId,
      isActive: { $ne: false },
      type: "Asset",
      category: {
        $in: ["cash", "bank", "online", "cheque"],
      },
    }),
  ]);

  return {
    suppliers: suppliersVersion,
    parties: partiesVersion,
    products: `${productsVersion}|${inventoryVersion}`,
    paymentAccounts: accountsVersion,
  };
};

const applyPurchaseStockBatch = async ({
  items,
  invoiceId,
  billNo,
  userId,
  updated = false,
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  const safeItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const rate = Number(item.price || 0);
    const salePrice = Number(item.salePrice || 0);

    if (
      !mongoose.Types.ObjectId.isValid(item.productId) ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(rate) ||
      rate < 0
    ) {
      throw new Error("Invalid purchase inventory item");
    }

    return {
      productId: item.productId,
      quantity,
      rate,
      salePrice,
    };
  });

  const productOperations = safeItems.map((item) => ({
    updateOne: {
      filter: {
        _id: item.productId,
        userId,
      },
      update: {
        $set: {
          unitCost: item.rate,
          salePrice: item.salePrice,
        },
      },
    },
  }));

  if (productOperations.length > 0) {
    await Product.bulkWrite(productOperations, {
      ordered: false,
    });
  }

  const inventoryRows = safeItems.map((item) => ({
    productId: item.productId,
    type: "IN",
    quantity: item.quantity,
    rate: item.rate,
    note: `${updated ? "Updated " : ""}Purchase Invoice #${billNo}`,
    invoiceId,
    invoiceModel: "PurchaseInvoice",
    userId,
  }));

  await InventoryTransaction.insertMany(inventoryRows, {
    ordered: false,
  });
};

const getPurchaseInvoiceFormOptions = asyncHandler(async (req, res) => {
  const rawUserId = req.user?.id || req.userId;

  if (!mongoose.Types.ObjectId.isValid(rawUserId)) {
    return res.status(401).json({
      success: false,
      message: "Invalid user",
    });
  }

  const userId = new mongoose.Types.ObjectId(rawUserId);

  const versions = await getPurchaseFormVersions(userId);

  const clientVersions = {
    suppliers: String(req.query.suppliersVersion || ""),
    parties: String(req.query.partiesVersion || ""),
    products: String(req.query.productsVersion || ""),
    paymentAccounts: String(req.query.paymentAccountsVersion || ""),
  };

  const changed = {
    suppliers:
      !clientVersions.suppliers ||
      clientVersions.suppliers !== versions.suppliers,

    parties:
      !clientVersions.parties || clientVersions.parties !== versions.parties,

    products:
      !clientVersions.products || clientVersions.products !== versions.products,

    paymentAccounts:
      !clientVersions.paymentAccounts ||
      clientVersions.paymentAccounts !== versions.paymentAccounts,
  };

  if (
    !changed.suppliers &&
    !changed.parties &&
    !changed.products &&
    !changed.paymentAccounts
  ) {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");

    return res.json({
      success: true,
      notModified: true,
      versions,
      changed,
    });
  }

  const data = {};

  const tasks = [];

  if (changed.suppliers) {
    tasks.push(
      Supplier.find(getTradingSupplierQuery(userId, { isDeleted: false }))
        .select("name phone account supplierType moduleScope")
        .sort({ name: 1, _id: 1 })
        .lean()
        .then((rows) => {
          data.suppliers = rows;
        }),
    );
  }

  if (changed.parties) {
    tasks.push(
      Party.find({
        userId,
        isDeleted: false,
        isActive: true,
        role: {
          $in: ["supplier", "both"],
        },
      })
        .select("name phone account role")
        .sort({ name: 1, _id: 1 })
        .lean()
        .then((rows) => {
          data.parties = rows;
        }),
    );
  }

  if (changed.paymentAccounts) {
    tasks.push(
      Account.find({
        userId,
        isActive: { $ne: false },
        type: "Asset",
        category: {
          $in: ["cash", "bank", "online", "cheque"],
        },
      })
        .select("name code category type")
        .sort({ category: 1, name: 1, _id: 1 })
        .lean()
        .then((rows) => {
          data.paymentAccounts = rows;
        }),
    );
  }

  if (changed.products) {
    tasks.push(
      Product.find({
        userId,
      })
        .select(
          "name description unit uom unitCost salePrice lowStockThreshold categoryId",
        )
        .populate("categoryId", "name")
        .sort({ name: 1, _id: 1 })
        .lean()
        .then(async (products) => {
          const productIds = products.map((product) => product._id);

          const stockMap = await getMultipleProductsStock(productIds, userId);

          data.products = products.map((product) => ({
            ...product,
            stock: Number(stockMap[String(product._id)] || 0),
          }));
        }),
    );
  }

  await Promise.all(tasks);

  res.setHeader("Cache-Control", "private, no-store, max-age=0");

  return res.json({
    success: true,
    notModified: false,
    versions,
    changed,
    data,
  });
});

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

  if (!(isOpening === true || isOpening === "true")) {
    await applyPurchaseStockBatch({
      items: parsedItems,
      invoiceId: invoice._id,
      billNo,
      userId,
      updated: false,
    });
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
  })
    .populate({
      path: "items.productId",
      select: "name description salePrice unitCost",
    })
    .lean();

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const formattedAttachments = formatPurchaseAttachments(invoice);

  return res.status(200).json({
    ...invoice,
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

  if (!(isOpening === true || isOpening === "true")) {
    await applyPurchaseStockBatch({
      items: parsedItems,
      invoiceId: invoice._id,
      billNo,
      userId,
      updated: true,
    });
  }

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

// ✅ Get Purchase Invoices - Pagination + Filters + Total Purchases
const getAllPurchaseInvoices = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  // Pagination
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);

  const requestedLimit = parseInt(req.query.limit || "50", 10);

  const limit = Math.min(Math.max(requestedLimit, 1), 100);

  const skip = (page - 1) * limit;

  // Filters
  const search = (req.query.search || "").trim();
  const status = (req.query.status || "").trim();

  const dateFilter = (req.query.dateFilter || "").trim();
  const fromDate = (req.query.fromDate || "").trim();
  const toDate = (req.query.toDate || "").trim();

  const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Active suppliers + parties
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

  // Main filter
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

  // Status filter
  if (status) {
    filter.status = status;
  }

  // Search filter
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

  // =========================
  // DATE FILTER
  // =========================

  const now = new Date();

  let startDate = null;
  let endDate = null;

  const startOfDay = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const endOfDay = (date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  };

  if (dateFilter === "today") {
    startDate = startOfDay(now);
    endDate = endOfDay(now);
  }

  if (dateFilter === "yesterday") {
    const yesterday = new Date(now);

    yesterday.setDate(yesterday.getDate() - 1);

    startDate = startOfDay(yesterday);
    endDate = endOfDay(yesterday);
  }

  if (dateFilter === "this_week") {
    const current = new Date(now);

    const day = current.getDay();

    const diff = day === 0 ? -6 : 1 - day;

    current.setDate(current.getDate() + diff);

    startDate = startOfDay(current);
    endDate = endOfDay(now);
  }

  if (dateFilter === "last_week") {
    const current = new Date(now);

    const day = current.getDay();

    const diff = day === 0 ? -6 : 1 - day;

    const thisMonday = new Date(current);

    thisMonday.setDate(current.getDate() + diff);

    const lastMonday = new Date(thisMonday);

    lastMonday.setDate(lastMonday.getDate() - 7);

    const lastSunday = new Date(thisMonday);

    lastSunday.setDate(lastSunday.getDate() - 1);

    startDate = startOfDay(lastMonday);
    endDate = endOfDay(lastSunday);
  }

  if (dateFilter === "this_month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    endDate = endOfDay(now);
  }

  if (dateFilter === "last_month") {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);

    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  }

  if (dateFilter === "this_year") {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

    endDate = endOfDay(now);
  }

  if (dateFilter === "last_year") {
    startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);

    endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
  }

  if (dateFilter === "custom") {
    if (fromDate) {
      const parsedFromDate = new Date(`${fromDate}T00:00:00`);

      if (!Number.isNaN(parsedFromDate.getTime())) {
        startDate = parsedFromDate;
      }
    }

    if (toDate) {
      const parsedToDate = new Date(`${toDate}T23:59:59.999`);

      if (!Number.isNaN(parsedToDate.getTime())) {
        endDate = parsedToDate;
      }
    }
  }

  if (startDate || endDate) {
    filter.invoiceDate = {};

    if (startDate) {
      filter.invoiceDate.$gte = startDate;
    }

    if (endDate) {
      filter.invoiceDate.$lte = endDate;
    }
  }

  // =========================
  // LIST + COUNT + TOTAL
  // =========================

  const [invoices, totalInvoices, purchaseSummary] = await Promise.all([
    PurchaseInvoice.find(filter)
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
        invoiceDate: -1,
        createdAt: -1,
        _id: -1,
      })
      .skip(skip)
      .limit(limit)
      .lean(),

    PurchaseInvoice.countDocuments(filter),

    PurchaseInvoice.aggregate([
      {
        $match: {
          ...filter,

          // ✅ Opening Purchase کو Total Purchases میں شامل نہ کریں
          isOpening: { $ne: true },
        },
      },

      {
        $group: {
          _id: null,

          totalPurchases: {
            $sum: {
              $ifNull: [
                "$grandTotal",
                {
                  $ifNull: ["$totalAmount", 0],
                },
              ],
            },
          },
        },
      },
    ]),
  ]);

  const totalPurchases =
    purchaseSummary.length > 0
      ? Number(purchaseSummary[0].totalPurchases || 0)
      : 0;

  const totalPages = Math.max(Math.ceil(totalInvoices / limit), 1);

  return res.status(200).json({
    invoices,

    summary: {
      totalPurchases,
    },

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
  const queryText = String(req.query.query || "").trim();

  if (!queryText) {
    return res.status(400).json({
      message: "Search query required",
    });
  }

  const requestedLimit = Number.parseInt(req.query.limit || "25", 10);

  const limit = Math.min(
    Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 25, 1),
    50,
  );

  const escapeRegex = (value) =>
    String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const conditions = [];

  const matcher =
    /(billNo|supplierName|supplierPhone|startDate|endDate):(.+?)(?=\s+(?:billNo|supplierName|supplierPhone|startDate|endDate):|$)/g;

  let match;

  while ((match = matcher.exec(queryText)) !== null) {
    const key = match[1];
    const value = String(match[2] || "").trim();

    if (!value) continue;

    if (key === "billNo") {
      conditions.push({
        billNo: {
          $regex: escapeRegex(value),
          $options: "i",
        },
      });
    }

    if (key === "supplierName") {
      conditions.push({
        supplierName: {
          $regex: escapeRegex(value),
          $options: "i",
        },
      });
    }

    if (key === "supplierPhone") {
      conditions.push({
        supplierPhone: {
          $regex: escapeRegex(value),
          $options: "i",
        },
      });
    }

    if (key === "startDate") {
      const date = new Date(`${value}T00:00:00`);

      if (!Number.isNaN(date.getTime())) {
        conditions.push({
          invoiceDate: {
            $gte: date,
          },
        });
      }
    }

    if (key === "endDate") {
      const date = new Date(`${value}T23:59:59.999`);

      if (!Number.isNaN(date.getTime())) {
        conditions.push({
          invoiceDate: {
            $lte: date,
          },
        });
      }
    }
  }

  if (conditions.length === 0) {
    return res.status(400).json({
      message: "Invalid search query",
    });
  }

  const [activeSupplierIds, activePartyIds] = await Promise.all([
    Supplier.distinct("_id", {
      userId,
      isDeleted: false,
    }),

    Party.distinct("_id", {
      userId,
      isDeleted: false,
      isActive: true,
    }),
  ]);

  const invoices = await PurchaseInvoice.find({
    userId,
    isDeleted: false,

    $or: [
      {
        supplier: {
          $in: activeSupplierIds,
        },
      },
      {
        partyId: {
          $in: activePartyIds,
        },
      },
    ],

    $and: conditions,
  })
    .select(
      [
        "billNo",
        "invoiceDate",
        "invoiceTime",
        "supplier",
        "partyId",
        "supplierName",
        "supplierPhone",
        "items",
        "totalAmount",
        "discountPercent",
        "discountAmount",
        "grandTotal",
        "paidAmount",
        "paymentType",
        "accountId",
        "attachments",
        "attachment",
        "attachmentType",
        "isOpening",
        "createdAt",
      ].join(" "),
    )
    .populate({
      path: "items.productId",
      select: "name description salePrice unitCost",
    })
    .sort({
      invoiceDate: -1,
      createdAt: -1,
      _id: -1,
    })
    .limit(limit)
    .lean();

  const formatted = invoices.map((invoice) => {
    const attachments = formatPurchaseAttachments(invoice);

    return {
      ...invoice,
      attachments,
      attachmentFullUrl: attachments[0]?.fullUrl || "",
    };
  });

  return res.status(200).json(formatted);
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
  getPurchaseInvoiceFormOptions,
};
