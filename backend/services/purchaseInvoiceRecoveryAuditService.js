// TEMPORARY READ-ONLY recovery-candidate audit for affected Purchase Invoices.
// This module intentionally uses only find queries and returns no model documents.
const PurchaseInvoice = require("../models/PurchaseInvoice");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");
const mongoose = require("mongoose");

// Explicit production approval list. No other invoice can be recovered by this code.
const APPROVED_INVOICE_IDS = new Set([
  "6a818921c2e6db83f841cd9f", "6a7d6141fbc39af163af322c", "6a7968d2ba404a9bbd412138",
  "6a68556e0753bdfbac0816c3", "6a3156ff43fe8eaf687987d5", "6a3156ce43fe8eaf6879879f",
]);

const PURCHASE_SOURCES = [
  "purchase_invoice",
  "opening_purchase_invoice",
  "purchase_payment",
  "purchase_discount",
];

const toId = (value) => (value ? String(value) : null);

async function auditPurchaseInvoiceRecoveryCandidates(userId) {
  const invoices = await PurchaseInvoice.find({ userId, isDeleted: false })
    .select("_id billNo supplier partyId supplierName isOpening items userId")
    .lean();

  const report = [];
  for (const invoice of invoices) {
    const [deletedJournals, activeJournals, inventory, supplier, party] = await Promise.all([
      JournalEntry.find({
        createdBy: userId,
        referenceId: invoice._id,
        sourceType: { $in: PURCHASE_SOURCES },
        isDeleted: true,
      }).select("_id sourceType billNo date lines").lean(),
      JournalEntry.find({
        createdBy: userId,
        referenceId: invoice._id,
        sourceType: { $in: PURCHASE_SOURCES },
        isDeleted: false,
      }).select("_id").lean(),
      InventoryTransaction.find({
        userId,
        invoiceId: invoice._id,
        invoiceModel: "PurchaseInvoice",
      }).select("_id productId quantity rate type").lean(),
      invoice.supplier ? Supplier.findOne({ _id: invoice.supplier, userId }).select("_id name").lean() : null,
      invoice.partyId ? Party.findOne({ _id: invoice.partyId, userId }).select("_id name").lean() : null,
    ]);

    const needsInventory = !invoice.isOpening && Array.isArray(invoice.items) && invoice.items.length > 0;
    const missingInventoryTransactions = needsInventory
      ? Math.max(invoice.items.length - inventory.length, 0)
      : 0;
    const hasSoftDeletedJournals = deletedJournals.length > 0;
    const hasReplacement = activeJournals.length > 0 || (needsInventory && inventory.length > 0);
    const candidate = hasSoftDeletedJournals && !hasReplacement && (!needsInventory || missingInventoryTransactions > 0);
    const reason = candidate
      ? null
      : !hasSoftDeletedJournals
        ? "No soft-deleted purchase journals found."
        : hasReplacement
          ? "Active replacement journal or inventory transaction exists; repair could duplicate accounting or stock."
          : "Invoice does not have enough stored item data to safely reconstruct inventory.";

    // Return only records related to the known failure signature, while still
    // reporting why a related record is unsafe to recover.
    if (!hasSoftDeletedJournals && missingInventoryTransactions === 0) continue;

    report.push({
      invoiceId: toId(invoice._id),
      billNo: invoice.billNo || "",
      originalEntity: invoice.partyId
        ? { type: "party", id: toId(invoice.partyId), name: party?.name || invoice.supplierName || "" }
        : { type: "supplier", id: toId(invoice.supplier), name: supplier?.name || invoice.supplierName || "" },
      softDeletedJournals: deletedJournals.map((journal) => ({
        id: toId(journal._id), sourceType: journal.sourceType, billNo: journal.billNo || "",
      })),
      missingInventoryTransactions,
      recoveryCandidateStatus: candidate ? "high_confidence_dry_run_candidate" : "not_safe_to_recover",
      ambiguity: reason,
    });
  }

  return { mode: "DRY_RUN", candidateCount: report.filter((row) => row.recoveryCandidateStatus === "high_confidence_dry_run_candidate").length, records: report };
}

async function recoverOneApprovedInvoice(userId, invoiceId) {
  if (!APPROVED_INVOICE_IDS.has(String(invoiceId))) return { invoiceId: String(invoiceId), status: "SKIPPED", reason: "Invoice is not in the approved recovery list." };
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const invoice = await PurchaseInvoice.findOne({ _id: invoiceId, userId, isDeleted: false }).session(session);
      if (!invoice || !Array.isArray(invoice.items) || (!invoice.isOpening && invoice.items.length === 0)) throw new Error("Original invoice or item snapshots are unavailable.");
      const [deletedJournals, activeJournals, inventory] = await Promise.all([
        JournalEntry.find({ createdBy: userId, referenceId: invoice._id, sourceType: { $in: PURCHASE_SOURCES }, isDeleted: true }).session(session),
        JournalEntry.find({ createdBy: userId, referenceId: invoice._id, sourceType: { $in: PURCHASE_SOURCES }, isDeleted: false }).session(session),
        InventoryTransaction.find({ userId, invoiceId: invoice._id, invoiceModel: "PurchaseInvoice" }).session(session),
      ]);
      const needsInventory = !invoice.isOpening && invoice.items.length > 0;
      if (!deletedJournals.length) throw new Error("No soft-deleted original journals found; already repaired or ambiguous.");
      if (activeJournals.length || (needsInventory && inventory.length)) throw new Error("Active replacement accounting or stock exists; skipped to avoid duplicates.");
      const hasMainJournal = deletedJournals.some((row) => ["purchase_invoice", "opening_purchase_invoice"].includes(row.sourceType));
      if (!hasMainJournal) throw new Error("Original main purchase journal is missing; cannot safely restore.");
      await JournalEntry.updateMany({ _id: { $in: deletedJournals.map((row) => row._id) }, createdBy: userId, isDeleted: true }, { $set: { isDeleted: false } }, { session });
      if (needsInventory) {
        const rows = invoice.items.map((item) => {
          if (!item.productId || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) throw new Error("Invoice item data is incomplete.");
          return { productId: item.productId, type: "IN", quantity: Number(item.quantity), rate: Number(item.price || 0), note: `Recovered Purchase Invoice #${invoice.billNo || ""}`, invoiceId: invoice._id, invoiceModel: "PurchaseInvoice", userId, date: invoice.invoiceDate };
        });
        await InventoryTransaction.insertMany(rows, { session });
      }
      result = { invoiceId: String(invoice._id), billNo: invoice.billNo || "", status: "RECOVERED", restoredJournals: deletedJournals.length, reconstructedInventoryTransactions: needsInventory ? invoice.items.length : 0 };
    });
    return result;
  } catch (error) {
    return { invoiceId: String(invoiceId), status: "SKIPPED", reason: error.message };
  } finally { await session.endSession(); }
}

async function recoverApprovedPurchaseInvoices(userId, invoiceIds = []) {
  const requested = [...new Set((Array.isArray(invoiceIds) ? invoiceIds : []).map(String))];
  if (!requested.length || requested.some((id) => !APPROVED_INVOICE_IDS.has(id))) throw new Error("Only the six explicitly approved invoice IDs may be recovered.");
  const results = [];
  for (const invoiceId of requested) results.push(await recoverOneApprovedInvoice(userId, invoiceId));
  return { results };
}

module.exports = { auditPurchaseInvoiceRecoveryCandidates, recoverApprovedPurchaseInvoices, APPROVED_INVOICE_IDS };
