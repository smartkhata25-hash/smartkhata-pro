const mongoose = require('mongoose');
const Account = require('../../models/Account');
const JournalEntry = require('../../models/JournalEntry');
const LegacyPaymentAccount = require('../../models/InstallmentsPaymentAccount');
const AccountEntry = require('../../models/InstallmentsAccountEntry');
const PaymentTransaction = require('../../models/InstallmentsPaymentTransaction');
const Allocation = require('../../models/InstallmentsPaymentAllocation');
const Member = require('../../models/InstallmentsMember');
const Supplier = require('../../models/InstallmentsSupplier');
const Committee = require('../../models/InstallmentsCommittee');
const MemberLedger = require('../../models/InstallmentsLedgerEntry');
const SupplierLedger = require('../../models/InstallmentsSupplierLedgerEntry');
const { roundMoney } = require('../../utils/money');
const { recalculateAccountBalances } = require('../../utils/accountHelper');
const { getCurrentBusinessDateKey } = require('../../utils/businessDate');
const { buildScheduleDues } = require('./installmentsScheduleService');
const { nextNumber } = require('./installmentsMemberService');

const PAYMENT_TYPES = Object.freeze({
  CUSTOMER_RECEIPT: 'customer_receipt',
  CUSTOMER_ADVANCE: 'customer_advance',
  SUPPLIER_PAYMENT: 'supplier_payment',
  SAVINGS_PAYOUT: 'committee_savings_payout',
  INVOICE_CUSTOMER_RECEIPT: 'invoice_customer_receipt',
  INVOICE_SUPPLIER_PAYMENT: 'invoice_supplier_payment',
});
const CUSTOMER_IN = new Set([PAYMENT_TYPES.CUSTOMER_RECEIPT, PAYMENT_TYPES.CUSTOMER_ADVANCE, PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT]);
const SUPPLIER_OUT = new Set([PAYMENT_TYPES.SUPPLIER_PAYMENT, PAYMENT_TYPES.INVOICE_SUPPLIER_PAYMENT]);
const PAYMENT_CATEGORIES = ['cash', 'bank', 'online', 'cheque'];
const sessionOptions = (session) => (session ? { session } : {});
const querySession = (query, session) => (session ? query.session(session) : query);
const id = (value) => String(value || '');

const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const paymentModeForAccount = (account) => {
  const code = String(account?.code || '').trim().toUpperCase();
  if (code === 'JAZZCASH') return 'jazzcash';
  if (code === 'EASYPAISA') return 'easypaisa';
  if (account?.category === 'cash') return 'cash';
  if (account?.category === 'bank') return 'bank_transfer';
  if (account?.category === 'cheque') return 'cheque';
  if (account?.category === 'online') return 'other';
  throw fail('The selected payment account does not have a supported payment category', 409);
};

const resolvePaymentAccount = async ({ businessOwnerId, accountId, session }) => {
  if (!mongoose.Types.ObjectId.isValid(accountId)) throw fail('A valid payment account is required');
  let account = await querySession(Account.findOne({
    _id: accountId,
    userId: businessOwnerId,
    moduleScope: { $in: ['installments', 'shared'] },
    type: 'Asset',
    category: { $in: PAYMENT_CATEGORIES },
    isActive: { $ne: false },
  }), session);
  if (account) return { account, legacyPaymentAccountId: null };

  const legacy = await querySession(LegacyPaymentAccount.findOne({ _id: accountId, businessOwnerId, isActive: true }), session);
  if (!legacy) throw fail('Payment account is unavailable or belongs to another business', 404);
  if (!legacy.sharedAccountId) throw fail('This legacy Installments account must be explicitly mapped to a shared Account before it can post new money', 409);
  account = await querySession(Account.findOne({
    _id: legacy.sharedAccountId, userId: businessOwnerId, moduleScope: { $in: ['installments', 'shared'] },
    type: 'Asset', category: { $in: PAYMENT_CATEGORIES }, isActive: { $ne: false },
  }), session);
  if (!account) throw fail('The mapped shared payment account is unavailable', 409);
  return { account, legacyPaymentAccountId: legacy._id };
};

const ensureControlAccount = async ({ businessOwnerId, purpose, session }) => {
  const configs = {
    receivable: { code: 'INSTALLMENTS_RECEIVABLE', name: 'Installments Member Receivable', type: 'Asset', category: 'receivable', normalBalance: 'debit' },
    payable: { code: 'INSTALLMENTS_SUPPLIER_PAYABLE', name: 'Installments Supplier Payable', type: 'Liability', category: 'payable', normalBalance: 'credit' },
    savings: { code: 'INSTALLMENTS_MEMBER_SAVINGS', name: 'Installments Member Savings', type: 'Liability', category: 'credit', normalBalance: 'credit' },
    sales: { code: 'INSTALLMENTS_SALES', name: 'Installments Sales', type: 'Income', category: 'sales', normalBalance: 'credit' },
    purchase: { code: 'INSTALLMENTS_PURCHASE_COST', name: 'Installments Purchase Cost', type: 'Expense', category: 'purchase', normalBalance: 'debit' },
  };
  const config = configs[purpose];
  if (!config) throw fail('Invalid Installments control account purpose');
  return Account.findOneAndUpdate(
    { userId: businessOwnerId, moduleScope: 'installments', code: config.code },
    { $setOnInsert: { userId: businessOwnerId, moduleScope: 'installments', ...config, openingBalance: 0, isSystem: true, isActive: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true, ...sessionOptions(session) },
  );
};

const memberBalance = async (businessOwnerId, memberId, session) => {
  const rows = await MemberLedger.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), memberId: new mongoose.Types.ObjectId(id(memberId)) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]).session(session || null);
  return roundMoney(Number(rows[0]?.debit || 0) - Number(rows[0]?.credit || 0));
};
const scopedMemberBalance = async (businessOwnerId, memberId, committeeId, session) => {
  const rows = await MemberLedger.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), memberId: new mongoose.Types.ObjectId(id(memberId)), committeeId: committeeId ? new mongoose.Types.ObjectId(id(committeeId)) : null } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]).session(session || null);
  return roundMoney(Number(rows[0]?.debit || 0) - Number(rows[0]?.credit || 0));
};

