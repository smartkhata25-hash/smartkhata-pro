const mongoose = require('mongoose');
const Account = require('../models/Account');
const Invoice = require('../models/InstallmentsInvoice');
const { decorateInvoiceReferences, decorateLedgerReferences } = require('../utils/installmentsInvoiceIdentity');
const Member = require('../models/InstallmentsMember');
const Supplier = require('../models/InstallmentsSupplier');
const Committee = require('../models/InstallmentsCommittee');
const PaymentTransaction = require('../models/InstallmentsPaymentTransaction');
const Allocation = require('../models/InstallmentsPaymentAllocation');
const MemberLedger = require('../models/InstallmentsLedgerEntry');
const SupplierLedger = require('../models/InstallmentsSupplierLedgerEntry');
const { logActivity } = require('../utils/activityLogger');
const { getBusinessDateKey } = require('../utils/businessDate');
const { roundMoney } = require('../utils/money');
const { hasPermission } = require('../utils/permissionList');
const { balanceReport, profitReport, savingsReport } = require('../services/installments/installmentsReportService');
const { parseDateOnly } = require('../services/installments/installmentsScheduleService');
const { nextNumber, peekNextNumber } = require('../services/installments/installmentsMemberService');
const {
  PAYMENT_TYPES,
  correctTodayCollectionPayment,
  listCompatiblePaymentTransactions,
  postPayment,
  reversePayment,
  supplierBalance,
  verifiedAvailableAdvance,
} = require('../services/installments/installmentsPaymentService');
const {
  getCollections,
  getMemberPaymentContext,
} = require('../services/installments/installmentsCollectionsService');

