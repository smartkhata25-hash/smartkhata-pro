// TEMPORARY READ-ONLY recovery-candidate audit for affected Purchase Invoices.
// This module intentionally uses only find queries and returns no model documents.
const PurchaseInvoice = require("../models/PurchaseInvoice");
const JournalEntry = require("../models/JournalEntry");
const InventoryTransaction = require("../models/InventoryTransaction");
const Supplier = require("../models/Supplier");
const Party = require("../models/Party");

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

module.exports = { auditPurchaseInvoiceRecoveryCandidates };