const committeeDuesThrough = (committee, date) => {
  const revisions = Array.isArray(committee.scheduleHistory) && committee.scheduleHistory.length
    ? committee.scheduleHistory
    : [{ effectiveFrom: committee.schedule.startDate, effectiveTo: '', targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount, schedule: committee.schedule, status: committee.status }];
  const byKey = new Map();
  revisions.forEach((revision) => {
    if (revision.status !== 'active' || revision.effectiveFrom > date) return;
    const throughDate = revision.effectiveTo && revision.effectiveTo < date ? revision.effectiveTo : date;
    buildScheduleDues({ committee: { _id: committee._id, targetAmount: revision.targetAmount, contributionAmount: revision.contributionAmount, schedule: revision.schedule }, throughDate })
      .filter((due) => due.dueDate >= revision.effectiveFrom && (!revision.effectiveTo || due.dueDate <= revision.effectiveTo))
      .forEach((due) => byKey.set(due.dueKey, due));
  });
  return [...byKey.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.installmentNumber - b.installmentNumber);
};

const buildAutomaticReceiptPlan = async ({ businessOwnerId, memberId, committeeId, amount, transactionDate, session }) => {
  const member = await querySession(Member.findOne({ _id: memberId, businessOwnerId, isArchived: false, status: 'active' }), session);
  if (!member) throw fail('Active member not found', 404);
  const committees = await querySession(Committee.find({ businessOwnerId, memberId, status: 'active', isArchived: { $ne: true } }).sort({ committeeNumber: 1 }), session);
  let committee = null;
  if (committeeId) {
    committee = committees.find((row) => id(row._id) === id(committeeId)) || null;
    if (!committee) throw fail('Selected committee is not active or does not belong to this member', 409);
  } else if (committees.length === 1) committee = committees[0];
  else if (committees.length > 1) throw fail('Select the committee for this receipt. Automatic allocation cannot safely choose between multiple active committees.', 409);

  const Invoice = mongoose.model('InstallmentsInvoice');
  const invoices = await querySession(Invoice.find({
    businessOwnerId, memberId, status: 'posted', accountingStatus: 'posted', committeeId: committee?._id || null,
  }).select('_id invoiceNumber invoiceDate totalSale existingAdvanceApplied').sort({ invoiceDate: 1, createdAt: 1, _id: 1 }), session);
  const invoiceIds = invoices.map((row) => row._id);
  const allocatedRows = invoiceIds.length ? await Allocation.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), invoiceId: { $in: invoiceIds }, status: 'allocated' } },
    { $group: { _id: '$invoiceId', amount: { $sum: '$amount' }, advanceAmount: { $sum: { $cond: [{ $eq: ['$allocationType', 'advance_to_invoice'] }, '$amount', 0] } } } },
  ]).session(session || null) : [];
  const paidByInvoice = new Map(allocatedRows.map((row) => [id(row._id), { amount: roundMoney(row.amount), advanceAmount: roundMoney(row.advanceAmount) }]));
  const outstanding = invoices.map((invoice) => { const paid = paidByInvoice.get(id(invoice._id)) || { amount: 0, advanceAmount: 0 }; const applied = roundMoney(paid.amount + Math.max(0, Number(invoice.existingAdvanceApplied || 0) - paid.advanceAmount)); return { invoice, amount: Math.max(0, roundMoney(invoice.totalSale - applied)) }; }).filter((row) => row.amount > 0.005);
  const relevantReceivable = roundMoney(outstanding.reduce((sum, row) => sum + row.amount, 0));
  const scopedBalance = await scopedMemberBalance(businessOwnerId, memberId, committee?._id || null, session);
  if (Math.max(0, scopedBalance) > relevantReceivable + 0.005) throw fail('This receipt cannot be allocated safely because the selected context contains receivable without sufficient posted-invoice references. Reconcile the member ledger first.', 409);

  let remainingInvoice = amount;
  const invoiceParts = [];
  outstanding.forEach((row) => {
    const applied = Math.min(row.amount, remainingInvoice);
    if (applied > 0.005) { invoiceParts.push({ invoiceId: row.invoice._id, amount: roundMoney(applied) }); remainingInvoice = roundMoney(remainingInvoice - applied); }
  });

  const scheduleParts = [];
  if (committee) {
    const dues = committeeDuesThrough(committee, transactionDate);
    const dueKeys = dues.map((row) => row.dueKey);
    const scheduledRows = dueKeys.length ? await Allocation.aggregate([
      { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), scheduledDueKey: { $in: dueKeys }, allocationType: 'payment_to_schedule', status: 'allocated' } },
      { $group: { _id: '$scheduledDueKey', amount: { $sum: '$amount' } } },
    ]).session(session || null) : [];
    const paidByDue = new Map(scheduledRows.map((row) => [row._id, roundMoney(row.amount)]));
    let remainingSchedule = amount;
    dues.forEach((due) => {
      const dueRemaining = Math.max(0, roundMoney(due.amount - Number(paidByDue.get(due.dueKey) || 0)));
      const applied = Math.min(dueRemaining, remainingSchedule);
      if (applied > 0.005) { scheduleParts.push({ committeeId: committee._id, scheduledDueKey: due.dueKey, amount: roundMoney(applied) }); remainingSchedule = roundMoney(remainingSchedule - applied); }
    });
  }

  const allocations = []; let invoiceIndex = 0; let scheduleIndex = 0;
  while (invoiceIndex < invoiceParts.length || scheduleIndex < scheduleParts.length) {
    const invoicePart = invoiceParts[invoiceIndex]; const schedulePart = scheduleParts[scheduleIndex];
    if (invoicePart && schedulePart) {
      const applied = Math.min(invoicePart.amount, schedulePart.amount);
      allocations.push({ invoiceId: invoicePart.invoiceId, committeeId: committee._id, scheduledDueKey: schedulePart.scheduledDueKey, amount: roundMoney(applied) });
      invoicePart.amount = roundMoney(invoicePart.amount - applied); schedulePart.amount = roundMoney(schedulePart.amount - applied);
      if (invoicePart.amount <= 0.005) invoiceIndex += 1; if (schedulePart.amount <= 0.005) scheduleIndex += 1;
    } else if (invoicePart) { allocations.push({ invoiceId: invoicePart.invoiceId, committeeId: committee?._id || null, amount: invoicePart.amount }); invoiceIndex += 1; }
    else { allocations.push(schedulePart); scheduleIndex += 1; }
  }
  const allocatedInvoiceIds = [...new Set(allocations.map((row) => row.invoiceId).filter(Boolean).map(id))];
  if (allocatedInvoiceIds.length) await Invoice.updateMany({ _id: { $in: allocatedInvoiceIds }, businessOwnerId, memberId }, { $inc: { __v: 1 } }, { session });
  if (committee && allocations.some((row) => row.scheduledDueKey)) await Committee.updateOne({ _id: committee._id, businessOwnerId, memberId, status: 'active' }, { $inc: { __v: 1 } }, { session });
  const receivableAmount = Math.min(amount, relevantReceivable);
  return { committeeId: committee?._id || null, allocations, receivableAmount: roundMoney(receivableAmount), advanceAmount: roundMoney(amount - receivableAmount), relevantReceivable };
};
const supplierBalance = async (businessOwnerId, supplierId, session) => {
  const rows = await SupplierLedger.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), supplierId: new mongoose.Types.ObjectId(id(supplierId)) } },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]).session(session || null);
  return roundMoney(Number(rows[0]?.credit || 0) - Number(rows[0]?.debit || 0));
};