const ownerId = (req) => req.user?.businessOwnerId || req.user?.id || req.userId;
const actorId = (req) => req.actorId || req.user?.actorId || ownerId(req);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const cleanDate = (value) => {
  if (!value) return getBusinessDateKey(new Date());
  const clean = String(value).trim();
  if (!parseDateOnly(clean)) throw fail('A valid payment date is required');
  return clean;
};
const cleanAmount = (value) => {
  const amount = roundMoney(Number(value));
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(Number(value) - amount) > 0.000001) throw fail('Amount must be a positive value with no more than two decimal places');
  return amount;
};
const requestKey = (req) => String(req.get('Idempotency-Key') || req.body.idempotencyKey || '').trim();
const PAYMENT_MODES = new Set(['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'cheque', 'other']);

const logPosted = async (req, transaction, action) => logActivity({
  req,
  action,
  module: 'installments.payments',
  moduleScope: 'installments',
  entityType: 'InstallmentsPaymentTransaction',
  entityId: transaction._id,
  title: transaction.referenceNumber,
  description: `${action.replaceAll('_', ' ')} posted`,
  after: { amount: transaction.amount, accountId: transaction.accountId, transactionType: transaction.transactionType },
});

exports.accounts = async (req, res) => {
  const accounts = await Account.find({
    userId: ownerId(req), moduleScope: { $in: ['installments', 'shared'] }, type: 'Asset',
    category: { $in: ['cash', 'bank', 'online', 'cheque'] }, isActive: { $ne: false },
  }).select('name code category balance actualBalance moduleScope isSystem').sort({ category: 1, isSystem: -1, name: 1 }).lean();
  return res.json({ accounts, defaultAccountId: accounts.find((row) => row.code === 'HANDCASH' || (row.category === 'cash' && /cash in hand/i.test(row.name)))?._id || null });
};

exports.lookups = async (req, res) => {
  const [members, suppliers, accounts] = await Promise.all([
    Member.find({ businessOwnerId: ownerId(req), isArchived: false, status: 'active' }).select('fullName memberNumber mobile').sort({ fullName: 1 }).lean(),
    Supplier.find({ businessOwnerId: ownerId(req), isArchived: false }).select('name supplierNumber phone').sort({ name: 1 }).lean(),
    Account.find({ userId: ownerId(req), moduleScope: { $in: ['installments', 'shared'] }, type: 'Asset', category: { $in: ['cash', 'bank', 'online', 'cheque'] }, isActive: { $ne: false } }).select('name code category balance actualBalance moduleScope isSystem').sort({ category: 1, isSystem: -1, name: 1 }).lean(),
  ]);
  return res.json({ members, suppliers, accounts, defaultAccountId: accounts.find((row) => row.code === 'HANDCASH' || (row.category === 'cash' && /cash in hand/i.test(row.name)))?._id || null });
};

exports.nextReference = async (req, res) => {
  const kind = ['receipt', 'supplier', 'payout'].includes(req.query.kind) ? req.query.kind : 'receipt';
  const config = { receipt: ['payment_receipt', 'RCP'], supplier: ['supplier_payment', 'PAY'], payout: ['savings_payout', 'PYO'] }[kind];
  return res.json({ referenceNumber: `${config[1]}-${await peekNextNumber(ownerId(req), config[0])}` });
};

exports.memberContext = async (req, res) => {
  try {
    if (!validId(req.params.memberId)) throw fail('Invalid member ID');
    return res.json(await getMemberPaymentContext({ businessOwnerId: ownerId(req), memberId: req.params.memberId }));
  } catch (error) { return res.status(error.statusCode || 400).json({ message: error.message }); }
};

exports.supplierContext = async (req, res) => {
  try {
    if (!validId(req.params.supplierId)) throw fail('Invalid supplier ID');
    const supplier = await Supplier.findOne({ _id: req.params.supplierId, businessOwnerId: ownerId(req), isArchived: false }).lean();
    if (!supplier) throw fail('Active supplier not found', 404);
    const balance = await supplierBalance(ownerId(req), supplier._id);
    let invoices = await Invoice.find({ businessOwnerId: ownerId(req), status: 'posted', accountingStatus: 'posted', 'items.supplierId': supplier._id })
      .select('invoiceNumber publicInvoiceNumber correctsInvoiceId invoiceDate items supplierPayments').sort({ invoiceDate: 1 }).lean();
    invoices = await decorateInvoiceReferences(invoices, ownerId(req));
    invoices = invoices.map((invoice) => ({ ...invoice, internalInvoiceNumber: invoice.invoiceNumber, invoiceNumber: invoice.publicInvoiceNumber || invoice.invoiceNumber }));
    return res.json({ supplier, balance, payable: Math.max(0, balance), supplierAdvance: Math.max(0, -balance), invoices });
  } catch (error) { return res.status(error.statusCode || 400).json({ message: error.message }); }
};

exports.receive = async (req, res) => {
  try {
    const key = requestKey(req); if (!key) throw fail('An idempotency key is required');
    if (!validId(req.body.memberId) || !validId(req.body.accountId)) throw fail('A valid member and payment account are required');
    const amount = cleanAmount(req.body.amount); const transactionDate = cleanDate(req.body.transactionDate);
    const isDailyCollection = req.body.paymentSource === 'today_collections';
    if (isDailyCollection && !validId(req.body.committeeId)) throw fail('A valid committee is required for Today\'s Collections', 409);
    const dailyCollectionKey = isDailyCollection ? `${String(req.body.memberId)}:${String(req.body.committeeId)}:${transactionDate}` : '';
    const replay = await PaymentTransaction.findOne({ businessOwnerId: ownerId(req), idempotencyKey: key });
    if (replay) {
      const sameRequest = replay.status === 'posted' && roundMoney(replay.amount) === amount && String(replay.memberId) === String(req.body.memberId) && String(replay.accountId) === String(req.body.accountId) && replay.transactionDate === transactionDate && (!validId(req.body.committeeId) || String(replay.committeeId) === String(req.body.committeeId));
      if (!sameRequest) throw fail('Idempotency key was already used for a different financial transaction', 409);
      const allocations = await Allocation.find({ businessOwnerId: ownerId(req), paymentTransactionId: replay._id, status: 'allocated' });
      return res.json({ transaction: replay, allocations, alreadyPosted: true, message: 'Receipt was already posted' });
    }
    if (isDailyCollection) {
      const existingDailyReceipt = await PaymentTransaction.findOne({
        businessOwnerId: ownerId(req), status: 'posted', paymentSource: 'today_collections',
        memberId: req.body.memberId, committeeId: req.body.committeeId, collectionDate: transactionDate,
      }).select('_id').lean();
      if (existingDailyReceipt) throw fail('A receipt is already recorded for this committee collection date. Use Edit or Receive Payment for another receipt.', 409);
    }
    const referenceNumber = await nextNumber(ownerId(req), 'payment_receipt', 'RCP');
    const result = await postPayment({
      businessOwnerId: ownerId(req), actorId: actorId(req), transactionType: PAYMENT_TYPES.CUSTOMER_ADVANCE, transactionDate, amount,
      accountId: req.body.accountId, memberId: req.body.memberId,
      committeeId: validId(req.body.committeeId) ? req.body.committeeId : null,
      referenceNumber, idempotencyKey: key, autoAllocateReceipt: true,
      paymentSource: isDailyCollection ? 'today_collections' : 'manual',
      collectionDate: isDailyCollection ? transactionDate : '', dailyCollectionKey,
      notes: req.body.notes, externalReference: req.body.externalReference,
    });
    if (!result.alreadyPosted) await logPosted(req, result.transaction, 'receive_payment');
    return res.status(result.alreadyPosted ? 200 : 201).json({ ...result, message: result.alreadyPosted ? 'Receipt was already posted' : 'Payment received successfully' });
  } catch (error) { return res.status(error.statusCode || (error.code === 11000 ? 409 : 400)).json({ message: error.code === 11000 ? 'A receipt is already recorded for this collection row' : error.message }); }
};

exports.correctCollection = async (req, res) => {
  try {
    const key = requestKey(req); if (!key) throw fail('An idempotency key is required');
    if (!validId(req.params.transactionId)) throw fail('A valid receipt is required');
    const amount = cleanAmount(req.body.amount);
    const result = await correctTodayCollectionPayment({ businessOwnerId: ownerId(req), actorId: actorId(req), transactionId: req.params.transactionId, amount, idempotencyKey: key });
    if (!result.alreadyPosted) await logPosted(req, result.transaction, 'correct_daily_collection');
    return res.status(result.alreadyPosted ? 200 : 201).json({ ...result, message: result.alreadyPosted ? 'Collection correction was already posted' : 'Collection receipt corrected successfully' });
  } catch (error) { return res.status(error.statusCode || (error.code === 11000 ? 409 : 400)).json({ message: error.code === 11000 ? 'This collection correction was already processed' : error.message }); }
};

exports.paySupplier = async (req, res) => {
  try {
    const key = requestKey(req); if (!key) throw fail('An idempotency key is required');
    if (!validId(req.body.supplierId) || !validId(req.body.accountId)) throw fail('A valid supplier and payment account are required');
    const amount = cleanAmount(req.body.amount); const balance = await supplierBalance(ownerId(req), req.body.supplierId);
    if (amount > balance) throw fail('Payment exceeds the verified supplier payable. Supplier advances require a separate confirmed workflow.', 409);
    const referenceNumber = await nextNumber(ownerId(req), 'supplier_payment', 'PAY');
    const result = await postPayment({ businessOwnerId: ownerId(req), actorId: actorId(req), transactionType: PAYMENT_TYPES.SUPPLIER_PAYMENT,
      transactionDate: cleanDate(req.body.transactionDate), amount, accountId: req.body.accountId, supplierId: req.body.supplierId,
      invoiceId: validId(req.body.invoiceId) ? req.body.invoiceId : null, referenceNumber, idempotencyKey: key,
      paymentSource: 'manual', notes: req.body.notes, externalReference: req.body.externalReference });
    if (!result.alreadyPosted) await logPosted(req, result.transaction, 'pay_supplier_bill');
    return res.status(result.alreadyPosted ? 200 : 201).json({ ...result, message: result.alreadyPosted ? 'Payment was already posted' : 'Supplier payment posted successfully' });
  } catch (error) { return res.status(error.statusCode || (error.code === 11000 ? 409 : 400)).json({ message: error.code === 11000 ? 'This payment request was already processed' : error.message }); }
};

exports.payout = async (req, res) => {
  try {
    const key = requestKey(req); if (!key) throw fail('An idempotency key is required');
    if (!validId(req.body.memberId) || !validId(req.body.committeeId) || !validId(req.body.accountId)) throw fail('A valid member, committee and payment account are required');
    if (req.body.confirmed !== true) throw fail('Member payout confirmation is required', 409);
    const amount = cleanAmount(req.body.amount);
    const committee = await Committee.findOne({ _id: req.body.committeeId, businessOwnerId: ownerId(req), memberId: req.body.memberId, status: 'active', isArchived: { $ne: true } }).select('_id').lean();
    if (!committee) throw fail('The selected committee is not eligible for a new member payout', 409);
    const available = await verifiedAvailableAdvance(ownerId(req), req.body.memberId, null, req.body.committeeId);
    if (!(available > 0.005)) throw fail('This committee has no verified refundable balance', 409);
    if (amount > available) throw fail('Payout exceeds the verified refundable balance. Reconcile legacy credit before payout.', 409);
    const referenceNumber = await nextNumber(ownerId(req), 'savings_payout', 'PYO');
    const result = await postPayment({ businessOwnerId: ownerId(req), actorId: actorId(req), transactionType: PAYMENT_TYPES.SAVINGS_PAYOUT,
      transactionDate: cleanDate(req.body.transactionDate), amount, accountId: req.body.accountId, memberId: req.body.memberId,
      committeeId: req.body.committeeId, referenceNumber, idempotencyKey: key, paymentSource: 'manual', notes: req.body.notes });
    if (!result.alreadyPosted) await logPosted(req, result.transaction, 'savings_payout');
    return res.status(result.alreadyPosted ? 200 : 201).json({ ...result, message: result.alreadyPosted ? 'Member payout was already posted' : 'Member payout posted successfully' });
  } catch (error) { return res.status(error.statusCode || (error.code === 11000 ? 409 : 400)).json({ message: error.code === 11000 ? 'This payout request was already processed' : error.message }); }
};

exports.collections = async (req, res) => {
  try { return res.json(await getCollections({ businessOwnerId: ownerId(req), date: cleanDate(req.query.date), search: req.query.search, committeeId: req.query.committeeId, status: req.query.status })); }
  catch (error) { return res.status(400).json({ message: error.message }); }
};

exports.history = async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1); const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const typeMap = { receipts: ['customer_receipt', 'customer_advance', 'invoice_customer_receipt'], suppliers: ['supplier_payment', 'invoice_supplier_payment'], payouts: ['committee_savings_payout'] };
    const types = typeMap[req.query.type] || typeMap.receipts;
    const query = { transactionType: { $in: types } };
    query.status = req.query.status && ['posted', 'reversed'].includes(req.query.status) ? req.query.status : 'posted';
    if (req.query.fromDate || req.query.toDate) { query.transactionDate = {}; if (req.query.fromDate) query.transactionDate.$gte = cleanDate(req.query.fromDate); if (req.query.toDate) query.transactionDate.$lte = cleanDate(req.query.toDate); }
    if (validId(req.query.accountId)) query.accountId = req.query.accountId;
    if (validId(req.query.memberId)) query.memberId = req.query.memberId;
    if (validId(req.query.supplierId)) query.supplierId = req.query.supplierId;
    if (PAYMENT_MODES.has(req.query.paymentMode)) query.paymentMode = req.query.paymentMode;
    if (req.query.minAmount || req.query.maxAmount) { query.amount = {}; if (req.query.minAmount) query.amount.$gte = cleanAmount(req.query.minAmount); if (req.query.maxAmount) query.amount.$lte = cleanAmount(req.query.maxAmount); }
    if (String(req.query.reference || '').trim()) query.referenceNumber = new RegExp(String(req.query.reference).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (validId(req.query.staffId)) query.createdBy = req.query.staffId;
    const all = await listCompatiblePaymentTransactions({ businessOwnerId: ownerId(req), query });
    const filtered = all.filter((row) => types.includes(row.transactionType) && (!row.isLegacy || query.status === 'posted'));
    const ids = filtered.slice((page - 1) * limit, page * limit).filter((row) => !row.isLegacy).map((row) => row._id);
    let populated = await PaymentTransaction.find({ _id: { $in: ids }, businessOwnerId: ownerId(req) })
      .populate('memberId', 'fullName memberNumber mobile').populate('supplierId', 'name supplierNumber phone')
      .populate('committeeId', 'committeeNumber').populate('invoiceId', 'invoiceNumber').populate('accountId', 'name code category')
      .populate('createdBy', 'name email').lean();
    populated = await decorateLedgerReferences(populated, ownerId(req));
    const map = new Map(populated.map((row) => [String(row._id), row]));
    const rows = filtered.slice((page - 1) * limit, page * limit).map((row) => row.isLegacy ? row : map.get(String(row._id)) || row);
    return res.json({ rows, page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
};

exports.detail = async (req, res) => {
  let transaction = validId(req.params.transactionId) ? await PaymentTransaction.findOne({ _id: req.params.transactionId, businessOwnerId: ownerId(req) })
    .populate('memberId', 'fullName memberNumber mobile').populate('supplierId', 'name supplierNumber phone')
    .populate('committeeId', 'committeeNumber').populate('invoiceId', 'invoiceNumber').populate('accountId', 'name code category').lean() : null;
  if (!transaction) return res.status(404).json({ message: 'Payment transaction not found' });
  [transaction] = await decorateLedgerReferences([transaction], ownerId(req));
  const allocations = await Allocation.find({ businessOwnerId: ownerId(req), paymentTransactionId: transaction._id }).lean();
  return res.json({ transaction, allocations });
};

exports.reverse = async (req, res) => {
  try {
    const transaction = await reversePayment({ businessOwnerId: ownerId(req), transactionId: req.params.transactionId, actorId: actorId(req), reason: req.body.reason });
    await logPosted(req, transaction, 'reverse_payment'); return res.json({ transaction, message: 'Payment reversed successfully' });
  } catch (error) { return res.status(error.statusCode || 409).json({ message: error.message }); }
};

exports.dashboard = async (req, res) => {
  try {
    const date = cleanDate(req.query.date);
    const canSeeCollections = req.user?.accountRole === 'owner' || hasPermission(req.user?.permissions || [], 'installments.payments.view_collections');
    const collections = canSeeCollections ? await getCollections({ businessOwnerId: ownerId(req), date }) : { summary: {} };
    const canSeeProfit = req.user?.accountRole === 'owner' || hasPermission(req.user?.permissions || [], 'installments.reports.profit');
    const [balances, savings, profit] = await Promise.all([
      balanceReport({ businessOwnerId: ownerId(req) }),
      savingsReport({ businessOwnerId: ownerId(req) }),
      canSeeProfit ? profitReport({ businessOwnerId: ownerId(req), filters: { fromDate: `${date.slice(0, 8)}01`, toDate: date } }) : null,
    ]);
    return res.json({ date, profitPeriod: canSeeProfit ? { fromDate: `${date.slice(0, 8)}01`, toDate: date } : null, collections: collections.summary, customerReceivables: roundMoney(balances.members.reduce((sum, row) => sum + row.receivable, 0)), supplierPayables: roundMoney(balances.suppliers.reduce((sum, row) => sum + row.payable, 0)), unappliedCustomerSavings: savings.summary.availableSavings, totalSales: profit?.summary?.totalSales ?? null, netProfit: profit?.summary?.netProfit ?? null });
  } catch (error) { return res.status(400).json({ message: error.message }); }
};

exports.document = async (req, res) => exports.detail(req, res);
