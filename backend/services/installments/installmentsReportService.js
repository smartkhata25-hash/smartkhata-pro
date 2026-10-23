const mongoose = require('mongoose');
const Expense = require('../../models/Expense');
const JournalEntry = require('../../models/JournalEntry');
const Invoice = require('../../models/InstallmentsInvoice');
const PaymentTransaction = require('../../models/InstallmentsPaymentTransaction');
const Allocation = require('../../models/InstallmentsPaymentAllocation');
const Committee = require('../../models/InstallmentsCommittee');
const Member = require('../../models/InstallmentsMember');
const Supplier = require('../../models/InstallmentsSupplier');
const MemberLedger = require('../../models/InstallmentsLedgerEntry');
const SupplierLedger = require('../../models/InstallmentsSupplierLedgerEntry');
const { roundMoney } = require('../../utils/money');
const { decorateInvoiceReferences, decorateLedgerReferences } = require('../../utils/installmentsInvoiceIdentity');
const { committeeDuesThrough, getAllocatedByDue } = require('./installmentsCollectionsService');
const { parseDateOnly } = require('./installmentsScheduleService');
const { getCurrentBusinessDateKey } = require('../../utils/businessDate');

const oid = (value) => new mongoose.Types.ObjectId(String(value));
const id = (value) => String(value?._id || value || '');
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const receiptTypes = ['customer_receipt', 'customer_advance', 'invoice_customer_receipt'];

const summarizeProfitRows = (sales = [], operatingExpenses = 0) => {
  const totalSales = roundMoney(sales.reduce((sum, row) => sum + Number(row.saleAmount || 0), 0));
  const cogs = roundMoney(sales.reduce((sum, row) => sum + Number(row.purchaseCost || 0), 0));
  const grossProfit = roundMoney(totalSales - cogs);
  return { totalSales, cogs, grossProfit, operatingExpenses: operatingExpenses === null ? null : roundMoney(operatingExpenses), netProfit: operatingExpenses === null ? null : roundMoney(grossProfit - operatingExpenses) };
};

const resolveRange = ({ fromDate, toDate }) => {
  const end = String(toDate || getCurrentBusinessDateKey());
  const start = String(fromDate || `${end.slice(0, 8)}01`);
  const from = parseDateOnly(start); const to = parseDateOnly(end);
  if (!from || !to || start > end) throw Object.assign(new Error('A valid inclusive date range is required'), { statusCode: 400 });
  if ((to - from) / 86400000 > 366) throw Object.assign(new Error('Report range cannot exceed 366 days'), { statusCode: 400 });
  return { fromDate: start, toDate: end };
};