const verifiedAvailableAdvance = async (businessOwnerId, memberId, session, committeeId = null) => {
  const match = {
    businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)),
    memberId: new mongoose.Types.ObjectId(id(memberId)),
    status: 'posted',
  };
  if (committeeId) match.committeeId = new mongoose.Types.ObjectId(id(committeeId));
  const [advances, payouts, allocations] = await Promise.all([
    PaymentTransaction.aggregate([
      { $match: { ...match, transactionType: { $in: [PAYMENT_TYPES.CUSTOMER_ADVANCE, PAYMENT_TYPES.CUSTOMER_RECEIPT, PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT] } } },
      { $group: { _id: null, amount: { $sum: '$advanceAmount' } } },
    ]).session(session || null),
    PaymentTransaction.aggregate([
      { $match: { ...match, transactionType: PAYMENT_TYPES.SAVINGS_PAYOUT } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]).session(session || null),
    Allocation.aggregate([
      { $match: { businessOwnerId: match.businessOwnerId, memberId: match.memberId, allocationType: 'advance_to_invoice', status: 'allocated', ...(committeeId ? { committeeId: match.committeeId } : {}) } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]).session(session || null),
  ]);
  const sourcedCredit = Math.max(0, roundMoney(Number(advances[0]?.amount || 0) - Number(payouts[0]?.amount || 0) - Number(allocations[0]?.amount || 0)));
  const netMemberCredit = Math.max(0, roundMoney(-(await memberBalance(businessOwnerId, memberId, session))));
  return Math.min(sourcedCredit, netMemberCredit);
};

const settleCommitteeIfEligible = async ({ businessOwnerId, memberId, committeeId, actorId, session }) => {
  if (!committeeId) return false;
  const committee = await querySession(Committee.findOne({
    _id: committeeId, businessOwnerId, memberId, status: 'active', isArchived: { $ne: true },
  }), session);
  if (!committee) return false;
  const scheduled = await Allocation.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), committeeId: committee._id, allocationType: 'payment_to_schedule', status: 'allocated' } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]).session(session || null);
  if (roundMoney(scheduled[0]?.amount || 0) + 0.005 < roundMoney(committee.targetAmount)) return false;
  if ((await verifiedAvailableAdvance(businessOwnerId, memberId, session, committeeId)) > 0.005) return false;
  const Invoice = mongoose.model('InstallmentsInvoice');
  const invoices = await querySession(Invoice.find({ businessOwnerId, committeeId, status: 'posted', accountingStatus: 'posted' }).select('_id totalSale'), session);
  if (invoices.length) {
    const applied = await Allocation.aggregate([
      { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), invoiceId: { $in: invoices.map((row) => row._id) }, status: 'allocated' } },
      { $group: { _id: '$invoiceId', amount: { $sum: '$amount' } } },
    ]).session(session || null);
    const appliedByInvoice = new Map(applied.map((row) => [id(row._id), roundMoney(row.amount)]));
    const outstanding = invoices.some((invoice) => roundMoney(invoice.totalSale - Number(appliedByInvoice.get(id(invoice._id)) || 0)) > 0.005);
    if (outstanding) return false;
  }
  Object.assign(committee, {
    status: 'closed', closureType: 'settled', closedAt: new Date(), closedBy: actorId,
    closeReason: 'Automatically settled after target completion and verified financial clearance', updatedBy: actorId,
  });
  await committee.save({ session });
  return true;
};

