const JournalEntry = require("../../models/JournalEntry");
const { recalculateAccountBalances } = require("../../utils/accountHelper");
const { createReversalEntry } = require("../../utils/journalReversal");

const collectJournalAccountIds = (journals = []) => {
  const accountIds = new Set();

  journals.forEach((journal) => {
    (journal?.lines || []).forEach((line) => {
      if (line?.account) {
        accountIds.add(String(line.account));
      }
    });
  });

  return [...accountIds];
};

const getSoftDeleteReason = (req, fallback = "") =>
  String(req?.body?.deleteReason || req?.body?.reason || req?.query?.reason || fallback || "")
    .trim();

const applySoftDeleteFields = (document, { actorId = null, reason = "" } = {}) => {
  document.isDeleted = true;
  document.isActive = false;
  document.deletedAt = new Date();
  document.deletedBy = actorId || null;
  document.deleteReason = reason || "";
};

const applyVoidFields = (document, { actorId = null, reason = "" } = {}) => {
  document.isVoided = true;
  document.voidedAt = new Date();
  document.voidedBy = actorId || null;
  document.voidReason = reason || "";
};

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const reverseTravelJournals = async ({
  userId,
  referenceId,
  originModule = "",
  sourceTypes = [],
  session = null,
  reason = "",
} = {}) => {
  const query = {
    createdBy: userId,
    referenceId,
    isDeleted: false,
    isReversed: { $ne: true },
  };

  if (originModule) {
    query.originModule = originModule;
  }

  if (sourceTypes.length > 0) {
    query.sourceType = { $in: sourceTypes };
  } else {
    query.sourceType = { $ne: "reversal" };
  }

  const journals = await getSessionQuery(
    JournalEntry.find(query).sort({ date: 1, time: 1, _id: 1 }),
    session,
  );
  const reversals = [];

  for (const journal of journals) {
    const reversal = await createReversalEntry(journal, userId, {
      session,
      originModule: journal.originModule || originModule,
      referenceId: journal.referenceId || referenceId,
      invoiceId: journal.invoiceId || null,
      invoiceModel: journal.invoiceModel || null,
      customerId: journal.customerId || null,
      supplierId: journal.supplierId || null,
      partyId: journal.partyId || null,
      billNo: journal.billNo || "",
      description: [
        "Reversal",
        journal.billNo || journal.sourceType || "journal",
        reason,
      ].filter(Boolean).join(" - "),
    });

    reversals.push(reversal);
  }

  return {
    journals,
    reversals,
    reversalIds: reversals.map((journal) => journal._id),
    accountIds: collectJournalAccountIds([...journals, ...reversals]),
  };
};

const recalculateTravelSoftDeleteAccounts = async (accountIds = []) => {
  if (!accountIds.length) {
    return;
  }

  await recalculateAccountBalances(accountIds);
};

module.exports = {
  applySoftDeleteFields,
  applyVoidFields,
  collectJournalAccountIds,
  getSoftDeleteReason,
  reverseTravelJournals,
  recalculateTravelSoftDeleteAccounts,
};
