const JournalEntry = require("../models/JournalEntry");
const {
  extractBusinessTime,
  getCurrentBusinessTimeInput,
  parseBusinessDateTime,
} = require("./businessDate");

const getSessionQuery = (query, session) => (session ? query.session(session) : query);

const createReversalEntry = async (originalEntry, userId, options = {}) => {
  if (!originalEntry?._id) {
    throw new Error("Original journal entry is required");
  }

  if (originalEntry.isReversed) {
    const existingReversal = await getSessionQuery(
      JournalEntry.findOne({
        reversalOf: originalEntry._id,
        isDeleted: false,
      }),
      options.session,
    );

    if (existingReversal) {
      return existingReversal;
    }
  }

  const rawReversalDate = options.date || new Date();
  const reversalTime =
    options.time ||
    extractBusinessTime(rawReversalDate) ||
    getCurrentBusinessTimeInput();
  const reversalDate = parseBusinessDateTime(rawReversalDate, reversalTime, {
    defaultTime: "00:00",
    label: "reversal date",
  });
  const reversedLines = originalEntry.lines.map((line) => ({
    account: line.account,
    amount: line.amount,
    type: line.type === "debit" ? "credit" : "debit",
    paymentType: line.paymentType || undefined,
  }));

  const reversalEntry = new JournalEntry({
    date: reversalDate,
    time: reversalTime,
    description:
      options.description ||
      `Reversal of ${originalEntry.sourceType || "journal"} entry`,
    note: options.note || originalEntry.note || "",
    lines: reversedLines,
    sourceType: "reversal",
    originModule:
      options.originModule !== undefined
        ? options.originModule
        : originalEntry.originModule || "",
    referenceId:
      options.referenceId !== undefined
        ? options.referenceId
        : originalEntry.referenceId || null,
    invoiceId:
      options.invoiceId !== undefined
        ? options.invoiceId
        : originalEntry.invoiceId || null,
    invoiceModel:
      options.invoiceModel !== undefined
        ? options.invoiceModel
        : originalEntry.invoiceModel || null,
    billNo: options.billNo || originalEntry.billNo || "",
    createdBy: userId,
    customerId:
      options.customerId !== undefined
        ? options.customerId
        : originalEntry.customerId || null,
    supplierId:
      options.supplierId !== undefined
        ? options.supplierId
        : originalEntry.supplierId || null,
    partyId:
      options.partyId !== undefined
        ? options.partyId
        : originalEntry.partyId || null,
    attachmentUrl: originalEntry.attachmentUrl || "",
    attachmentType: originalEntry.attachmentType || "",
    isDeleted: false,
    isReversed: false,
    reversalOf: originalEntry._id,
    isReversal: true,
  });

  const saveOptions = options.session ? { session: options.session } : undefined;

  await reversalEntry.save(saveOptions);

  originalEntry.isReversed = true;
  await originalEntry.save(saveOptions);

  return reversalEntry;
};

module.exports = { createReversalEntry };
