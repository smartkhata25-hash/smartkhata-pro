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

const path = require("path");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");
const {
  createPaymentEntry,
  createDiscountEntry,
} = require("../utils/paymentService");

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

  let attachmentPath = "";
  let attachmentType = "";
  if (req.file) {
    attachmentPath = req.file.path.replace(/\\/g, "/");
    attachmentType = req.file.mimetype?.split("/")[0] || "";
  }

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
  const parsedInvoiceDate = new Date(invoiceDate);

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

  /* =============================
   CREATE DISCOUNT ENTRY
============================== */
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
  if (accountId) await recalculateAccountBalance(accountId);

  res.status(201).json({
    success: true,
    message: "Purchase invoice saved successfully.",
    data: invoice,
  });
});

// ✅ Get invoice
const getPurchaseInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    isDeleted: false,
  }).populate("items.productId");
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  res.status(200).json(invoice);
});

// ✅ UPDATE PURCHASE INVOICE (SAFE PRO VERSION)
const updatePurchaseInvoice = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    isDeleted: false,
  });

  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

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

  const parsedInvoiceDate = new Date(invoiceDate);

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;

  parsedItems =
    isOpening === true || isOpening === "true"
      ? []
      : parsedItems.filter((i) => i.productId && i.quantity > 0 && i.price > 0);

  const userId = req.user?.id || req.userId;

  /* =============================
     SAVE OLD ACCOUNTS
  ============================== */
  const oldSupplier = invoice.supplier
    ? await Supplier.findById(invoice.supplier)
    : null;

  const oldSupplierAccount = oldSupplier?.account || null;

  const oldParty = invoice.partyId
    ? await Party.findById(invoice.partyId)
    : null;

  const oldPartyAccount = oldParty?.account || null;

  const oldPaymentAccount = invoice.accountId || null;

  /* =============================
     ATTACHMENT HANDLING
  ============================== */
  let attachmentPath = invoice.attachment;
  let attachmentType = "";

  if (req.file) {
    if (invoice.attachment && fs.existsSync(invoice.attachment)) {
      fs.unlinkSync(invoice.attachment);
    }

    attachmentPath = req.file.path.replace(/\\/g, "/");

    attachmentType = req.file.mimetype?.split("/")[0] || "";
  } else {
    attachmentType = invoice.attachmentType || "";
  }

  /* =============================
     REMOVE OLD STOCK
  ============================== */
  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    userId,
  });

  /* =============================
     SOFT DELETE OLD JOURNALS
  ============================== */
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

  /* =============================
     STATUS CALCULATION
  ============================== */
  let status = "Unpaid";

  if (paidAmount >= grandTotal) {
    status = "Paid";
  } else if (paidAmount > 0) {
    status = "Partial";
  }

  /* =============================
     UPDATE INVOICE
  ============================== */
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
    attachment: attachmentPath,
    attachmentType,
    items: parsedItems,
    isOpening: isOpening === true || isOpening === "true",
  });

  await invoice.save();

  /* =============================
     INVENTORY ACCOUNT
  ============================== */
  const inventoryAccount = await Account.findOne({
    code: "INVENTORY",
    userId,
  });

  if (!inventoryAccount) {
    throw new Error("Inventory account not found");
  }

  /* =============================
     CREATE JOURNAL ENTRY
  ============================== */
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

  /* =============================
   CREATE DISCOUNT ENTRY
============================== */
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

  /* =============================
     CREATE PAYMENT ENTRY
  ============================== */
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

  /* =============================
     RE-APPLY STOCK
  ============================== */
  if (!(isOpening === true || isOpening === "true")) {
    for (const item of parsedItems) {
      // ✅ Update Product Prices
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
  /* =============================
     RECALCULATE NEW ACCOUNTS
  ============================== */
  await recalculateAccountBalance(counterPartyAccountId);

  if (accountId) {
    await recalculateAccountBalance(accountId);
  }

  /* =============================
     RECALCULATE OLD SUPPLIER ACCOUNT
  ============================== */
  if (
    oldPartyAccount &&
    oldPartyAccount.toString() !== counterPartyAccountId.toString()
  ) {
    await recalculateAccountBalance(oldPartyAccount);
  }

  /* =============================
     RECALCULATE OLD PAYMENT ACCOUNT
  ============================== */
  if (
    oldPaymentAccount &&
    accountId &&
    oldPaymentAccount.toString() !== accountId.toString()
  ) {
    await recalculateAccountBalance(oldPaymentAccount);
  }

  res.status(200).json({
    success: true,
    message: "Purchase invoice updated successfully.",
    data: invoice,
  });
});

// ✅ Delete invoice
const deletePurchaseInvoice = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findOne({
    _id: req.params.id,
    isDeleted: false,
  });
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const userId = req.user?.id || req.userId;

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

  res.status(200).json({
    success: true,
    message: "Purchase invoice and related records deleted.",
  });
});

const getAllPurchaseInvoices = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

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

  const invoices = await PurchaseInvoice.find({
    userId,
    isDeleted: false,

    $or: [
      { supplier: { $in: activeSupplierIds } },
      { partyId: { $in: activePartyIds } },
    ],
  })
    .populate("supplier", "name")
    .sort({ createdAt: -1 })
    .lean();

  const formatted = invoices.map((inv) => {
    let status = "Unpaid";

    if (inv.paidAmount >= inv.grandTotal) status = "Paid";
    else if (inv.paidAmount > 0) status = "Partial";

    return { ...inv, status };
  });

  res.status(200).json(formatted);
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

  res.status(200).json(invoices);
});

const getItemPurchaseHistory = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;
  const { productId } = req.params;

  if (!productId) {
    return res.status(400).json({
      message: "Product ID required",
    });
  }

  const mongoose = require("mongoose");

  const records = await PurchaseInvoice.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        "items.productId": new mongoose.Types.ObjectId(productId),
      },
    },
    { $unwind: "$items" },
    {
      $match: {
        "items.productId": new mongoose.Types.ObjectId(productId),
      },
    },
    {
      $project: {
        supplierName: 1,
        supplier: 1,
        billNo: 1,
        invoiceDate: 1,
        price: "$items.price",
        quantity: "$items.quantity",
      },
    },
    {
      $sort: {
        price: 1,
        invoiceDate: -1,
      },
    },
    { $limit: 5 },
  ]);

  res.status(200).json(records);
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
