const PurchaseInvoice = require("../models/purchaseInvoice");

const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
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
const { createPaymentEntry } = require("../utils/paymentService");

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
  } = req.body;

  // ✅ STATUS CALCULATION (ADD HERE)
  let status = "Unpaid";
  if (paidAmount >= grandTotal) status = "Paid";
  else if (paidAmount > 0) status = "Partial";

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  parsedItems = parsedItems.filter(
    (i) => i.productId && i.quantity > 0 && i.price > 0,
  ); // ✅ Clean only valid items

  const userId = req.user?.id || req.userId;

  let attachmentPath = "";
  let attachmentType = "";
  if (req.file) {
    attachmentPath = req.file.path.replace(/\\/g, "/");
    attachmentType = req.file.mimetype?.split("/")[0] || "";
  }

  // 🔍 Find or Create Supplier with Account
  let supplier = await Supplier.findOne({ name: supplierName, userId });
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
  } else {
  }

  if (!supplier.account) {
    return res.status(400).json({ message: "Supplier account not linked" });
  }

  // 💾 Save invoice
  const parsedInvoiceDate = new Date(invoiceDate);

  const invoice = await PurchaseInvoice.create({
    billNo,
    invoiceDate: parsedInvoiceDate,

    invoiceTime,
    supplier: supplier._id, // ✅ New
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
    attachmentType, // ✅ New
    items: parsedItems,
    userId,
  });

  // 📘 Create Journal Entry

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

  const lines = [
    // ✅ Inventory increase
    {
      account: inventoryAccount._id,
      type: "debit",
      amount: grandTotal,
    },

    // ✅ Supplier liability
    {
      account: supplier.account,
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
    sourceType: "purchase_invoice",

    supplierId: supplier._id, // ✅ already added
    invoiceId: invoice._id, // ✅ ADD THIS
    invoiceModel: "PurchaseInvoice", // ✅ ADD THIS
    referenceId: invoice._id,

    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  if (paidAmount > 0 && accountId) {
    await createPaymentEntry({
      userId,
      referenceId: invoice._id,
      sourceType: "purchase_payment",
      billNo: invoice.billNo,
      accountId,
      counterPartyAccountId: supplier.account,
      amount: paidAmount,
      paymentType,
      description: `Payment against Purchase Invoice ${invoice.billNo}`,
    });
  }

  // 📦 Stock via stockHelper
  for (const item of parsedItems) {
    await createInventoryEntry({
      productId: item.productId,
      type: "IN",
      quantity: item.quantity,
      note: `Purchase Invoice #${billNo}`,
      invoiceId: invoice._id,
      invoiceModel: "PurchaseInvoice",
      userId,
    });
  }

  await recalculateAccountBalance(supplier.account);
  if (accountId) await recalculateAccountBalance(accountId);

  res.status(201).json({
    success: true,
    message: "Purchase invoice saved successfully.",
    data: invoice,
  });
});

// ✅ Get invoice
const getPurchaseInvoiceById = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findById(req.params.id).populate(
    "items.productId",
  );
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }
  res.status(200).json(invoice);
});

// ✅ Update invoice
const updatePurchaseInvoice = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findById(req.params.id);
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
  } = req.body;

  const parsedInvoiceDate = new Date(invoiceDate);

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  parsedItems = parsedItems.filter(
    (i) => i.productId && i.quantity > 0 && i.price > 0,
  );

  const userId = req.user?.id || req.userId;

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

  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    userId,
  });

  await JournalEntry.updateMany(
    {
      referenceId: invoice._id,
      sourceType: "purchase_invoice",
    },
    { isDeleted: true },
  );

  await JournalEntry.updateMany(
    {
      referenceId: invoice._id,
      sourceType: "purchase_payment",
    },
    { isDeleted: true },
  );

  const supplier = await Supplier.findOne({ name: supplierName, userId });
  if (!supplier || !supplier.account) {
    throw new Error("Supplier or account not found");
  }

  Object.assign(invoice, {
    billNo,
    invoiceDate: parsedInvoiceDate,
    invoiceTime,
    supplier: supplier._id,
    supplierName,
    supplierPhone,
    totalAmount,
    discountPercent,
    discountAmount,
    grandTotal,
    paidAmount,
    paymentType,
    accountId: paidAmount > 0 ? accountId : null,
    attachment: attachmentPath,
    attachmentType,
    items: parsedItems,
  });

  invoice.status =
    paidAmount >= grandTotal ? "Paid" : paidAmount > 0 ? "Partial" : "Unpaid";

  await invoice.save();

  const inventoryAccount = await Account.findOne({
    code: "INVENTORY",
    userId,
  });

  if (!inventoryAccount) {
    throw new Error("Inventory account not found");
  }

  const lines = [
    {
      account: inventoryAccount._id,
      type: "debit",
      amount: grandTotal,
    },
    {
      account: supplier.account,
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
    sourceType: "purchase_invoice",
    referenceId: invoice._id,
    supplierId: supplier._id,
    invoiceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  if (paidAmount > 0 && accountId) {
    await createPaymentEntry({
      userId,
      referenceId: invoice._id,
      sourceType: "purchase_payment",
      billNo: invoice.billNo,
      accountId,
      counterPartyAccountId: supplier.account,
      amount: paidAmount,
      paymentType,
      description: `Payment against Purchase Invoice ${invoice.billNo}`,
    });
  }

  for (const item of parsedItems) {
    await createInventoryEntry({
      productId: item.productId,
      type: "IN",
      quantity: item.quantity,
      note: `Updated Purchase Invoice #${billNo}`,
      invoiceId: invoice._id,
      invoiceModel: "PurchaseInvoice",
      userId,
    });
  }

  await recalculateAccountBalance(supplier.account);
  if (accountId) await recalculateAccountBalance(accountId);

  res.status(200).json({
    success: true,
    message: "Purchase invoice updated successfully.",
    data: invoice,
  });
});

// ✅ Delete invoice
const deletePurchaseInvoice = asyncHandler(async (req, res) => {
  const invoice = await PurchaseInvoice.findById(req.params.id);
  if (!invoice) {
    res.status(404);
    throw new Error("Invoice not found");
  }

  const userId = req.user?.id || req.userId;

  // ✅ STOCK ROLLBACK
  await deleteTransactionsByReference({
    referenceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
    userId,
  });

  // ✅ 🔥 SOFT DELETE JOURNAL
  await JournalEntry.updateMany(
    {
      referenceId: invoice._id,
      sourceType: "purchase_invoice",
    },
    { isDeleted: true },
  );

  await JournalEntry.updateMany(
    {
      referenceId: invoice._id,
      sourceType: "purchase_payment",
    },
    { isDeleted: true },
  );

  // ✅ DELETE INVOICE
  invoice.isDeleted = true;
  await invoice.save();

  res.status(200).json({
    success: true,
    message: "Purchase invoice and related records deleted.",
  });
});

const getAllPurchaseInvoices = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.userId;

  const invoices = await PurchaseInvoice.find({
    userId,
    isDeleted: false,
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
