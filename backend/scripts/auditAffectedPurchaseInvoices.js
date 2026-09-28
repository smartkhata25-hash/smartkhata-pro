/*
 * Read-only recovery candidate audit.  This script never repairs data.
 * Usage: node scripts/auditAffectedPurchaseInvoices.js
 */
require("dotenv").config();
const mongoose = require("mongoose");
const PurchaseInvoice = require("../models/PurchaseInvoice");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");

const deletedSources = [
  "purchase_invoice",
  "opening_purchase_invoice",
  "purchase_payment",
  "purchase_discount",
];

async function audit() {
  if (process.argv.includes("--apply")) {
    throw new Error("APPLY is intentionally not implemented. This audit is dry-run only.");
  }
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is required");
  await mongoose.connect(process.env.MONGO_URI);
  const invoices = await PurchaseInvoice.find({ isDeleted: false }).lean();
  const report = [];
  for (const invoice of invoices) {
    const [deletedJournals, activeJournals, stock] = await Promise.all([
      JournalEntry.find({ referenceId: invoice._id, sourceType: { $in: deletedSources }, isDeleted: true }).lean(),
      JournalEntry.find({ referenceId: invoice._id, sourceType: { $in: deletedSources }, isDeleted: false }).lean(),
      InventoryTransaction.find({ invoiceId: invoice._id, invoiceModel: "PurchaseInvoice", userId: invoice.userId }).lean(),
    ]);
    const needsStock = !invoice.isOpening && Array.isArray(invoice.items) && invoice.items.length > 0;
    const highConfidence = deletedJournals.length > 0 && activeJournals.length === 0 && (!needsStock || stock.length === 0);
    if (!highConfidence) continue;
    report.push({
      invoiceId: String(invoice._id), billNo: invoice.billNo, userId: String(invoice.userId),
      originalEntity: invoice.partyId ? { type: "Party", id: String(invoice.partyId) } : { type: "Supplier", id: invoice.supplier ? String(invoice.supplier) : null },
      softDeletedJournalIds: deletedJournals.map((row) => String(row._id)),
      missingInventoryTransactions: needsStock ? invoice.items.length : 0,
      safeToConsiderRestoring: ["soft-deleted journals", ...(needsStock ? ["inventory from stored invoice items"] : [])],
      ambiguity: null,
    });
  }
  console.log(JSON.stringify({ mode: "DRY_RUN", candidates: report, count: report.length }, null, 2));
  await mongoose.disconnect();
}

audit().catch(async (error) => { console.error(error.message); await mongoose.disconnect(); process.exitCode = 1; });