const validatePartyReferences = async (payload, session) => {
  const { businessOwnerId, transactionType, memberId, supplierId, committeeId } = payload;
  if (CUSTOMER_IN.has(transactionType) || transactionType === PAYMENT_TYPES.SAVINGS_PAYOUT) {
    const member = await querySession(Member.findOne({ _id: memberId, businessOwnerId, isArchived: false }), session);
    if (!member) throw fail('Active member not found', 404);
    if (committeeId) {
      const criteria = { _id: committeeId, memberId, businessOwnerId };
      if (transactionType === PAYMENT_TYPES.SAVINGS_PAYOUT) Object.assign(criteria, { status: 'active', isArchived: { $ne: true } });
      const committee = await querySession(Committee.findOne(criteria), session);
      if (!committee) throw fail('Committee does not belong to this member', 409);
    }
  } else if (SUPPLIER_OUT.has(transactionType)) {
    const supplier = await querySession(Supplier.findOne({ _id: supplierId, businessOwnerId, isArchived: false }), session);
    if (!supplier) throw fail('Active supplier not found', 404);
  } else throw fail('Unsupported Installments payment type');
  if (payload.invoiceId) {
    const Invoice = mongoose.model('InstallmentsInvoice');
    const invoice = await querySession(Invoice.findOne({ _id: payload.invoiceId, businessOwnerId }), session);
    if (!invoice) throw fail('Referenced invoice is unavailable or belongs to another business', 404);
    if (payload.memberId && id(invoice.memberId) !== id(payload.memberId)) throw fail('Invoice does not belong to the selected member', 409);
  }
};

const createAllocations = async ({ transaction, allocations = [], actorId, session }) => {
  let allocated = 0;
  const created = [];
  for (let index = 0; index < allocations.length; index += 1) {
    const row = allocations[index];
    const amount = roundMoney(row.amount);
    if (!(amount > 0)) throw fail('Allocation amount must be greater than zero');
    if (row.committeeId) {
      const committee = await querySession(Committee.findOne({ _id: row.committeeId, memberId: transaction.memberId, businessOwnerId: transaction.businessOwnerId, isArchived: { $ne: true } }), session);
      if (!committee) throw fail('Allocation committee does not belong to this member', 409);
    }
    if (row.invoiceId) {
      const Invoice = mongoose.model('InstallmentsInvoice');
      const invoice = await querySession(Invoice.findOne({ _id: row.invoiceId, businessOwnerId: transaction.businessOwnerId, memberId: transaction.memberId }), session);
      if (!invoice) throw fail('Allocation invoice does not belong to this member or business', 409);
    }
    const [allocation] = await Allocation.create([{
      businessOwnerId: transaction.businessOwnerId,
      allocationType: row.scheduledDueKey ? 'payment_to_schedule' : 'payment_to_invoice',
      memberId: transaction.memberId,
      paymentTransactionId: transaction._id,
      invoiceId: row.invoiceId || transaction.invoiceId || null,
      committeeId: row.committeeId || transaction.committeeId || null,
      scheduledDueKey: String(row.scheduledDueKey || ''), amount, status: 'allocated',
      idempotencyKey: `${transaction.idempotencyKey}:allocation:${index}`, createdBy: actorId,
    }], { session });
    created.push(allocation);
    allocated = roundMoney(allocated + amount);
  }
  if (allocated > transaction.amount) throw fail('Allocated amount cannot exceed the payment amount', 409);
  return created;
};

