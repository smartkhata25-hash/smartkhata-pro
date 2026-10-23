const mongoose = require('mongoose');
const Invoice = require('../../models/InstallmentsInvoice');
const Member = require('../../models/InstallmentsMember');
const MemberLedger = require('../../models/InstallmentsLedgerEntry');
const Supplier = require('../../models/InstallmentsSupplier');
const SupplierLedger = require('../../models/InstallmentsSupplierLedgerEntry');
const Committee = require('../../models/InstallmentsCommittee');
const Product = require('../../models/InstallmentsProduct');
const Sequence = require('../../models/InstallmentsSequence');
const PaymentTransaction = require('../../models/InstallmentsPaymentTransaction');
const Allocation = require('../../models/InstallmentsPaymentAllocation');
const JournalEntry = require('../../models/JournalEntry');
const { roundMoney } = require('../../utils/money');
const { recalculateAccountBalances } = require('../../utils/accountHelper');
const { resolvePublicInvoiceNumber } = require('../../utils/installmentsInvoiceIdentity');
const { getCurrentBusinessDateKey } = require('../../utils/businessDate');
const { PAYMENT_TYPES, allocateAvailableAdvanceInSession, ensureControlAccount, postPaymentInSession, resolvePaymentAccount, reversePaymentInSession, settleCommitteeIfEligible, verifiedAvailableAdvance } = require('./installmentsPaymentService');

