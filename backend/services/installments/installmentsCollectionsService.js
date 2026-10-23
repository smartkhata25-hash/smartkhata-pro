const mongoose = require('mongoose');
const Committee = require('../../models/InstallmentsCommittee');
const Member = require('../../models/InstallmentsMember');
const Invoice = require('../../models/InstallmentsInvoice');
const PaymentTransaction = require('../../models/InstallmentsPaymentTransaction');
const Allocation = require('../../models/InstallmentsPaymentAllocation');
const { roundMoney } = require('../../utils/money');
const { decorateInvoiceReferences } = require('../../utils/installmentsInvoiceIdentity');
const { buildScheduleDues, parseDateOnly } = require('./installmentsScheduleService');
const { memberBalance, verifiedAvailableAdvance } = require('./installmentsPaymentService');

const oid = (value) => new mongoose.Types.ObjectId(String(value));
const id = (value) => String(value?._id || value || '');

const getAllocatedByDue = async ({ businessOwnerId, dueKeys, throughDate = '', session = null }) => {
  if (!dueKeys.length) return new Map();
  let paymentIds = null;
  if (throughDate) {
    paymentIds = await PaymentTransaction.find({
      businessOwnerId,
      status: 'posted',
      transactionDate: { $lte: throughDate },
    }).select('_id').session(session || null).lean();
  }
  const match = {
    businessOwnerId: oid(businessOwnerId),
    scheduledDueKey: { $in: dueKeys },
    status: 'allocated',
  };
  if (paymentIds) match.paymentTransactionId = { $in: paymentIds.map((row) => row._id) };
  const rows = await Allocation.aggregate([
    { $match: match },
    { $group: { _id: '$scheduledDueKey', amount: { $sum: '$amount' } } },
  ]).session(session || null);
  return new Map(rows.map((row) => [row._id, roundMoney(row.amount)]));
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

const buildCommitteeAllocationPlan = async ({ businessOwnerId, memberId, committeeId, amount, transactionDate, session }) => {
  if (!parseDateOnly(transactionDate)) throw new Error('A valid transaction date is required');
  const committee = await Committee.findOne({ _id: committeeId, businessOwnerId, memberId, isArchived: { $ne: true } }).session(session || null).lean();
  if (!committee) throw Object.assign(new Error('Selected committee does not belong to this member'), { statusCode: 409 });
  const dues = committeeDuesThrough(committee, transactionDate);
  const allocated = await getAllocatedByDue({ businessOwnerId, dueKeys: dues.map((row) => row.dueKey), session });
  let remaining = roundMoney(amount);
  const allocations = [];
  for (const due of dues) {
    if (remaining <= 0) break;
    const dueRemaining = Math.max(0, roundMoney(due.amount - Number(allocated.get(due.dueKey) || 0)));
    const applied = Math.min(dueRemaining, remaining);
    if (applied > 0) {
      allocations.push({ committeeId, scheduledDueKey: due.dueKey, amount: applied });
      remaining = roundMoney(remaining - applied);
    }
  }
  return { committee, allocations, unappliedAmount: remaining };
};

const getCollections = async ({ businessOwnerId, date, search = '', committeeId = '', status = '' }) => {
  if (!parseDateOnly(date)) throw new Error('A valid collection date is required');
  const query = { businessOwnerId, status: 'active', isArchived: { $ne: true } };
  if (committeeId && mongoose.Types.ObjectId.isValid(committeeId)) query._id = committeeId;
  const committees = await Committee.find(query)
    .populate('memberId', 'fullName memberNumber mobile status isArchived')
    .sort({ committeeNumber: 1 }).lean();
  const cleanSearch = String(search || '').trim().toLowerCase();
  const candidates = committees.filter((committee) => {
    const member = committee.memberId;
    if (!member || member.isArchived || member.status !== 'active') return false;
    if (!cleanSearch) return true;
    return [member.fullName, member.memberNumber, member.mobile, committee.committeeNumber]
      .some((value) => String(value || '').toLowerCase().includes(cleanSearch));
  });
  const allDues = candidates.flatMap((committee) => committeeDuesThrough(committee, date)
    .map((due) => ({ ...due, committee })));
  const allocated = await getAllocatedByDue({ businessOwnerId, dueKeys: allDues.map((row) => row.dueKey), throughDate: date });
  const candidateCommitteeIds = candidates.map((row) => row._id);
  const dailyReceipts = candidateCommitteeIds.length ? await PaymentTransaction.find({
    businessOwnerId, status: 'posted', paymentSource: 'today_collections', collectionDate: date,
    committeeId: { $in: candidateCommitteeIds },
  }).select('_id memberId committeeId amount referenceNumber accountId createdAt').sort({ createdAt: 1 }).lean() : [];
  const receiptsByCommittee = dailyReceipts.reduce((map, receipt) => {
    const key = id(receipt.committeeId); const current = map.get(key) || [];
    current.push(receipt); map.set(key, current); return map;
  }, new Map());
  const allRows = [];
  for (const committee of candidates) {
    const dues = allDues.filter((row) => id(row.committee._id) === id(committee._id));
    const selected = dues.find((due) => due.dueDate === date);
    const previousShortfall = roundMoney(dues.filter((due) => due.dueDate < date)
      .reduce((sum, due) => sum + Math.max(0, due.amount - Number(allocated.get(due.dueKey) || 0)), 0));
    const scheduledToday = roundMoney(selected?.amount || 0);
    const allocatedToday = roundMoney(selected ? Number(allocated.get(selected.dueKey) || 0) : 0);
    const todayRemaining = Math.max(0, roundMoney(scheduledToday - allocatedToday));
    const remainingExpected = roundMoney(previousShortfall + todayRemaining);
    const collectionReceipts = (receiptsByCommittee.get(id(committee._id)) || []).filter((receipt) => id(receipt.memberId) === id(committee.memberId?._id));
    const dailyReceived = roundMoney(collectionReceipts.reduce((sum, receipt) => sum + Number(receipt.amount || 0), 0));
    if (!selected && previousShortfall <= 0) continue;
    let rowStatus = 'pending';
    if (remainingExpected <= 0) rowStatus = 'collected';
    else if (previousShortfall > 0) rowStatus = 'overdue';
    else if (allocatedToday > 0) rowStatus = 'partial';
    const row = {
      dueKey: selected?.dueKey || `${committee._id}:${date}:overdue`,
      date,
      member: committee.memberId,
      committee: { _id: committee._id, committeeNumber: committee.committeeNumber },
      scheduledToday,
      previousShortfall,
      allocatedToday,
      todayRemaining,
      remainingExpected,
      status: rowStatus,
      suggestedAmount: remainingExpected,
      hasDailyReceipt: collectionReceipts.length > 0,
      dailyReceived,
      dailyReceiptCount: collectionReceipts.length,
      dailyReceipt: collectionReceipts.length === 1 ? collectionReceipts[0] : null,
    };
    allRows.push(row);
  }
  const requestedStatus = status === 'paid' ? 'collected' : status;
  const rows = allRows.filter((row) => !requestedStatus || requestedStatus === 'all' || requestedStatus === row.status);
  const order = { overdue: 0, pending: 1, partial: 2, collected: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || String(a.member.fullName).localeCompare(String(b.member.fullName)));
  const summary = allRows.reduce((acc, row) => {
    acc.expected = roundMoney(acc.expected + row.scheduledToday);
    acc.previousOverdue = roundMoney(acc.previousOverdue + row.previousShortfall);
    acc.remaining = roundMoney(acc.remaining + row.remainingExpected);
    acc[row.status] += 1;
    return acc;
  }, { expected: 0, previousOverdue: 0, remaining: 0, pending: 0, partial: 0, overdue: 0, collected: 0 });
  const visibleCommitteeIds = [...new Set(allRows.map((row) => id(row.committee?._id)).filter(Boolean))].map(oid);
  const receivedRows = visibleCommitteeIds.length ? await PaymentTransaction.aggregate([
    { $match: { businessOwnerId: oid(businessOwnerId), status: 'posted', transactionDate: date, committeeId: { $in: visibleCommitteeIds }, transactionType: { $in: ['customer_receipt', 'customer_advance'] } } },
    { $group: { _id: '$paymentSource', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]) : [];
  summary.actuallyReceived = roundMoney(receivedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  summary.scheduledReceived = roundMoney(receivedRows.filter((row) => row._id === 'today_collections').reduce((sum, row) => sum + Number(row.amount || 0), 0));
  return { date, rows, summary };
};

const getMemberPaymentContext = async ({ businessOwnerId, memberId }) => {
  const member = await Member.findOne({ _id: memberId, businessOwnerId, isArchived: false }).lean();
  if (!member) throw Object.assign(new Error('Active member not found'), { statusCode: 404 });
  const [balance, verifiedAdvance, committees, invoices] = await Promise.all([
    memberBalance(businessOwnerId, memberId),
    verifiedAvailableAdvance(businessOwnerId, memberId),
    Committee.find({ businessOwnerId, memberId, status: 'active', isArchived: { $ne: true } }).sort({ committeeNumber: 1 }).lean(),
    Invoice.find({ businessOwnerId, memberId, status: 'posted', accountingStatus: 'posted' }).select('invoiceNumber publicInvoiceNumber correctsInvoiceId invoiceDate dueDate totalSale existingAdvanceApplied committeeId').sort({ invoiceDate: 1, createdAt: 1, _id: 1 }).lean(),
  ]);
  const displayInvoices = await decorateInvoiceReferences(invoices, businessOwnerId);
  const invoiceIds = displayInvoices.map((row) => row._id);
  const allocations = invoiceIds.length ? await Allocation.aggregate([
    { $match: { businessOwnerId: oid(businessOwnerId), invoiceId: { $in: invoiceIds }, status: 'allocated' } },
    { $group: { _id: '$invoiceId', amount: { $sum: '$amount' }, advanceAmount: { $sum: { $cond: [{ $eq: ['$allocationType', 'advance_to_invoice'] }, '$amount', 0] } } } },
  ]) : [];
  const paidMap = new Map(allocations.map((row) => [id(row._id), { amount: roundMoney(row.amount), advanceAmount: roundMoney(row.advanceAmount) }]));
  const unpaidInvoices = displayInvoices.map((invoice) => { const paid = paidMap.get(id(invoice._id)) || { amount: 0, advanceAmount: 0 }; const allocatedAmount = roundMoney(paid.amount + Math.max(0, Number(invoice.existingAdvanceApplied || 0) - paid.advanceAmount)); return {
    ...invoice,
    internalInvoiceNumber: invoice.invoiceNumber,
    invoiceNumber: invoice.publicInvoiceNumber || invoice.invoiceNumber,
    allocatedAmount,
    outstandingAmount: Math.max(0, roundMoney(invoice.totalSale - allocatedAmount)),
  }; }).filter((row) => row.outstandingAmount > 0);
  const receiptCommittees = await Promise.all(committees.map(async (committee) => ({
    ...committee,
    verifiedAvailableAdvance: await verifiedAvailableAdvance(businessOwnerId, memberId, null, committee._id),
  })));
  const committeesWithCredit = receiptCommittees.filter((committee) => committee.verifiedAvailableAdvance > 0.005);
  return {
    member,
    balance,
    receivable: Math.max(0, balance),
    netCredit: Math.max(0, -balance),
    verifiedAvailableAdvance: verifiedAdvance,
    reconciliationRequired: Math.max(0, -balance) > verifiedAdvance + 0.005,
    committees: committeesWithCredit,
    receiptCommittees,
    unpaidInvoices,
  };
};

module.exports = { buildCommitteeAllocationPlan, committeeDuesThrough, getAllocatedByDue, getCollections, getMemberPaymentContext };