const postPaymentInSession = async (payload, session) => {
  if (!session) throw fail('A MongoDB transaction session is required');
  const amount = roundMoney(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw fail('Payment amount must be greater than zero');
  if (!validDate(payload.transactionDate)) throw fail('A valid transaction date is required');
  if (!String(payload.idempotencyKey || '').trim()) throw fail('An idempotency key is required');
  const resolved = await resolvePaymentAccount({ businessOwnerId: payload.businessOwnerId, accountId: payload.accountId, session });

  if (payload.autoAllocateReceipt) {
    const replay = await querySession(PaymentTransaction.findOne({ businessOwnerId: payload.businessOwnerId, idempotencyKey: payload.idempotencyKey }), session);
    if (replay?.status === 'posted') {
      const sameRequest = roundMoney(replay.amount) === amount && id(replay.accountId) === id(resolved.account._id) && id(replay.memberId) === id(payload.memberId);
      if (!sameRequest) throw fail('Idempotency key was already used for a different financial transaction', 409);
      const replayAllocations = await querySession(Allocation.find({ businessOwnerId: payload.businessOwnerId, paymentTransactionId: replay._id, status: 'allocated' }), session);
      return { transaction: replay, allocations: replayAllocations, alreadyPosted: true };
    }
    if (replay) throw fail('A transaction with this key is not in a postable state', 409);
    const plan = await buildAutomaticReceiptPlan({ businessOwnerId: payload.businessOwnerId, memberId: payload.memberId, committeeId: payload.committeeId, amount, transactionDate: payload.transactionDate, session });
    const allocatedInvoiceIds = [...new Set(plan.allocations.map((row) => row.invoiceId).filter(Boolean).map(id))];
    payload = {
      ...payload,
      transactionType: plan.receivableAmount > 0 ? PAYMENT_TYPES.CUSTOMER_RECEIPT : PAYMENT_TYPES.CUSTOMER_ADVANCE,
      committeeId: plan.committeeId,
      invoiceId: allocatedInvoiceIds.length === 1 ? allocatedInvoiceIds[0] : null,
      allocations: plan.allocations,
      automaticReceiptPlan: plan,
    };
  }
  await validatePartyReferences(payload, session);

  let transaction = await querySession(PaymentTransaction.findOne({ businessOwnerId: payload.businessOwnerId, idempotencyKey: payload.idempotencyKey }), session);
  if (transaction?.status === 'posted') {
    const sameRequest = transaction.transactionType === payload.transactionType
      && roundMoney(transaction.amount) === amount
      && id(transaction.accountId) === id(resolved.account._id)
      && id(transaction.memberId) === id(payload.memberId)
      && id(transaction.supplierId) === id(payload.supplierId)
      && id(transaction.invoiceId) === id(payload.invoiceId);
    if (!sameRequest) throw fail('Idempotency key was already used for a different financial transaction', 409);
    return { transaction, alreadyPosted: true };
  }
  if (transaction) throw fail('A transaction with this key is not in a postable state', 409);

  let receivableAmount = 0;
  let advanceAmount = 0;
  let createdAllocations = [];
  if (CUSTOMER_IN.has(payload.transactionType)) {
    if (payload.automaticReceiptPlan) { receivableAmount = payload.automaticReceiptPlan.receivableAmount; advanceAmount = payload.automaticReceiptPlan.advanceAmount; }
    else if (payload.transactionType === PAYMENT_TYPES.CUSTOMER_ADVANCE) advanceAmount = amount;
    else {
      const before = await memberBalance(payload.businessOwnerId, payload.memberId, session);
      receivableAmount = Math.min(amount, Math.max(0, roundMoney(before)));
      advanceAmount = roundMoney(amount - receivableAmount);
    }
  }
  [transaction] = await PaymentTransaction.create([{
    businessOwnerId: payload.businessOwnerId,
    referenceNumber: payload.referenceNumber,
    transactionType: payload.transactionType,
    transactionDate: payload.transactionDate,
    amount, receivableAmount, advanceAmount,
    accountId: resolved.account._id,
    legacyPaymentAccountId: resolved.legacyPaymentAccountId,
    memberId: payload.memberId || null,
    supplierId: payload.supplierId || null,
    invoiceId: payload.invoiceId || null,
    committeeId: payload.committeeId || null,
    status: 'draft', idempotencyKey: payload.idempotencyKey,
    notes: String(payload.notes || ''), createdBy: payload.actorId,
    paymentMode: paymentModeForAccount(resolved.account), paymentSource: payload.paymentSource || 'manual',
    collectionDate: String(payload.collectionDate || ''), externalReference: String(payload.externalReference || ''),
    ...(payload.dailyCollectionKey ? { dailyCollectionKey: String(payload.dailyCollectionKey) } : {}), correctionOfTransactionId: payload.correctionOfTransactionId || null,
  }], { session });

  let controlPurpose; let cashLineType; let controlLineType; let sourceType;
  if (CUSTOMER_IN.has(payload.transactionType)) {
    controlPurpose = payload.transactionType === PAYMENT_TYPES.CUSTOMER_ADVANCE || receivableAmount <= 0 ? 'savings' : 'receivable';
    cashLineType = 'debit'; controlLineType = 'credit';
    sourceType = payload.transactionType === PAYMENT_TYPES.CUSTOMER_ADVANCE ? 'installments_customer_advance' : 'installments_customer_receipt';
  } else if (SUPPLIER_OUT.has(payload.transactionType)) {
    controlPurpose = 'payable'; cashLineType = 'credit'; controlLineType = 'debit'; sourceType = 'installments_supplier_payment';
  } else {
    controlPurpose = 'savings'; cashLineType = 'credit'; controlLineType = 'debit'; sourceType = 'installments_savings_payout';
  }
  const control = await ensureControlAccount({ businessOwnerId: payload.businessOwnerId, purpose: controlPurpose, session });
  const splitSavings = CUSTOMER_IN.has(payload.transactionType) && advanceAmount > 0 && receivableAmount > 0
    ? await ensureControlAccount({ businessOwnerId: payload.businessOwnerId, purpose: 'savings', session })
    : null;
  const journalLines = [{ account: resolved.account._id, type: cashLineType, amount }];
  if (splitSavings) {
    journalLines.push({ account: control._id, type: controlLineType, amount: receivableAmount });
    journalLines.push({ account: splitSavings._id, type: controlLineType, amount: advanceAmount });
  } else journalLines.push({ account: control._id, type: controlLineType, amount });
  const [journal] = await JournalEntry.create([{
    date: new Date(`${payload.transactionDate}T00:00:00.000Z`),
    description: payload.description || `${payload.referenceNumber} Installments payment`,
    note: String(payload.notes || ''), sourceType, originModule: 'installments_payment', moduleScope: 'installments',
    referenceId: transaction._id, idempotencyKey: payload.idempotencyKey, createdBy: payload.businessOwnerId,
    lines: journalLines,
  }], { session });
  await recalculateAccountBalances([resolved.account._id, control._id, splitSavings?._id].filter(Boolean), session);

  if (CUSTOMER_IN.has(payload.transactionType)) {
    const balance = roundMoney((await memberBalance(payload.businessOwnerId, payload.memberId, session)) - amount);
    await MemberLedger.create([{
      businessOwnerId: payload.businessOwnerId, memberId: payload.memberId, entryDate: payload.transactionDate,
      sourceType: payload.transactionType === PAYMENT_TYPES.CUSTOMER_ADVANCE ? 'customer_advance' : 'customer_receipt',
      referenceNumber: payload.referenceNumber, description: payload.description || `Receipt ${payload.referenceNumber}`,
      debit: 0, credit: amount, signedAmountAfter: balance, idempotencyKey: payload.idempotencyKey,
      createdBy: payload.actorId, invoiceId: payload.invoiceId || null, committeeId: payload.committeeId || null,
      paymentTransactionId: transaction._id, scheduledDueKey: String(payload.scheduledDueKey || ''),
    }], { session });
    createdAllocations = await createAllocations({ transaction, allocations: payload.allocations || [], actorId: payload.actorId, session });
  } else if (SUPPLIER_OUT.has(payload.transactionType)) {
    const balance = roundMoney((await supplierBalance(payload.businessOwnerId, payload.supplierId, session)) - amount);
    if (balance < 0) throw fail('Supplier payment exceeds the verified payable balance', 409);
    await SupplierLedger.create([{
      businessOwnerId: payload.businessOwnerId, supplierId: payload.supplierId, entryDate: payload.transactionDate,
      sourceType: 'supplier_payment', referenceNumber: payload.referenceNumber,
      description: payload.description || `Supplier payment ${payload.referenceNumber}`,
      debit: amount, credit: 0, signedAmountAfter: balance, idempotencyKey: payload.idempotencyKey,
      createdBy: payload.actorId, invoiceId: payload.invoiceId || null, paymentTransactionId: transaction._id,
    }], { session });
  } else {
    const verifiedAdvance = await verifiedAvailableAdvance(payload.businessOwnerId, payload.memberId, session, payload.committeeId);
    if (verifiedAdvance < amount) throw fail('Member payout exceeds the verified refundable balance. Legacy or net ledger credit requires reconciliation before payout.', 409);
    const before = await memberBalance(payload.businessOwnerId, payload.memberId, session);
    const balance = roundMoney(before + amount);
    await MemberLedger.create([{
      businessOwnerId: payload.businessOwnerId, memberId: payload.memberId, entryDate: payload.transactionDate,
      sourceType: 'committee_savings_payout', referenceNumber: payload.referenceNumber,
      description: payload.description || `Member payout ${payload.referenceNumber}`,
      debit: amount, credit: 0, signedAmountAfter: balance, idempotencyKey: payload.idempotencyKey,
      createdBy: payload.actorId, committeeId: payload.committeeId || null, paymentTransactionId: transaction._id,
    }], { session });
  }

  await AccountEntry.create([{
    businessOwnerId: payload.businessOwnerId, accountId: resolved.legacyPaymentAccountId,
    sharedAccountId: resolved.account._id, invoiceId: payload.invoiceId || null,
    paymentTransactionId: transaction._id, journalEntryId: journal._id,
    sourceType: 'payment_transaction', sourceId: transaction._id,
    entryDate: payload.transactionDate, direction: cashLineType === 'debit' ? 'in' : 'out', amount,
    description: payload.description || `${payload.referenceNumber} Installments payment`,
    idempotencyKey: payload.idempotencyKey, createdBy: payload.actorId,
  }], { session });
  Object.assign(transaction, { status: 'posted', journalEntryId: journal._id, postedBy: payload.actorId, postedAt: new Date() });
  await transaction.save({ session });
  if (payload.transactionType === PAYMENT_TYPES.SAVINGS_PAYOUT) {
    await settleCommitteeIfEligible({ businessOwnerId: payload.businessOwnerId, memberId: payload.memberId, committeeId: payload.committeeId, actorId: payload.actorId, session });
  }
  return { transaction, journal, allocations: createdAllocations, allocationSummary: payload.automaticReceiptPlan ? { receivableAmount, advanceAmount, committeeId: payload.committeeId } : null, alreadyPosted: false };
};

const postPayment = async (payload) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await postPaymentInSession(payload, session); });
    return result;
  } finally { await session.endSession(); }
};

