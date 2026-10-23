const mongoose = require('mongoose');

const Committee = require('../models/InstallmentsCommittee');
const Member = require('../models/InstallmentsMember');
const Invoice = require('../models/InstallmentsInvoice');
const { decorateInvoiceReferences } = require('../utils/installmentsInvoiceIdentity');
const Allocation = require('../models/InstallmentsPaymentAllocation');
const PaymentTransaction = require('../models/InstallmentsPaymentTransaction');
const { logActivity } = require('../utils/activityLogger');
const { roundMoney } = require('../utils/money');
const { getBusinessDateKey } = require('../utils/businessDate');
const { buildSchedulePreview, parseDateOnly } = require('../services/installments/installmentsScheduleService');
const { committeeDuesThrough, getAllocatedByDue } = require('../services/installments/installmentsCollectionsService');
const { verifiedAvailableAdvance } = require('../services/installments/installmentsPaymentService');

const ownerId = (req) => req.user?.businessOwnerId || req.user?.id || req.userId;
const actorId = (req) => req.actorId || req.user?.actorId || ownerId(req);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const oid = (value) => new mongoose.Types.ObjectId(String(value));
const today = () => getBusinessDateKey(new Date());
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asPage = (value, fallback, maximum) => Math.min(maximum, Math.max(1, Number.parseInt(value, 10) || fallback));
const id = (value) => String(value?._id || value || '');
const fundingGroup = (row) => {
  const activePlan = row.effectiveStatus === 'active';
  if (row.financials.targetReached && ['target_reached', 'completed'].includes(row.effectiveStatus)) return 'paid';
  if (activePlan && row.financials.collectedAmount > 0.005 && !row.financials.targetReached) return 'partial';
  if (activePlan && row.financials.collectedAmount <= 0.005) return 'unpaid';
  return '';
};
const matchesFunding = (row, funding) => funding === 'overdue'
  ? row.effectiveStatus === 'active' && row.financials.overdueAmount > 0.005
  : fundingGroup(row) === funding;

