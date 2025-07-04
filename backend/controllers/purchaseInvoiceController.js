const PurchaseInvoice = require("../models/purchaseInvoice");
const JournalEntry = require("../models/JournalEntry");
const Supplier = require("../models/Supplier");
const InventoryTransaction = require("../models/InventoryTransaction");
const Product = require("../models/Product");
const Account = require("../models/Account");
const asyncHandler = require("express-async-handler");
const path = require("path");
const fs = require("fs");
const { recalculateAccountBalance } = require("../utils/accountHelper");

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

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  parsedItems = parsedItems.filter(
    (i) => i.productId && i.quantity > 0 && i.price > 0
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
      type: "liability",
      category: "supplier",
      userId,
    });

    supplier = await Supplier.create({
      name: supplierName,
      phone: supplierPhone,
      account: account._id,
      userId,
    });

    console.log("👷 Supplier + Account created:", supplier.name);
  } else {
    console.log("🔍 Supplier found:", supplier.name);
  }

  if (!supplier.account) {
    return res.status(400).json({ message: "Supplier account not linked" });
  }

  // 💾 Save invoice
  const invoice = await PurchaseInvoice.create({
    billNo,
    invoiceDate,
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
    accountId: paidAmount > 0 ? accountId : null,
    attachment: attachmentPath,
    attachmentType, // ✅ New
    items: parsedItems,
    userId,
  });

  // 📘 Create Journal Entry
  const lines = [
    {
      account: supplier.account,
      type: "credit",
      amount: grandTotal,
    },
  ];

  if (paidAmount > 0 && accountId) {
    lines.push({
      account: accountId,
      type: "debit",
      amount: paidAmount,
    });
  }

  await JournalEntry.create({
    date: invoiceDate,
    time: invoiceTime || "",
    description: `Purchase Invoice #${billNo}`,
    createdBy: userId,
    sourceType: "purchase_invoice",
    referenceId: invoice._id,
    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  console.log("🧾 Journal lines created:", lines.length);

  // 📦 Update Stock
  for (const item of parsedItems) {
    const product = await Product.findById(item.productId);
    if (!product) continue;

    product.stock += item.quantity;
    await product.save();

    await InventoryTransaction.create({
      productId: item.productId,
      type: "IN",
      quantity: item.quantity,
      note: `Purchase Invoice #${billNo}`,
      invoiceId: invoice._id,
      invoiceModel: "PurchaseInvoice",
      userId,
    });
  }

  console.log("📦 Stock updated");

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
  const invoice = await PurchaseInvoice.findById(req.params.id);
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

  let parsedItems = typeof items === "string" ? JSON.parse(items) : items;
  parsedItems = parsedItems.filter(
    (i) => i.productId && i.quantity > 0 && i.price > 0
  ); // ✅ Clean only valid items

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

  // 🔁 Restore Stock
  for (const oldItem of invoice.items) {
    const product = await Product.findById(oldItem.productId);
    if (product) {
      product.stock -= oldItem.quantity;
      await product.save();
    }
  }

  await InventoryTransaction.deleteMany({
    invoiceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
  });

  await JournalEntry.deleteMany({
    referenceId: invoice._id,
    sourceType: "purchase_invoice",
  });

  const supplier = await Supplier.findOne({ name: supplierName, userId });
  if (!supplier || !supplier.account) {
    throw new Error("Supplier or account not found");
  }

  Object.assign(invoice, {
    billNo,
    invoiceDate,
    invoiceTime,
    supplier: supplier._id, // ✅ Add this in update also
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
    attachmentType, // ✅ Add this
    items: parsedItems,
  });

  await invoice.save();

  const lines = [
    {
      account: supplier.account,
      type: "credit",
      amount: grandTotal,
    },
  ];

  if (paidAmount > 0 && accountId) {
    lines.push({
      account: accountId,
      type: "debit",
      amount: paidAmount,
    });
  }

  await JournalEntry.create({
    date: invoiceDate,
    time: invoiceTime || "",
    description: `Updated Purchase Invoice #${billNo}`,
    createdBy: userId,
    sourceType: "purchase_invoice",
    referenceId: invoice._id,
    lines,
    attachmentUrl: attachmentPath,
    attachmentType,
  });

  for (const item of parsedItems) {
    const product = await Product.findById(item.productId);
    if (!product) continue;

    product.stock += item.quantity;
    await product.save();

    await InventoryTransaction.create({
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

  await invoice.deleteOne();

  await JournalEntry.deleteMany({
    referenceId: invoice._id,
    sourceType: "purchase_invoice",
  });

  await InventoryTransaction.deleteMany({
    invoiceId: invoice._id,
    invoiceModel: "PurchaseInvoice",
  });

  res.status(200).json({
    success: true,
    message: "Purchase invoice and related records deleted.",
  });
});

module.exports = {
  addPurchaseInvoice,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
};