const listCompatiblePaymentTransactions = async ({ businessOwnerId, query = {} }) => {
  const transactions = await PaymentTransaction.find({ ...query, businessOwnerId }).sort({ transactionDate: -1, createdAt: -1 }).lean();
  const legacyEntries = await AccountEntry.find({ businessOwnerId, paymentTransactionId: null, invoiceId: { $ne: null } }).sort({ entryDate: -1, createdAt: -1 }).lean();
  return [
    ...transactions.map((row) => ({ ...row, isLegacy: false })),
    ...legacyEntries.map((row) => ({
      _id: `legacy:${row._id}`, legacyAccountEntryId: row._id, isLegacy: true,
      businessOwnerId: row.businessOwnerId, referenceNumber: row.description,
      transactionType: row.direction === 'in' ? PAYMENT_TYPES.INVOICE_CUSTOMER_RECEIPT : PAYMENT_TYPES.INVOICE_SUPPLIER_PAYMENT,
      transactionDate: row.entryDate, amount: row.amount, legacyPaymentAccountId: row.accountId,
      invoiceId: row.invoiceId, status: 'posted', createdBy: row.createdBy, createdAt: row.createdAt,
    })),
  ].sort((a, b) => String(b.transactionDate || '').localeCompare(String(a.transactionDate || '')) || new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
};

const allocateAvailableAdvanceInSession = async ({ businessOwnerId, memberId, invoiceId, committeeId = null, amount, actorId, session }) => {
  const requested = roundMoney(amount);
  if (!(requested > 0)) return [];
  const balance = await memberBalance(businessOwnerId, memberId, session);
  let remaining = Math.min(requested, Math.max(0, roundMoney(-balance)));
  if (remaining <= 0) return [];
  const credits = await querySession(MemberLedger.find({ businessOwnerId, memberId, credit: { $gt: 0 }, sourceType: { $in: ['opening_balance', 'opening_adjustment', 'customer_advance', 'customer_receipt'] } }).sort({ entryDate: 1, createdAt: 1 }), session);
  const existing = await Allocation.aggregate([
    { $match: { businessOwnerId: new mongoose.Types.ObjectId(id(businessOwnerId)), memberId: new mongoose.Types.ObjectId(id(memberId)), sourceLedgerEntryId: { $in: credits.map((row) => row._id) }, status: 'allocated' } },
    { $group: { _id: '$sourceLedgerEntryId', amount: { $sum: '$amount' } } },
  ]).session(session || null);
  const used = new Map(existing.map((row) => [id(row._id), roundMoney(row.amount)]));
  const created = [];
  for (const credit of credits) {
    if (remaining <= 0) break;
    const available = Math.max(0, roundMoney(Number(credit.credit || 0) - Number(used.get(id(credit._id)) || 0)));
    const applied = Math.min(available, remaining);
    if (applied <= 0) continue;
    const [allocation] = await Allocation.create([{
      businessOwnerId, allocationType: 'advance_to_invoice', memberId,
      sourceLedgerEntryId: credit._id, invoiceId, committeeId, amount: applied,
      idempotencyKey: `invoice:${invoiceId}:advance:${credit._id}`, createdBy: actorId,
    }], { session });
    created.push(allocation); remaining = roundMoney(remaining - applied);
  }
  if (remaining > 0) throw fail('Available credit could not be tied to auditable source entries', 409);
  return created;
};

const reversePaymentInSession = async ({ businessOwnerId, transactionId, actorId, reason, allowedInvoiceId = null, allowCollectionCorrection = false, session }) => {
  if (!session) throw fail('A MongoDB transaction session is required');
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw fail('A reversal reason is required');
  const original = await querySession(PaymentTransaction.findOne({ _id: transactionId, businessOwnerId, status: 'posted' }), session);
  if (!original) {
    const already = await querySession(PaymentTransaction.findOne({ _id: transactionId, businessOwnerId, status: 'reversed' }), session);
    if (already) throw fail('Payment was already reversed', 409);
    throw fail('Posted payment not found', 404);
  }
  const activeAllocations = await querySession(Allocation.find({ businessOwnerId, paymentTransactionId: original._id, status: 'allocated' }), session);
  const collectionAllocationsAreSafe = allowCollectionCorrection
    && original.paymentSource === 'today_collections'
    && activeAllocations.every((row) => id(row.memberId) === id(original.memberId)
      && id(row.committeeId) === id(original.committeeId)
      && ['payment_to_schedule', 'payment_to_invoice'].includes(row.allocationType));
  if (!collectionAllocationsAreSafe && activeAllocations.some((row) => !allowedInvoiceId || id(row.invoiceId) !== id(allowedInvoiceId))) {
    throw fail('Payment has active allocations and must be corrected from the related invoice or schedule', 409);
  }
  const journal = await querySession(JournalEntry.findOne({ _id: original.journalEntryId, createdBy: businessOwnerId, moduleScope: 'installments', isDeleted: false }), session);
  if (!journal) throw fail('Original payment journal is unavailable; reversal was not posted', 409);
  const reversalKey = `reverse:${original.idempotencyKey}`;
  const [reversal] = await PaymentTransaction.create([{
    businessOwnerId, referenceNumber: `REV-${original.referenceNumber}`, transactionType: 'reversal',
    transactionDate: getCurrentBusinessDateKey(), amount: original.amount,
    accountId: original.accountId, legacyPaymentAccountId: original.legacyPaymentAccountId,
    memberId: original.memberId, supplierId: original.supplierId, invoiceId: original.invoiceId,
    committeeId: original.committeeId, status: 'draft', idempotencyKey: reversalKey,
    reversalOfTransactionId: original._id, reversalReason: cleanReason, createdBy: actorId,
    paymentMode: original.paymentMode, paymentSource: 'system_reversal', collectionDate: original.collectionDate,
  }], { session });
  const [reversalJournal] = await JournalEntry.create([{
    date: new Date(), description: `Reversal of ${original.referenceNumber}`, note: cleanReason,
    sourceType: 'reversal', originModule: 'installments_payment', moduleScope: 'installments',
    referenceId: reversal._id, idempotencyKey: reversalKey, createdBy: businessOwnerId,
    reversalOf: journal._id, isReversal: true,
    lines: journal.lines.map((line) => ({ account: line.account, type: line.type === 'debit' ? 'credit' : 'debit', amount: line.amount, paymentType: line.paymentType })),
  }], { session });
  await recalculateAccountBalances(journal.lines.map((line) => line.account), session);
  journal.isReversed = true; await journal.save({ session });

  if (original.memberId) {
    const before = await memberBalance(businessOwnerId, original.memberId, session);
    const wasInflow = CUSTOMER_IN.has(original.transactionType);
    const balance = roundMoney(before + (wasInflow ? original.amount : -original.amount));
    await MemberLedger.create([{
      businessOwnerId, memberId: original.memberId, entryDate: reversal.transactionDate,
      sourceType: 'payment_reversal', referenceNumber: reversal.referenceNumber,
      description: `Reversal of ${original.referenceNumber}`, debit: wasInflow ? original.amount : 0,
      credit: wasInflow ? 0 : original.amount, signedAmountAfter: balance,
      idempotencyKey: reversalKey, createdBy: actorId, invoiceId: original.invoiceId,
      committeeId: original.committeeId, paymentTransactionId: reversal._id,
    }], { session });
  } else if (original.supplierId) {
    const before = await supplierBalance(businessOwnerId, original.supplierId, session);
    const balance = roundMoney(before + original.amount);
    await SupplierLedger.create([{
      businessOwnerId, supplierId: original.supplierId, entryDate: reversal.transactionDate,
      sourceType: 'payment_reversal', referenceNumber: reversal.referenceNumber,
      description: `Reversal of ${original.referenceNumber}`, debit: 0, credit: original.amount,
      signedAmountAfter: balance, idempotencyKey: reversalKey, createdBy: actorId,
      invoiceId: original.invoiceId, paymentTransactionId: reversal._id,
    }], { session });
  }
  await AccountEntry.create([{
    businessOwnerId, accountId: original.legacyPaymentAccountId, sharedAccountId: original.accountId,
    invoiceId: original.invoiceId, paymentTransactionId: reversal._id, journalEntryId: reversalJournal._id,
    sourceType: 'reversal', sourceId: reversal._id, entryDate: reversal.transactionDate,
    direction: journal.lines.find((line) => id(line.account) === id(original.accountId))?.type === 'debit' ? 'out' : 'in',
    amount: original.amount, description: `Reversal of ${original.referenceNumber}`,
    idempotencyKey: reversalKey, createdBy: actorId,
  }], { session });
  if (activeAllocations.length) await Allocation.updateMany({ _id: { $in: activeAllocations.map((row) => row._id) }, status: 'allocated' }, { $set: { status: 'reversed', reversedAt: new Date(), reversedBy: actorId } }, { session });
  Object.assign(original, { status: 'reversed', reversalTransactionId: reversal._id, reversalReason: cleanReason, reversedAt: new Date(), reversedBy: actorId });
  await original.save({ session });
  if (original.transactionType === PAYMENT_TYPES.SAVINGS_PAYOUT && original.committeeId) {
    const committee = await querySession(Committee.findOne({ _id: original.committeeId, businessOwnerId, closureType: 'settled' }), session);
    if (committee) {
      Object.assign(committee, { status: 'active', closureType: '', closedAt: null, closedBy: null, closeReason: '', updatedBy: actorId });
      await committee.save({ session });
    }
  }
  Object.assign(reversal, { status: 'posted', journalEntryId: reversalJournal._id, postedBy: actorId, postedAt: new Date() });
  await reversal.save({ session });
  return reversal;
};

const reversePayment = async (payload) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await reversePaymentInSession({ ...payload, session }); });
    return result;
  } finally { await session.endSession(); }
};