const committeeSnapshot = async (committee, businessOwnerId, { includeSchedule = false, includeFinancial = false } = {}) => {
  const preview = buildSchedulePreview({
    schedule: committee.schedule,
    targetAmount: committee.targetAmount,
    contributionAmount: committee.contributionAmount,
  });
  let dues = [];
  let scheduleLimited = false;
  try {
    dues = committeeDuesThrough(committee, preview.estimatedEndDate);
  } catch (error) {
    scheduleLimited = true;
  }
  const allocated = await getAllocatedByDue({
    businessOwnerId,
    dueKeys: dues.map((row) => row.dueKey),
  });
  const scheduleRows = dues.map((due) => {
    const allocatedAmount = Math.min(due.amount, roundMoney(allocated.get(due.dueKey) || 0));
    const remainingAmount = Math.max(0, roundMoney(due.amount - allocatedAmount));
    let paymentStatus = 'upcoming';
    if (remainingAmount <= 0.005) paymentStatus = 'paid';
    else if (allocatedAmount > 0) paymentStatus = 'partial';
    else if (due.dueDate < today()) paymentStatus = 'overdue';
    else if (due.dueDate === today()) paymentStatus = 'due_today';
    return { ...due, allocatedAmount, remainingAmount, paymentStatus };
  });
  const collectedAmount = roundMoney(scheduleRows.reduce((sum, row) => sum + row.allocatedAmount, 0));
  const remainingAmount = Math.max(0, roundMoney(Number(committee.targetAmount) - collectedAmount));
  const nextDue = scheduleRows.find((row) => row.remainingAmount > 0.005 && row.dueDate >= today()) || null;
  const overdueAmount = roundMoney(scheduleRows.filter((row) => row.dueDate < today()).reduce((sum, row) => sum + row.remainingAmount, 0));
  const paidInstallments = scheduleRows.filter((row) => row.paymentStatus === 'paid').length;
  let movements = []; let appliedRows = []; let refundableSavings = 0; let invoices = [];
  if (includeFinancial) {
    [movements, appliedRows, refundableSavings, invoices] = await Promise.all([
      PaymentTransaction.aggregate([
        { $match: { businessOwnerId: oid(businessOwnerId), committeeId: oid(committee._id), status: 'posted' } },
        { $group: { _id: '$transactionType', amount: { $sum: '$amount' } } },
      ]),
      Allocation.aggregate([
        { $match: { businessOwnerId: oid(businessOwnerId), committeeId: oid(committee._id), allocationType: 'advance_to_invoice', status: 'allocated' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
      verifiedAvailableAdvance(businessOwnerId, committee.memberId?._id || committee.memberId, null, committee._id),
      linkedInvoices(businessOwnerId, committee._id),
    ]);
  }
  const contributionTypes = new Set(['customer_receipt', 'customer_advance', 'invoice_customer_receipt']);
  const totalDeposited = roundMoney(movements.filter((row) => contributionTypes.has(row._id)).reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const totalPaidOut = roundMoney(movements.filter((row) => row._id === 'committee_savings_payout').reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const appliedToInvoices = roundMoney(appliedRows[0]?.amount || 0);
  const invoiceOutstanding = roundMoney(invoices.reduce((sum, row) => sum + row.outstandingAmount, 0));
  const targetReached = remainingAmount <= 0.005;
  const financiallySettled = includeFinancial && refundableSavings <= 0.005 && invoiceOutstanding <= 0.005;
  const effectiveStatus = committee.isArchived
    ? 'archived'
    : committee.closureType === 'early'
      ? 'closed_early'
      : committee.closureType === 'settled' || (targetReached && financiallySettled)
        ? 'completed'
        : targetReached
          ? 'target_reached'
          : committee.status;
  return {
    ...committee,
    preview,
    financials: {
      collectedAmount,
      remainingAmount,
      overdueAmount,
      paidInstallments,
      totalInstallments: scheduleRows.length,
      pendingInstallments: scheduleRows.filter((row) => row.remainingAmount > 0.005).length,
      nextDueDate: nextDue?.dueDate || '',
      scheduleLimited,
      totalDeposited,
      totalPaidOut,
      appliedToInvoices,
      refundableSavings,
      invoiceOutstanding,
      targetReached,
      payoutStatus: totalPaidOut > 0 ? (refundableSavings > 0.005 ? 'partially_paid_out' : 'paid_out') : 'not_paid_out',
    },
    effectiveStatus,
    ...(includeSchedule ? { scheduleRows } : {}),
  };
};

const linkedInvoices = async (businessOwnerId, committeeId) => {
  let invoices = await Invoice.find({
    businessOwnerId,
    committeeId,
    status: 'posted',
    accountingStatus: 'posted',
  }).select('invoiceNumber publicInvoiceNumber correctsInvoiceId invoiceDate dueDate totalSale').sort({ invoiceDate: -1 }).lean();
  invoices = await decorateInvoiceReferences(invoices, businessOwnerId);
  invoices = invoices.map((invoice) => ({ ...invoice, internalInvoiceNumber: invoice.invoiceNumber, invoiceNumber: invoice.publicInvoiceNumber || invoice.invoiceNumber }));
  if (!invoices.length) return [];
  const paid = await Allocation.aggregate([
    { $match: { businessOwnerId: oid(businessOwnerId), invoiceId: { $in: invoices.map((row) => row._id) }, status: 'allocated' } },
    { $group: { _id: '$invoiceId', amount: { $sum: '$amount' } } },
  ]);
  const paidMap = new Map(paid.map((row) => [id(row._id), roundMoney(row.amount)]));
  return invoices.map((invoice) => ({
    ...invoice,
    allocatedAmount: paidMap.get(id(invoice._id)) || 0,
    outstandingAmount: Math.max(0, roundMoney(invoice.totalSale - Number(paidMap.get(id(invoice._id)) || 0))),
  }));
};

exports.list = async (req, res) => {
  try {
    const businessOwnerId = ownerId(req);
    const page = asPage(req.query.page, 1, 1000000);
    const limit = asPage(req.query.limit, 25, 100);
    const query = { businessOwnerId };
    const archived = String(req.query.status || '').toLowerCase() === 'archived';
    query.isArchived = archived ? true : { $ne: true };
    if (validId(req.query.memberId)) query.memberId = req.query.memberId;
    if (req.query.frequency) query['schedule.frequency'] = String(req.query.frequency);
    if (req.query.fromDate || req.query.toDate) {
      query['schedule.startDate'] = {};
      if (req.query.fromDate) query['schedule.startDate'].$gte = String(req.query.fromDate);
      if (req.query.toDate) query['schedule.startDate'].$lte = String(req.query.toDate);
    }
    const search = String(req.query.search || '').trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      const members = await Member.find({ businessOwnerId, $or: [{ fullName: regex }, { mobile: regex }, { memberNumber: regex }] }).select('_id').lean();
      query.$or = [{ committeeNumber: regex }, { memberId: { $in: members.map((row) => row._id) } }];
    }
    const committees = await Committee.find(query)
      .populate('memberId', 'fullName memberNumber mobile status isArchived')
      .sort({ createdAt: -1 })
      .limit(5001)
      .lean();
    if (committees.length > 5000) return res.status(413).json({ message: 'Please narrow the committee filters' });
    let rows = await Promise.all(committees.map((committee) => committeeSnapshot(committee, businessOwnerId)));
    const fundingSummary = {
      paid: rows.filter((row) => matchesFunding(row, 'paid')).length,
      partial: rows.filter((row) => matchesFunding(row, 'partial')).length,
      unpaid: rows.filter((row) => matchesFunding(row, 'unpaid')).length,
      overdue: rows.filter((row) => matchesFunding(row, 'overdue')).length,
    };
    const status = String(req.query.status || 'active').toLowerCase();
    if (status === 'active') rows = rows.filter((row) => row.effectiveStatus === 'active');
    else if (status === 'target_reached') rows = rows.filter((row) => row.effectiveStatus === 'target_reached');
    else if (status === 'completed') rows = rows.filter((row) => row.effectiveStatus === 'completed');
    else if (status === 'closed_early') rows = rows.filter((row) => row.effectiveStatus === 'closed_early');
    else if (status === 'paused') rows = rows.filter((row) => row.effectiveStatus === 'paused');
    else if (status === 'closed') rows = rows.filter((row) => row.effectiveStatus === 'closed');
    const funding = String(req.query.funding || '').toLowerCase();
    if (['paid', 'partial', 'unpaid', 'overdue'].includes(funding)) rows = rows.filter((row) => matchesFunding(row, funding));
    if (req.query.due === 'today') rows = rows.filter((row) => row.financials.nextDueDate === today());
    if (req.query.due === 'overdue') rows = rows.filter((row) => row.financials.overdueAmount > 0);
    const sorters = {
      oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
      member: (a, b) => String(a.memberId?.fullName || '').localeCompare(String(b.memberId?.fullName || '')),
      target: (a, b) => Number(b.targetAmount) - Number(a.targetAmount),
      next_due: (a, b) => String(a.financials.nextDueDate || '9999').localeCompare(String(b.financials.nextDueDate || '9999')),
      outstanding: (a, b) => b.financials.remainingAmount - a.financials.remainingAmount,
      recent: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    };
    rows.sort(sorters[req.query.sort] || sorters.recent);
    const total = rows.length;
    return res.json({ rows: rows.slice((page - 1) * limit, page * limit), page, pages: Math.max(1, Math.ceil(total / limit)), total, fundingSummary });
  } catch (error) {
    console.error('Installments committee list failed:', error);
    return res.status(400).json({ message: error.message || 'Failed to load committees' });
  }
};

exports.detail = async (req, res) => {
  try {
    if (!validId(req.params.committeeId)) return res.status(400).json({ message: 'Invalid committee ID' });
    const businessOwnerId = ownerId(req);
    const committee = await Committee.findOne({ _id: req.params.committeeId, businessOwnerId })
      .populate('memberId', 'fullName memberNumber mobile alternateMobile status isArchived')
      .lean();
    if (!committee) return res.status(404).json({ message: 'Committee not found' });
    const [snapshot, invoices, unappliedAdvance] = await Promise.all([
      committeeSnapshot(committee, businessOwnerId, { includeSchedule: true, includeFinancial: true }),
      linkedInvoices(businessOwnerId, committee._id),
      verifiedAvailableAdvance(businessOwnerId, committee.memberId._id, null, committee._id),
    ]);
    const page = asPage(req.query.page, 1, 1000000);
    const limit = asPage(req.query.limit, 20, 100);
    let scheduleRows = snapshot.scheduleRows;
    if (req.query.fromDate) scheduleRows = scheduleRows.filter((row) => row.dueDate >= req.query.fromDate);
    if (req.query.toDate) scheduleRows = scheduleRows.filter((row) => row.dueDate <= req.query.toDate);
    const scheduleTotal = scheduleRows.length;
    delete snapshot.scheduleRows;
    return res.json({
      committee: snapshot,
      linkedInvoices: invoices,
      unappliedAdvance,
      reconciliationRequired: snapshot.financials.scheduleLimited,
      schedule: {
        rows: scheduleRows.slice((page - 1) * limit, page * limit),
        page,
        pages: Math.max(1, Math.ceil(scheduleTotal / limit)),
        total: scheduleTotal,
      },
    });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Failed to load committee details' });
  }
};

exports.archive = async (req, res) => {
  try {
    if (!validId(req.params.committeeId)) return res.status(400).json({ message: 'Invalid committee ID' });
    const businessOwnerId = ownerId(req);
    const committee = await Committee.findOne({ _id: req.params.committeeId, businessOwnerId, isArchived: { $ne: true } }).populate('memberId', 'fullName');
    if (!committee) return res.status(404).json({ message: 'Active committee not found' });
    const [snapshot, invoices, unappliedAdvance] = await Promise.all([
      committeeSnapshot(committee.toObject(), businessOwnerId),
      linkedInvoices(businessOwnerId, committee._id),
      verifiedAvailableAdvance(businessOwnerId, committee.memberId._id, null, committee._id),
    ]);
    const invoiceOutstanding = roundMoney(invoices.reduce((sum, row) => sum + row.outstandingAmount, 0));
    const scheduledRemaining = committee.closureType === 'early' ? 0 : snapshot.financials.remainingAmount;
    if (scheduledRemaining > 0.005 || unappliedAdvance > 0.005 || invoiceOutstanding > 0.005) {
      return res.status(409).json({
        message: 'Committee cannot be archived while plan-specific financial obligations remain',
        obligations: { scheduledRemaining, unappliedAdvance, invoiceOutstanding },
      });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'Archive reason is required' });
    committee.isArchived = true;
    committee.archivedAt = new Date();
    committee.archivedBy = actorId(req);
    committee.archiveReason = reason;
    committee.updatedBy = actorId(req);
    await committee.save();
    await logActivity({ req, action: 'archive', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: committee._id, title: committee.committeeNumber, description: reason });
    return res.json({ message: 'Committee archived successfully', committee });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to archive committee' });
  }
};

exports.closeEarly = async (req, res) => {
  try {
    if (!validId(req.params.committeeId)) return res.status(400).json({ message: 'Invalid committee ID' });
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'A close-early reason is required' });
    const businessOwnerId = ownerId(req);
    const committee = await Committee.findOne({ _id: req.params.committeeId, businessOwnerId, status: { $in: ['active', 'paused'] }, isArchived: { $ne: true } });
    if (!committee) return res.status(409).json({ message: 'Only an active or paused committee can be closed early' });
    const [refundableSavings, invoices] = await Promise.all([
      verifiedAvailableAdvance(businessOwnerId, committee.memberId, null, committee._id),
      linkedInvoices(businessOwnerId, committee._id),
    ]);
    const invoiceOutstanding = roundMoney(invoices.reduce((sum, row) => sum + row.outstandingAmount, 0));
    if (refundableSavings > 0.005 || invoiceOutstanding > 0.005) {
      return res.status(409).json({
        message: 'Settle the committee-specific refundable balance and linked invoices before closing early',
        obligations: { refundableSavings, invoiceOutstanding },
      });
    }
    const closeDate = today();
    const history = committee.scheduleHistory || [];
    if (!history.length) {
      history.push({ effectiveFrom: committee.schedule.startDate, effectiveTo: closeDate, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount, schedule: committee.schedule.toObject ? committee.schedule.toObject() : committee.schedule, status: 'active', changedBy: committee.updatedBy || committee.createdBy });
    } else if (!history[history.length - 1].effectiveTo) history[history.length - 1].effectiveTo = closeDate;
    committee.scheduleHistory = history;
    Object.assign(committee, { status: 'closed', closureType: 'early', closedAt: new Date(), closedBy: actorId(req), closeReason: reason, updatedBy: actorId(req) });
    await committee.save();
    await logActivity({ req, action: 'close_early', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: committee._id, title: committee.committeeNumber, description: reason, after: { status: 'closed', closureType: 'early', closedAt: committee.closedAt } });
    return res.json({ message: 'Committee closed early successfully', committee });
  } catch (error) {
    return res.status(error.statusCode || 400).json({ message: error.message || 'Unable to close committee early' });
  }
};

exports.restore = async (req, res) => {
  try {
    if (!validId(req.params.committeeId)) return res.status(400).json({ message: 'Invalid committee ID' });
    const committee = await Committee.findOne({ _id: req.params.committeeId, businessOwnerId: ownerId(req), isArchived: true });
    if (!committee) return res.status(404).json({ message: 'Archived committee not found' });
    const member = await Member.findOne({ _id: committee.memberId, businessOwnerId: ownerId(req), isArchived: false });
    if (!member) return res.status(409).json({ message: 'Restore the member before restoring this committee' });
    committee.isArchived = false;
    committee.archivedAt = null;
    committee.archivedBy = null;
    committee.archiveReason = '';
    committee.restoredAt = new Date();
    committee.restoredBy = actorId(req);
    committee.updatedBy = actorId(req);
    await committee.save();
    await logActivity({ req, action: 'restore', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: committee._id, title: committee.committeeNumber, description: 'Committee restored' });
    return res.json({ message: 'Committee restored successfully', committee });
  } catch (error) {
    return res.status(400).json({ message: error.message || 'Unable to restore committee' });
  }
};