const nextInvoiceNumber = async (businessOwnerId, session) => { const row = await Sequence.findOneAndUpdate({ businessOwnerId, key: 'invoice' }, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true, session }); return `INV-${String(row.seq).padStart(6, '0')}`; };
const peekInvoiceNumber = async (businessOwnerId) => { const row = await Sequence.findOne({ businessOwnerId, key: 'invoice' }).select('seq').lean(); return `INV-${String(Number(row?.seq || 0) + 1).padStart(6, '0')}`; };
const calculate = (items = []) => {
  if (!Array.isArray(items) || !items.length) throw new Error('At least one invoice item is required');
  const normalized = items.map((item) => { const quantity = Number(item.quantity); const purchase = Number(item.unitPurchaseCost); const sale = Number(item.unitSalePrice); if (!String(item.productName || '').trim()) throw new Error('Product name is required'); if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be a positive whole number'); if (![purchase, sale].every(Number.isFinite) || purchase < 0 || sale <= 0) throw new Error('Invalid invoice item amount'); const costTotal = roundMoney(quantity * purchase); const saleTotal = roundMoney(quantity * sale); return { productId: mongoose.Types.ObjectId.isValid(item.productId) ? item.productId : null, supplierId: item.supplierId, category: String(item.category || '').trim(), productName: String(item.productName).trim(), brand: String(item.brand || '').trim(), model: String(item.model || '').trim(), specifications: String(item.specifications || '').trim(), quantity, unitPurchaseCost: roundMoney(purchase), unitSalePrice: roundMoney(sale), costTotal, saleTotal, grossProfit: roundMoney(saleTotal - costTotal) }; });
  const totalPurchaseCost = roundMoney(normalized.reduce((sum, item) => sum + item.costTotal, 0)); const totalSale = roundMoney(normalized.reduce((sum, item) => sum + item.saleTotal, 0)); const grossProfit = roundMoney(totalSale - totalPurchaseCost); const grossMarginPercent = totalSale ? roundMoney((grossProfit / totalSale) * 100) : 0;
  return { items: normalized, totalPurchaseCost, totalSale, grossProfit, grossMarginPercent };
};
const currentMemberBalance = async (businessOwnerId, memberId, session = null) => { const query = MemberLedger.aggregate([{ $match: { businessOwnerId: new mongoose.Types.ObjectId(businessOwnerId), memberId: new mongoose.Types.ObjectId(memberId) } }, { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }]); if (session) query.session(session); const [row] = await query; return roundMoney(Number(row?.debit || 0) - Number(row?.credit || 0)); };
const currentSupplierBalance = async (businessOwnerId, supplierId, session = null) => { const query = SupplierLedger.aggregate([{ $match: { businessOwnerId: new mongoose.Types.ObjectId(businessOwnerId), supplierId: new mongoose.Types.ObjectId(supplierId) } }, { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }]); if (session) query.session(session); const [row] = await query; return roundMoney(Number(row?.credit || 0) - Number(row?.debit || 0)); };
const validateInvoiceCommitteeSelection = async ({ businessOwnerId, memberId, committeeId, session = null }) => {
  let memberQuery = Member.findOne({ _id: memberId, businessOwnerId, isArchived: false }); if (session) memberQuery = memberQuery.session(session);
  const member = await memberQuery; if (!member) throw new Error('Active member not found');
  let committeeQuery = Committee.find({ businessOwnerId, memberId: member._id, status: 'active', isArchived: { $ne: true } }).select('_id'); if (session) committeeQuery = committeeQuery.session(session);
  const eligibleCommittees = await committeeQuery;
  if (!committeeId) { if (eligibleCommittees.length) throw new Error('Please select a committee plan for this member.'); return { member, eligibleCommittees }; }
  if (!mongoose.Types.ObjectId.isValid(committeeId) || !eligibleCommittees.some((row) => String(row._id) === String(committeeId))) throw new Error('Selected committee is unavailable or does not belong to this member');
  return { member, eligibleCommittees };
};
const validateReferences = async ({ businessOwnerId, payload, totals, session }) => {
  const { member } = await validateInvoiceCommitteeSelection({ businessOwnerId, memberId: payload.memberId, committeeId: payload.committeeId, session });
  const supplierIds = [...new Set(totals.items.map((item) => String(item.supplierId || payload.defaultSupplierId)))]; if (!supplierIds.length || supplierIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw new Error('A valid supplier is required');
  totals.items.forEach((item) => { item.supplierId = item.supplierId || payload.defaultSupplierId; }); const suppliers = await Supplier.find({ _id: { $in: supplierIds }, businessOwnerId, isArchived: false }).session(session); if (suppliers.length !== supplierIds.length) throw new Error('One or more suppliers are unavailable');
  const productIds = [...new Set(totals.items.map((item) => item.productId).filter(Boolean).map(String))]; if (productIds.length) { const count = await Product.countDocuments({ _id: { $in: productIds }, businessOwnerId, isActive: true }).session(session); if (count !== productIds.length) throw new Error('One or more products are unavailable'); }
  return { member, suppliers };
};
const validatePayments = async ({ businessOwnerId, payload, supplierIds, session }) => {
  const receipt = roundMoney(payload.customerReceiptAmount || 0); if (receipt < 0) throw new Error('Customer receipt cannot be negative');
  const supplierPayments = (payload.supplierPayments || []).filter((row) => Number(row.amount) > 0).map((row) => ({ supplierId: String(row.supplierId), accountId: String(row.accountId || ''), amount: roundMoney(row.amount) }));
  if (supplierPayments.some((row) => !supplierIds.includes(row.supplierId))) throw new Error('Supplier payment does not match the invoice');
  const accountIds = [...new Set([...(receipt > 0 ? [String(payload.customerReceiptAccountId || '')] : []), ...supplierPayments.map((row) => row.accountId)])];
  if (accountIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) throw new Error('A valid payment account is required for every actual payment');
  for (const accountId of accountIds) await resolvePaymentAccount({ businessOwnerId, accountId, session });
  return { receipt, supplierPayments };
};
const postInvoiceAccountingInSession = async ({ invoice, businessOwnerId, savingsAdvanceApplied, session }) => {
  const displayInvoiceNumber = invoice.publicInvoiceNumber || invoice.invoiceNumber;
  const [receivable, payable, sales, purchase] = await Promise.all(['receivable', 'payable', 'sales', 'purchase'].map((purpose) => ensureControlAccount({ businessOwnerId, purpose, session })));
  const [journal] = await JournalEntry.create([{
    date: new Date(`${invoice.invoiceDate}T00:00:00.000Z`), description: `Installments combined invoice ${displayInvoiceNumber}`,
    sourceType: 'sale_invoice', originModule: 'installments_invoice', moduleScope: 'installments',
    invoiceId: invoice._id, invoiceModel: 'InstallmentsInvoice', referenceId: invoice._id,
    idempotencyKey: `invoice:${invoice._id}:accounting`, createdBy: businessOwnerId,
    lines: [
      { account: receivable._id, type: 'debit', amount: invoice.totalSale },
      { account: sales._id, type: 'credit', amount: invoice.totalSale },
      { account: purchase._id, type: 'debit', amount: invoice.totalPurchaseCost },
      { account: payable._id, type: 'credit', amount: invoice.totalPurchaseCost },
    ],
  }], { session });
  let advanceJournal = null;
  if (savingsAdvanceApplied > 0) {
    const savings = await ensureControlAccount({ businessOwnerId, purpose: 'savings', session });
    [advanceJournal] = await JournalEntry.create([{
      date: new Date(`${invoice.invoiceDate}T00:00:00.000Z`), description: `Advance applied to ${displayInvoiceNumber}`,
      sourceType: 'installments_advance_allocation', originModule: 'installments_invoice', moduleScope: 'installments',
      invoiceId: invoice._id, invoiceModel: 'InstallmentsInvoice', referenceId: invoice._id,
      idempotencyKey: `invoice:${invoice._id}:advance-accounting`, createdBy: businessOwnerId,
      lines: [{ account: savings._id, type: 'debit', amount: savingsAdvanceApplied }, { account: receivable._id, type: 'credit', amount: savingsAdvanceApplied }],
    }], { session });
  }
  const accountIds = [receivable._id, payable._id, sales._id, purchase._id, ...(advanceJournal ? advanceJournal.lines.map((line) => line.account) : [])];
  await recalculateAccountBalances(accountIds, session);
  return { journal, advanceJournal };
};
const reverseJournalInSession = async ({ journal, businessOwnerId, actorId, reason, key, session }) => {
  const [reversal] = await JournalEntry.create([{
    date: new Date(), description: `Reversal of ${journal.description}`, note: reason, sourceType: 'reversal',
    originModule: 'installments_invoice', moduleScope: 'installments', referenceId: journal.referenceId,
    idempotencyKey: key, createdBy: businessOwnerId, reversalOf: journal._id, isReversal: true,
    lines: journal.lines.map((line) => ({ account: line.account, type: line.type === 'debit' ? 'credit' : 'debit', amount: line.amount })),
  }], { session });
  journal.isReversed = true; await journal.save({ session });
  await recalculateAccountBalances(journal.lines.map((line) => line.account), session);
  return reversal;
};
const postInvoiceInSession = async ({ invoice, businessOwnerId, actorId, session }) => {
    const displayInvoiceNumber = await resolvePublicInvoiceNumber(invoice, businessOwnerId, session);
    invoice.publicInvoiceNumber = displayInvoiceNumber;
    const totals = calculate(invoice.items); const { member, suppliers } = await validateReferences({ businessOwnerId, payload: invoice, totals, session }); const supplierIds = suppliers.map((row) => String(row._id)); const payments = await validatePayments({ businessOwnerId, payload: invoice, supplierIds, session });
    let memberBalance = await currentMemberBalance(businessOwnerId, member._id, session); const verifiedAdvance = await verifiedAvailableAdvance(businessOwnerId, member._id, session, invoice.committeeId || null); const existingAdvanceApplied = roundMoney(Math.min(verifiedAdvance, totals.totalSale));
    const advanceAllocations = existingAdvanceApplied > 0 ? await allocateAvailableAdvanceInSession({ businessOwnerId, memberId: member._id, invoiceId: invoice._id, committeeId: invoice.committeeId, amount: existingAdvanceApplied, actorId, session }) : [];
    const sourceEntries = advanceAllocations.length ? await MemberLedger.find({ _id: { $in: advanceAllocations.map((row) => row.sourceLedgerEntryId) } }).select('_id paymentTransactionId').session(session) : [];
    const advanceTransactionIds = sourceEntries.map((row) => row.paymentTransactionId).filter(Boolean);
    const advanceTransactions = advanceTransactionIds.length ? await PaymentTransaction.find({ _id: { $in: advanceTransactionIds }, businessOwnerId, status: 'posted', advanceAmount: { $gt: 0 } }).select('_id').session(session) : [];
    const accountedSourceIds = new Set(sourceEntries.filter((row) => advanceTransactions.some((tx) => String(tx._id) === String(row.paymentTransactionId))).map((row) => String(row._id)));
    const accountedAdvanceApplied = roundMoney(advanceAllocations.filter((row) => accountedSourceIds.has(String(row.sourceLedgerEntryId))).reduce((sum, row) => sum + Number(row.amount || 0), 0));
    memberBalance = roundMoney(memberBalance + totals.totalSale);
    await MemberLedger.create([{ businessOwnerId, memberId: member._id, entryDate: invoice.invoiceDate, sourceType: 'sale_invoice', referenceNumber: displayInvoiceNumber, description: `Installment Sale ${displayInvoiceNumber}`, debit: totals.totalSale, credit: 0, signedAmountAfter: memberBalance, idempotencyKey: `invoice:${invoice._id}:sale`, createdBy: actorId, invoiceId: invoice._id, committeeId: invoice.committeeId || null }], { session });
    if (payments.receipt > 0) { const invoiceAllocation = Math.min(payments.receipt, Math.max(0, roundMoney(totals.totalSale - existingAdvanceApplied))); await postPaymentInSession({ businessOwnerId, actorId, transactionType: PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT, transactionDate: invoice.invoiceDate, amount: payments.receipt, accountId: invoice.customerReceiptAccountId, memberId: member._id, invoiceId: invoice._id, committeeId: invoice.committeeId || null, referenceNumber: `${displayInvoiceNumber}-RCPT`, idempotencyKey: `invoice:${invoice._id}:receipt`, description: `Invoice Receipt ${displayInvoiceNumber}`, allocations: invoiceAllocation > 0 ? [{ invoiceId: invoice._id, committeeId: invoice.committeeId || null, amount: invoiceAllocation }] : [] }, session); }
    const costs = new Map(); totals.items.forEach((item) => costs.set(String(item.supplierId), roundMoney((costs.get(String(item.supplierId)) || 0) + item.costTotal)));
    for (const [supplierId, cost] of costs) { let balance = await currentSupplierBalance(businessOwnerId, supplierId, session); balance = roundMoney(balance + cost); await SupplierLedger.create([{ businessOwnerId, supplierId, entryDate: invoice.invoiceDate, sourceType: 'purchase_invoice', referenceNumber: displayInvoiceNumber, description: `Installments Purchase ${displayInvoiceNumber}`, debit: 0, credit: cost, signedAmountAfter: balance, idempotencyKey: `invoice:${invoice._id}:purchase:${supplierId}`, createdBy: actorId, invoiceId: invoice._id }], { session }); const payment = payments.supplierPayments.find((row) => row.supplierId === supplierId); if (payment) await postPaymentInSession({ businessOwnerId, actorId, transactionType: PAYMENT_TYPES.INVOICE_SUPPLIER_PAYMENT, transactionDate: invoice.invoiceDate, amount: payment.amount, accountId: payment.accountId, supplierId, invoiceId: invoice._id, referenceNumber: `${displayInvoiceNumber}-PAY-${supplierId.slice(-6)}`, idempotencyKey: `invoice:${invoice._id}:supplier-payment:${supplierId}`, description: `Supplier Payment ${displayInvoiceNumber}` }, session); }
    memberBalance = await currentMemberBalance(businessOwnerId, member._id, session);
    const accounting = await postInvoiceAccountingInSession({ invoice: Object.assign(invoice, totals), businessOwnerId, savingsAdvanceApplied: accountedAdvanceApplied, session });
    Object.assign(invoice, totals, { existingAdvanceApplied, accountedAdvanceApplied, legacyAdvanceApplied: 0, customerBalanceAfter: memberBalance, supplierPayments: payments.supplierPayments, accountingJournalEntryId: accounting.journal._id, advanceAllocationJournalEntryId: accounting.advanceJournal?._id || null, status: 'posted', accountingStatus: 'posted', postedAt: new Date(), postedBy: actorId, updatedBy: actorId });
    await invoice.save({ session });
    await settleCommitteeIfEligible({ businessOwnerId, memberId: member._id, committeeId: invoice.committeeId, actorId, session });
    return invoice;
};
const postInvoice = async ({ invoiceId, businessOwnerId, actorId }) => {
  const session = await mongoose.startSession(); let posted;
  try { await session.withTransaction(async () => {
    const invoice = await Invoice.findOne({ _id: invoiceId, businessOwnerId, status: 'draft', accountingStatus: 'unposted' }).session(session); if (!invoice) throw new Error('Invoice is already posted or unavailable');
    posted = await postInvoiceInSession({ invoice, businessOwnerId, actorId, session });
  }); return posted; } finally { await session.endSession(); }
};
const createAndPostInvoice = async ({ businessOwnerId, actorId, invoiceData, idempotencyKey }) => {
  const existing = await Invoice.findOne({ businessOwnerId, creationIdempotencyKey: idempotencyKey });
  if (existing) return { invoice: existing, replayed: true };
  const session = await mongoose.startSession(); let posted;
  try {
    await session.withTransaction(async () => {
      const invoiceNumber = await nextInvoiceNumber(businessOwnerId, session);
      const [invoice] = await Invoice.create([{ businessOwnerId, invoiceNumber, publicInvoiceNumber: invoiceNumber, ...invoiceData, creationIdempotencyKey: idempotencyKey, status: 'draft', accountingStatus: 'unposted', createdBy: actorId, updatedBy: actorId }], { session });
      posted = await postInvoiceInSession({ invoice, businessOwnerId, actorId, session });
    });
    return { invoice: posted, replayed: false };
  } catch (error) {
    if (error?.code === 11000) {
      const replay = await Invoice.findOne({ businessOwnerId, creationIdempotencyKey: idempotencyKey });
      if (replay) return { invoice: replay, replayed: true };
    }
    throw error;
  } finally { await session.endSession(); }
};
const reverseInvoiceInSession = async ({ invoiceId, businessOwnerId, actorId, reason, session }) => {
  const cleanReason = String(reason || '').trim(); if (!cleanReason) throw new Error('A reversal reason is required');
  let reversed;
    const invoice = await Invoice.findOneAndUpdate({ _id: invoiceId, businessOwnerId, status: 'posted', accountingStatus: 'posted' }, { $set: { accountingStatus: 'reversing' } }, { new: true, session });
    if (!invoice) { const existing = await Invoice.findOne({ _id: invoiceId, businessOwnerId }).session(session); if (existing?.accountingStatus === 'reversed') throw new Error('Invoice was already reversed'); throw new Error('Posted invoice not found'); }
    if (!invoice.accountingJournalEntryId) throw new Error('Legacy invoice requires explicit account reconciliation before reversal');
    const invoiceJournal = await JournalEntry.findOne({ _id: invoice.accountingJournalEntryId, createdBy: businessOwnerId, moduleScope: 'installments', isDeleted: false, isReversed: { $ne: true } }).session(session); if (!invoiceJournal) throw new Error('Invoice accounting journal is unavailable for reversal');
    const payments = await PaymentTransaction.find({ businessOwnerId, invoiceId: invoice._id, status: 'posted', transactionType: { $in: [PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT, PAYMENT_TYPES.INVOICE_SUPPLIER_PAYMENT] } }).session(session);
    const expectedPayments = (invoice.customerReceiptAmount > 0 ? 1 : 0) + invoice.supplierPayments.filter((row) => Number(row.amount) > 0).length;
    if (payments.length !== expectedPayments) throw new Error('Legacy invoice payments require explicit account reconciliation before this invoice can be reversed');
    const dependentPayments = await PaymentTransaction.countDocuments({ businessOwnerId, invoiceId: invoice._id, status: 'posted', transactionType: { $nin: [PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT, PAYMENT_TYPES.INVOICE_SUPPLIER_PAYMENT] } }).session(session);
    const activeAllocations = await Allocation.find({ businessOwnerId, invoiceId: invoice._id, status: 'allocated' }).select('allocationType paymentTransactionId').session(session);
    const generatedPaymentIds = new Set(payments.map((row) => String(row._id)));
    const hasExternalAllocation = activeAllocations.some((row) => row.allocationType !== 'advance_to_invoice' && (!row.paymentTransactionId || !generatedPaymentIds.has(String(row.paymentTransactionId))));
    if (dependentPayments > 0 || hasExternalAllocation) throw new Error('Invoice has subsequent linked payments or allocations. Reverse those dependencies before cancelling or correcting this invoice.');
    for (const payment of payments) await reversePaymentInSession({ businessOwnerId, transactionId: payment._id, actorId, reason: cleanReason, allowedInvoiceId: invoice._id, session });
    await reverseJournalInSession({ journal: invoiceJournal, businessOwnerId, actorId, reason: cleanReason, key: `invoice:${invoice._id}:reversal:accounting`, session });
    if (invoice.advanceAllocationJournalEntryId) { const advanceJournal = await JournalEntry.findOne({ _id: invoice.advanceAllocationJournalEntryId, createdBy: businessOwnerId, moduleScope: 'installments', isDeleted: false, isReversed: { $ne: true } }).session(session); if (!advanceJournal) throw new Error('Advance allocation journal is unavailable for reversal'); await reverseJournalInSession({ journal: advanceJournal, businessOwnerId, actorId, reason: cleanReason, key: `invoice:${invoice._id}:reversal:advance-accounting`, session }); }
    await Allocation.updateMany({ businessOwnerId, invoiceId: invoice._id, allocationType: 'advance_to_invoice', status: 'allocated' }, { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: actorId } }, { session });
    let memberBalance = await currentMemberBalance(businessOwnerId, invoice.memberId, session); memberBalance = roundMoney(memberBalance - invoice.totalSale);
    const displayInvoiceNumber = await resolvePublicInvoiceNumber(invoice, businessOwnerId, session);
    await MemberLedger.create([{ businessOwnerId, memberId: invoice.memberId, entryDate: getCurrentBusinessDateKey(), sourceType: 'invoice_reversal', referenceNumber: `REV-${displayInvoiceNumber}`, description: `Reversal of ${displayInvoiceNumber}`, debit: 0, credit: invoice.totalSale, signedAmountAfter: memberBalance, idempotencyKey: `invoice:${invoice._id}:reversal:sale`, createdBy: actorId, invoiceId: invoice._id, committeeId: invoice.committeeId || null }], { session });
    const costs = new Map(); invoice.items.forEach((item) => costs.set(String(item.supplierId), roundMoney((costs.get(String(item.supplierId)) || 0) + Number(item.costTotal || 0))));
    for (const [supplierId, cost] of costs) { let balance = await currentSupplierBalance(businessOwnerId, supplierId, session); balance = roundMoney(balance - cost); await SupplierLedger.create([{ businessOwnerId, supplierId, entryDate: getCurrentBusinessDateKey(), sourceType: 'invoice_reversal', referenceNumber: `REV-${displayInvoiceNumber}`, description: `Reversal of ${displayInvoiceNumber}`, debit: cost, credit: 0, signedAmountAfter: balance, idempotencyKey: `invoice:${invoice._id}:reversal:purchase:${supplierId}`, createdBy: actorId, invoiceId: invoice._id }], { session }); }
    Object.assign(invoice, { status: 'cancelled', accountingStatus: 'reversed', reversedAt: new Date(), reversedBy: actorId, reversalReason: cleanReason, updatedBy: actorId }); await invoice.save({ session });
    if (invoice.committeeId) await Committee.updateOne({ _id: invoice.committeeId, businessOwnerId, closureType: 'settled' }, { $set: { status: 'active', closureType: '', closedAt: null, closedBy: null, closeReason: '', updatedBy: actorId } }, { session });
    reversed = invoice;
  return reversed;
};
const reverseInvoice = async ({ invoiceId, businessOwnerId, actorId, reason }) => {
  const session = await mongoose.startSession(); let reversed;
  try { await session.withTransaction(async () => { reversed = await reverseInvoiceInSession({ invoiceId, businessOwnerId, actorId, reason, session }); }); return reversed; } finally { await session.endSession(); }
};
const correctInvoice = async ({ invoiceId, businessOwnerId, actorId, reason, invoiceData, idempotencyKey }) => {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('A correction reason is required');
  if (!String(idempotencyKey || '').trim()) throw new Error('A correction idempotency key is required');
  const replay = await Invoice.findOne({ businessOwnerId, creationIdempotencyKey: idempotencyKey });
  if (replay) return { original: await Invoice.findOne({ _id: replay.correctsInvoiceId, businessOwnerId }), replacement: replay, replayed: true };
  const session = await mongoose.startSession(); let original; let replacement;
  try {
    await session.withTransaction(async () => {
      original = await Invoice.findOne({ _id: invoiceId, businessOwnerId, status: 'posted', accountingStatus: 'posted', correctedByInvoiceId: null }).session(session);
      if (!original) throw new Error('Only an active posted invoice can be corrected');
      const totals = calculate(invoiceData.items);
      const invoiceNumber = await nextInvoiceNumber(businessOwnerId, session);
      const publicInvoiceNumber = await resolvePublicInvoiceNumber(original, businessOwnerId, session);
      [replacement] = await Invoice.create([{ businessOwnerId, invoiceNumber, publicInvoiceNumber, ...invoiceData, ...totals, creationIdempotencyKey: idempotencyKey, status: 'draft', accountingStatus: 'unposted', correctsInvoiceId: original._id, correctionReason: cleanReason, createdBy: actorId, updatedBy: actorId }], { session });
      original = await reverseInvoiceInSession({ invoiceId: original._id, businessOwnerId, actorId, reason: cleanReason, session });
      replacement = await postInvoiceInSession({ invoice: replacement, businessOwnerId, actorId, session });
      original.correctedByInvoiceId = replacement._id;
      await original.save({ session });
    });
    return { original, replacement, replayed: false };
  } finally { await session.endSession(); }
};
module.exports = { calculate, correctInvoice, createAndPostInvoice, currentMemberBalance, nextInvoiceNumber, peekInvoiceNumber, postInvoice, reverseInvoice, reverseInvoiceInSession, validateInvoiceCommitteeSelection, validateReferences, validatePayments };