const correctTodayCollectionPayment = async ({ businessOwnerId, transactionId, actorId, amount, idempotencyKey }) => {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const replay = await querySession(PaymentTransaction.findOne({ businessOwnerId, idempotencyKey }), session);
      if (replay?.status === 'posted' && id(replay.correctionOfTransactionId) === id(transactionId) && roundMoney(replay.amount) === roundMoney(amount)) {
        const allocations = await querySession(Allocation.find({ businessOwnerId, paymentTransactionId: replay._id, status: 'allocated' }), session);
        result = { transaction: replay, allocations, alreadyPosted: true };
        return;
      }
      if (replay) throw fail('Idempotency key was already used for a different financial transaction', 409);
      const original = await querySession(PaymentTransaction.findOne({ _id: transactionId, businessOwnerId, status: 'posted', paymentSource: 'today_collections' }), session);
      if (!original || !original.memberId || !original.committeeId || !original.collectionDate) throw fail('The selected daily collection receipt is unavailable for correction', 409);
      const auditReason = `Receipt amount corrected from ${roundMoney(original.amount)} to ${roundMoney(amount)} via authorized edit`;
      const sourceEntries = await querySession(MemberLedger.find({ businessOwnerId, paymentTransactionId: original._id }).select('_id'), session);
      const dependentAdvance = sourceEntries.length ? await querySession(Allocation.findOne({ businessOwnerId, sourceLedgerEntryId: { $in: sourceEntries.map((row) => row._id) }, status: 'allocated' }), session) : null;
      if (dependentAdvance) throw fail('This receipt has subsequently been applied as an advance. Correct the dependent invoice allocation first.', 409);
      await reversePaymentInSession({ businessOwnerId, transactionId: original._id, actorId, reason: auditReason, allowCollectionCorrection: true, session });
      const referenceNumber = await nextNumber(businessOwnerId, 'payment_receipt', 'RCP', session);
      result = await postPaymentInSession({
        businessOwnerId, actorId, transactionType: PAYMENT_TYPES.CUSTOMER_ADVANCE,
        transactionDate: original.transactionDate, amount, accountId: original.accountId,
        memberId: original.memberId, committeeId: original.committeeId,
        referenceNumber, idempotencyKey, autoAllocateReceipt: true,
        paymentSource: 'today_collections', collectionDate: original.collectionDate,
        dailyCollectionKey: original.dailyCollectionKey || `${id(original.memberId)}:${id(original.committeeId)}:${original.collectionDate}`,
        correctionOfTransactionId: original._id, notes: original.notes, externalReference: original.externalReference,
      }, session);
      await PaymentTransaction.updateOne({ _id: original._id, businessOwnerId, status: 'reversed' }, { $set: { correctedByTransactionId: result.transaction._id } }, { session });
    });
    return result;
  } finally { await session.endSession(); }
};

module.exports = {
  PAYMENT_TYPES,
  allocateAvailableAdvanceInSession,
  ensureControlAccount,
  memberBalance,
  listCompatiblePaymentTransactions,
  postPayment,
  postPaymentInSession,
  correctTodayCollectionPayment,
  resolvePaymentAccount,
  reversePayment,
  reversePaymentInSession,
  settleCommitteeIfEligible,
  supplierBalance,
  verifiedAvailableAdvance,
};