const expenseRows = async ({ businessOwnerId, fromDate, toDate, titleId = '', accountId = '', search = '' }) => {
  const query = { userId: businessOwnerId, moduleScope: 'installments', isDeleted: false, isReversed: { $ne: true }, date: { $gte: fromDate, $lte: toDate } };
  if (validId(titleId)) query.titleId = titleId;
  if (String(search || '').trim()) query.$or = [{ title: new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { description: new RegExp(String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }];
  const expenses = await Expense.find(query).populate('category', 'name code').populate('titleId', 'name').populate('createdBy', 'name email').sort({ date: -1, createdAt: -1 }).limit(5001).lean();
  if (expenses.length > 5000) throw Object.assign(new Error('Too many expense records; narrow the date range'), { statusCode: 413 });
  const journals = await JournalEntry.find({ createdBy: businessOwnerId, moduleScope: 'installments', sourceType: 'expense', referenceId: { $in: expenses.map((row) => row._id) }, isDeleted: false, isReversed: { $ne: true } }).populate('lines.account', 'name code category').lean();
  const journalMap = new Map(journals.map((row) => [id(row.referenceId), row]));
  return expenses.map((expense) => {
    const journal = journalMap.get(id(expense._id));
    const paidFrom = (journal?.lines || []).filter((line) => line.type === 'credit').map((line) => line.account).filter(Boolean);
    return { _id: expense._id, date: expense.date, title: expense.title, titleId: expense.titleId, category: expense.category, amount: roundMoney(expense.amount), notes: expense.description, attachment: expense.attachment, enteredBy: expense.createdBy, referenceNumber: `EXP-${id(expense._id).slice(-6).toUpperCase()}`, paidFrom, status: 'posted' };
  }).filter((row) => !validId(accountId) || row.paidFrom.some((account) => id(account) === id(accountId)));
};

const profitReport = async ({ businessOwnerId, filters }) => {
  const range = resolveRange(filters);
  const query = { businessOwnerId, status: 'posted', accountingStatus: 'posted', invoiceDate: { $gte: range.fromDate, $lte: range.toDate } };
  if (validId(filters.supplierId)) query.$or = [{ defaultSupplierId: filters.supplierId }, { 'items.supplierId': filters.supplierId }];
  let invoices = await Invoice.find(query).populate('memberId', 'fullName memberNumber').populate('items.supplierId', 'name supplierNumber').sort({ invoiceDate: -1, createdAt: -1 }).limit(5001).lean();
  if (invoices.length > 5000) throw Object.assign(new Error('Too many invoices; narrow the date range'), { statusCode: 413 });
  invoices = await decorateInvoiceReferences(invoices, businessOwnerId);
  const cleanProduct = String(filters.product || '').trim().toLowerCase();
  const cleanCategory = String(filters.category || '').trim().toLowerCase();
  const cleanBrand = String(filters.brand || '').trim().toLowerCase();
  const sales = [];
  invoices.forEach((invoice) => invoice.items.forEach((item) => {
    if (validId(filters.productId) && id(item.productId) !== id(filters.productId)) return;
    if (cleanProduct && !String(item.productName || '').toLowerCase().includes(cleanProduct)) return;
    if (cleanCategory && String(item.category || '').toLowerCase() !== cleanCategory) return;
    if (cleanBrand && String(item.brand || '').toLowerCase() !== cleanBrand) return;
    if (validId(filters.supplierId) && id(item.supplierId) !== id(filters.supplierId)) return;
    sales.push({ _id: `${invoice._id}:${item._id}`, invoiceId: invoice._id, invoiceDate: invoice.invoiceDate, invoiceNumber: invoice.publicInvoiceNumber || invoice.invoiceNumber, internalInvoiceNumber: invoice.invoiceNumber, member: invoice.memberId, supplier: item.supplierId, productId: item.productId, productName: item.productName, category: item.category, brand: item.brand, model: item.model, quantity: item.quantity, unitPurchaseCost: item.unitPurchaseCost, purchaseCost: roundMoney(item.costTotal), saleAmount: roundMoney(item.saleTotal), grossProfit: roundMoney(item.grossProfit), status: invoice.status });
  }));
  const hasProductDimension = Boolean(filters.productId || cleanProduct || cleanCategory || cleanBrand || filters.supplierId);
  const expenses = hasProductDimension ? [] : await expenseRows({ businessOwnerId, ...range });
  const operatingExpenses = hasProductDimension ? null : roundMoney(expenses.reduce((sum, row) => sum + row.amount, 0));
  const totals = summarizeProfitRows(sales, operatingExpenses);
  const productMap = new Map();
  sales.forEach((row) => { const key = `${row.productName}|${row.category}|${row.brand}|${row.model}`; const current = productMap.get(key) || { productName: row.productName, category: row.category, brand: row.brand, model: row.model, quantity: 0, totalSales: 0, purchaseCost: 0, grossProfit: 0 }; current.quantity += Number(row.quantity || 0); current.totalSales += row.saleAmount; current.purchaseCost += row.purchaseCost; current.grossProfit += row.grossProfit; productMap.set(key, current); });
  const products = [...productMap.values()].map((row) => ({ ...row, totalSales: roundMoney(row.totalSales), purchaseCost: roundMoney(row.purchaseCost), grossProfit: roundMoney(row.grossProfit), grossMarginPercent: row.totalSales ? roundMoney(row.grossProfit / row.totalSales * 100) : 0 })).sort((a, b) => b.grossProfit - a.grossProfit);
  return { range, summary: { ...totals, expensesApplicable: !hasProductDimension, recognitionBasis: 'Posted Combined Invoice accrual basis; operating expenses use posted Installments expenses.' }, sales, cogsRows: sales, expenses, products };
};

const collectionReport = async ({ businessOwnerId, filters }) => {
  const range = resolveRange(filters);
  const committeeQuery = { businessOwnerId };
  const dashboardScope = ['dashboard_received', 'dashboard_overdue'].includes(String(filters.scope || ''));
  if (dashboardScope) Object.assign(committeeQuery, { status: 'active', isArchived: { $ne: true } });
  if (validId(filters.committeeId)) committeeQuery._id = filters.committeeId;
  if (validId(filters.memberId)) committeeQuery.memberId = filters.memberId;
  let committees = await Committee.find(committeeQuery).populate('memberId', 'fullName memberNumber mobile status isArchived').sort({ committeeNumber: 1 }).lean();
  if (dashboardScope) committees = committees.filter((committee) => committee.memberId && committee.memberId.status === 'active' && !committee.memberId.isArchived);
  let dueRows = committees.flatMap((committee) => committeeDuesThrough(committee, range.toDate).filter((due) => filters.scope === 'dashboard_overdue' ? due.dueDate < range.toDate : filters.scope === 'dashboard_received' ? true : due.dueDate >= range.fromDate).map((due) => ({ ...due, committee })));
  const allocated = await getAllocatedByDue({ businessOwnerId, dueKeys: dueRows.map((row) => row.dueKey), throughDate: range.toDate });
  if (filters.scope === 'dashboard_received') {
    const visibleCommitteeIds = new Set(committees.filter((committee) => {
      const dues = dueRows.filter((row) => id(row.committee._id) === id(committee._id));
      const dueToday = dues.some((due) => due.dueDate === range.toDate);
      const previousShortfall = dues.some((due) => due.dueDate < range.toDate && roundMoney(due.amount - Number(allocated.get(due.dueKey) || 0)) > 0.005);
      return dueToday || previousShortfall;
    }).map((committee) => id(committee._id)));
    committees = committees.filter((committee) => visibleCommitteeIds.has(id(committee._id)));
    dueRows = dueRows.filter((row) => visibleCommitteeIds.has(id(row.committee._id)) && row.dueDate >= range.fromDate);
  }
  let schedules = dueRows.map((row) => { const appliedAmount = Math.min(row.amount, Number(allocated.get(row.dueKey) || 0)); const remaining = Math.max(0, roundMoney(row.amount - appliedAmount)); const status = remaining <= 0 ? 'paid' : appliedAmount > 0 ? 'partial' : 'unpaid'; return { dueKey: row.dueKey, dueDate: row.dueDate, installmentNumber: row.installmentNumber, member: row.committee.memberId, committee: { _id: row.committee._id, committeeNumber: row.committee.committeeNumber }, scheduledAmount: roundMoney(row.amount), appliedAmount: roundMoney(appliedAmount), remaining, status, daysOverdue: remaining > 0 ? Math.max(0, Math.floor((parseDateOnly(range.toDate) - parseDateOnly(row.dueDate)) / 86400000)) : 0 }; });
  if (filters.status) schedules = schedules.filter((row) => row.status === filters.status || (filters.status === 'overdue' && row.remaining > 0 && row.dueDate < range.toDate));
  const receiptQuery = { businessOwnerId, status: 'posted', transactionType: { $in: filters.scope === 'dashboard_received' ? ['customer_receipt', 'customer_advance'] : receiptTypes }, transactionDate: { $gte: range.fromDate, $lte: range.toDate } };
  if (filters.scope === 'dashboard_received') receiptQuery.committeeId = { $in: committees.map((committee) => committee._id) };
  if (validId(filters.memberId)) receiptQuery.memberId = filters.memberId;
  if (validId(filters.committeeId)) receiptQuery.committeeId = filters.committeeId;
  if (validId(filters.accountId)) receiptQuery.accountId = filters.accountId;
  if (validId(filters.staffId)) receiptQuery.createdBy = filters.staffId;
  let receipts = await PaymentTransaction.find(receiptQuery).populate('memberId', 'fullName memberNumber mobile').populate('committeeId', 'committeeNumber').populate('invoiceId', 'invoiceNumber publicInvoiceNumber correctsInvoiceId').populate('accountId', 'name code category').populate('createdBy', 'name email').sort({ transactionDate: -1, createdAt: -1 }).limit(5001).lean();
  if (receipts.length > 5000) throw Object.assign(new Error('Too many receipts; narrow the date range'), { statusCode: 413 });
  receipts = await decorateLedgerReferences(receipts, businessOwnerId);
  const receiptAllocations = receipts.length ? await Allocation.aggregate([{ $match: { businessOwnerId: oid(businessOwnerId), paymentTransactionId: { $in: receipts.map((row) => row._id) }, status: 'allocated' } }, { $group: { _id: '$paymentTransactionId', amount: { $sum: '$amount' } } }]) : [];
  const allocatedByReceipt = new Map(receiptAllocations.map((row) => [id(row._id), Number(row.amount || 0)]));
  const totalScheduled = roundMoney(schedules.reduce((sum, row) => sum + row.scheduledAmount, 0)); const appliedScheduled = roundMoney(schedules.reduce((sum, row) => sum + row.appliedAmount, 0)); const totalCollected = roundMoney(receipts.reduce((sum, row) => sum + Number(row.amount || 0), 0)); const remaining = roundMoney(schedules.reduce((sum, row) => sum + row.remaining, 0));
  const excessCollection = roundMoney(receipts.reduce((sum, row) => sum + Math.max(0, Number(row.amount || 0) - Number(allocatedByReceipt.get(id(row._id)) || 0)), 0));
  return { range, summary: { totalScheduled, totalCollected, appliedScheduled, remaining, overdue: roundMoney(schedules.filter((row) => row.remaining > 0 && row.dueDate < range.toDate).reduce((sum, row) => sum + row.remaining, 0)), paid: schedules.filter((row) => row.status === 'paid').length, partial: schedules.filter((row) => row.status === 'partial').length, unpaid: schedules.filter((row) => row.status === 'unpaid').length, excessCollection, performancePercent: totalScheduled ? roundMoney(appliedScheduled / totalScheduled * 100) : 0 }, schedules, receipts };
};

const savingsReport = async ({ businessOwnerId }) => {
  const committees = await Committee.find({ businessOwnerId, isArchived: { $ne: true } })
    .populate('memberId', 'fullName memberNumber mobile status isArchived')
    .sort({ createdAt: 1, committeeNumber: 1 })
    .lean();
  const eligible = committees.filter((committee) => committee.memberId && !committee.memberId.isArchived);
  const committeeIds = eligible.map((committee) => committee._id);
  const memberIds = [...new Set(eligible.map((committee) => id(committee.memberId)))].map(oid);
  const [movements, appliedRows, memberBalances] = await Promise.all([
    committeeIds.length ? PaymentTransaction.aggregate([
      { $match: { businessOwnerId: oid(businessOwnerId), committeeId: { $in: committeeIds }, status: 'posted', transactionType: { $in: [...receiptTypes, 'committee_savings_payout'] } } },
      { $group: { _id: { committeeId: '$committeeId', transactionType: '$transactionType' }, amount: { $sum: '$amount' }, advanceAmount: { $sum: '$advanceAmount' } } },
    ]) : [],
    committeeIds.length ? Allocation.aggregate([
      { $match: { businessOwnerId: oid(businessOwnerId), committeeId: { $in: committeeIds }, allocationType: 'advance_to_invoice', status: 'allocated' } },
      { $group: { _id: '$committeeId', amount: { $sum: '$amount' } } },
    ]) : [],
    memberIds.length ? MemberLedger.aggregate([
      { $match: { businessOwnerId: oid(businessOwnerId), memberId: { $in: memberIds } } },
      { $group: { _id: '$memberId', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
    ]) : [],
  ]);
  const byCommittee = new Map();
  movements.forEach((row) => {
    const key = id(row._id.committeeId); const current = byCommittee.get(key) || { contributions: 0, payouts: 0 };
    if (row._id.transactionType === 'committee_savings_payout') current.payouts += Number(row.amount || 0);
    else current.contributions += Number(row.advanceAmount || 0);
    byCommittee.set(key, current);
  });
  const applied = new Map(appliedRows.map((row) => [id(row._id), roundMoney(row.amount)]));
  const remainingMemberCredit = new Map(memberBalances.map((row) => [id(row._id), Math.max(0, roundMoney(Number(row.credit || 0) - Number(row.debit || 0)))]));
  const rows = eligible.map((committee) => {
    const movement = byCommittee.get(id(committee._id)) || { contributions: 0, payouts: 0 };
    const appliedAdvance = roundMoney(applied.get(id(committee._id)) || 0);
    const sourcedAvailable = Math.max(0, roundMoney(movement.contributions - movement.payouts - appliedAdvance));
    const memberKey = id(committee.memberId); const availableSavings = committee.status === 'active' && !committee.closureType ? Math.min(sourcedAvailable, remainingMemberCredit.get(memberKey) || 0) : 0;
    remainingMemberCredit.set(memberKey, Math.max(0, roundMoney((remainingMemberCredit.get(memberKey) || 0) - availableSavings)));
    return { _id: committee._id, committeeNumber: committee.committeeNumber, member: committee.memberId, status: committee.status, closureType: committee.closureType, contributions: roundMoney(movement.contributions), payouts: roundMoney(movement.payouts), appliedAdvance, availableSavings: roundMoney(availableSavings) };
  }).filter((row) => row.contributions > 0 || row.payouts > 0 || row.appliedAdvance > 0 || row.availableSavings > 0);
  return { summary: { availableSavings: roundMoney(rows.reduce((sum, row) => sum + row.availableSavings, 0)) }, rows };
};

const balanceReport = async ({ businessOwnerId }) => {
  const [memberTotals, supplierTotals, members, suppliers] = await Promise.all([
    MemberLedger.aggregate([{ $match: { businessOwnerId: oid(businessOwnerId) } }, { $group: { _id: '$memberId', balance: { $sum: { $subtract: ['$debit', '$credit'] } } } }]),
    SupplierLedger.aggregate([{ $match: { businessOwnerId: oid(businessOwnerId) } }, { $group: { _id: '$supplierId', balance: { $sum: { $subtract: ['$credit', '$debit'] } } } }]),
    Member.find({ businessOwnerId, isArchived: false }).select('fullName memberNumber mobile').lean(),
    Supplier.find({ businessOwnerId, isArchived: false }).select('name supplierNumber phone').lean(),
  ]);
  const memberMap = new Map(memberTotals.map((row) => [id(row._id), Number(row.balance || 0)])); const supplierMap = new Map(supplierTotals.map((row) => [id(row._id), Number(row.balance || 0)]));
  return { members: members.map((row) => ({ ...row, receivable: Math.max(0, roundMoney(memberMap.get(id(row._id)) || 0)), advance: Math.max(0, roundMoney(-(memberMap.get(id(row._id)) || 0))) })).filter((row) => row.receivable || row.advance), suppliers: suppliers.map((row) => ({ ...row, payable: Math.max(0, roundMoney(supplierMap.get(id(row._id)) || 0)), advance: Math.max(0, roundMoney(-(supplierMap.get(id(row._id)) || 0))) })).filter((row) => row.payable || row.advance) };
};

module.exports = { balanceReport, collectionReport, expenseRows, profitReport, resolveRange, savingsReport, summarizeProfitRows };
