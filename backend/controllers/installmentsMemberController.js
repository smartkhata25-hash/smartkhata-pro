const mongoose = require('mongoose');

const InstallmentsCommittee = require('../models/InstallmentsCommittee');
const InstallmentsLedgerEntry = require('../models/InstallmentsLedgerEntry');
const InstallmentsMember = require('../models/InstallmentsMember');
const InstallmentsPaymentAllocation = require('../models/InstallmentsPaymentAllocation');
const { logActivity } = require('../utils/activityLogger');
const { roundMoney } = require('../utils/money');
const { getBusinessDateKey } = require('../utils/businessDate');
const { buildSchedulePreview, normalizeSchedule, parseDateOnly } = require('../services/installments/installmentsScheduleService');
const {
  getLedger,
  nextCommitteeReference,
  nextNumber,
  peekNextNumber,
  reserveNumberAtLeast,
  setOpeningBalance,
} = require('../services/installments/installmentsMemberService');

const ownerIdFrom = (req) => req.user?.businessOwnerId || req.user?.id || req.userId;
const actorIdFrom = (req) => req.actorId || req.user?.actorId || ownerIdFrom(req);
const isOwner = (req) => req.user?.accountRole === 'owner';
const can = (req, permission) => isOwner(req) || (req.user?.permissions || []).includes(permission);
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const cleanNumber = (value) => String(value || '').trim().toUpperCase();
const normalizeNewAccountNumber = (value) => {
  const clean = cleanNumber(value);
  if (!/^\d{1,12}$/.test(clean)) throw new Error('Member / Committee number must contain digits only');
  return clean.padStart(6, '0');
};
const validStoredMemberNumber = (value) => /^MEM-[A-Z0-9-]{1,30}$/.test(value) || /^\d{6,12}$/.test(value);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const today = () => getBusinessDateKey(new Date());
const previousDate = (dateKey) => new Date(Date.parse(`${dateKey}T00:00:00.000Z`) - 86400000).toISOString().slice(0, 10);
const validateDateRange = (startDate, endDate) => {
  if (startDate && !parseDateOnly(startDate)) throw new Error('Invalid ledger start date');
  if (endDate && !parseDateOnly(endDate)) throw new Error('Invalid ledger end date');
  if (startDate && endDate && startDate > endDate) throw new Error('Ledger start date cannot be after end date');
};

const serializeMember = (member, extras = {}) => ({
  ...(member?.toObject ? member.toObject() : member),
  openingBalanceType: Number(member?.openingBalanceSigned || 0) < 0 ? 'advance' : 'receivable',
  openingBalanceAmount: Math.abs(Number(member?.openingBalanceSigned || 0)),
  ...extras,
});

const hideLedgerFields = (member) => {
  const safe = { ...member };
  delete safe.openingBalanceSigned;
  delete safe.openingBalanceAmount;
  delete safe.openingBalanceType;
  delete safe.openingBalanceDate;
  delete safe.openingBalanceInitializedAt;
  delete safe.openingBalanceEnteredBy;
  delete safe.openingBalanceLastAdjustedAt;
  delete safe.openingBalanceLastAdjustedBy;
  return safe;
};

const getScopedMember = async (req, { includeArchived = true } = {}) => {
  if (!validId(req.params.memberId)) return null;
  const query = { _id: req.params.memberId, businessOwnerId: ownerIdFrom(req) };
  if (!includeArchived) query.isArchived = false;
  return InstallmentsMember.findOne(query);
};

const validateMemberPayload = (body = {}, existing = null) => {
  const fullName = String(body.fullName ?? existing?.fullName ?? '').trim();
  if (!fullName) throw new Error('Full name is required');
  const mobile = String(body.mobile ?? existing?.mobile ?? '').trim();
  const mobileDigits = mobile.replace(/\D/g, '');
  if (!mobile) throw new Error('Mobile number is required');
  if (!/^(?:03\d{9}|923\d{9}|3\d{9})$/.test(mobileDigits)) throw new Error('Enter a valid Pakistani mobile number');
  const cnic = String(body.cnic ?? existing?.cnic ?? '').trim();
  if (cnic && !/^\d{13}$/.test(cnic.replace(/\D/g, ''))) throw new Error('CNIC must contain 13 digits');
  const joiningDate = String(body.joiningDate ?? existing?.joiningDate ?? today()).slice(0, 10);
  if (!parseDateOnly(joiningDate)) throw new Error('A valid joining date is required');
  const status = String(body.status ?? existing?.status ?? 'active').toLowerCase();
  if (!['active', 'inactive'].includes(status)) throw new Error('Invalid member status');
  return {
    fullName,
    mobile,
    alternateMobile: String(body.alternateMobile ?? existing?.alternateMobile ?? '').trim(),
    address: String(body.address ?? existing?.address ?? '').trim(),
    cnic,
    joiningDate,
    notes: String(body.notes ?? existing?.notes ?? '').trim(),
    status,
    profileIncomplete: false,
  };
};

const buildCommitteePayload = async (req, member, body = {}, session = null) => {
  const businessOwnerId = ownerIdFrom(req);
  const actorId = actorIdFrom(req);
  const targetAmount = roundMoney(body.targetAmount);
  const contributionAmount = roundMoney(body.contributionAmount);
  const preview = buildSchedulePreview({ schedule: body.schedule, targetAmount, contributionAmount });
  let committeeNumber = cleanNumber(body.committeeNumber);
  if (!committeeNumber) {
    const existingCount = await InstallmentsCommittee.countDocuments({ businessOwnerId, memberId: member._id }).session(session || null);
    committeeNumber = await nextCommitteeReference({ businessOwnerId, member, existingCount, session });
  }
  if (!/^(?:COM-[A-Z0-9-]{1,30}|\d{6,12}(?:-\d{2,4})?)$/.test(committeeNumber)) {
    throw new Error('Invalid committee reference number');
  }
  const status = ['active', 'paused', 'closed'].includes(body.status) ? body.status : 'active';
  return {
    businessOwnerId,
    memberId: member._id,
    committeeNumber,
    targetAmount,
    contributionAmount,
    schedule: preview.schedule,
    status,
    scheduleHistory: [{ effectiveFrom: preview.schedule.startDate, effectiveTo: '', targetAmount, contributionAmount, schedule: preview.schedule, status, changedBy: actorId }],
    notes: String(body.notes || '').trim(),
    createdBy: actorId,
    updatedBy: actorId,
  };
};

exports.getNextNumber = async (req, res) => {
  try {
    return res.json({ number: await peekNextNumber(ownerIdFrom(req), 'account') });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to generate the next member number' });
  }
};

exports.previewSchedule = async (req, res) => {
  try {
    return res.json(buildSchedulePreview(req.body || {}));
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.listMembers = async (req, res) => {
  try {
    const businessOwnerId = ownerIdFrom(req);
    const status = ['active', 'archived', 'all'].includes(req.query.status) ? req.query.status : 'active';
    const query = { businessOwnerId };
    if (status === 'active') query.isArchived = false;
    if (status === 'archived') query.isArchived = true;
    const search = String(req.query.search || '').trim();
    if (search) {
      const regex = new RegExp(escapeRegex(search), 'i');
      query.$or = [{ fullName: regex }, { mobile: regex }, { alternateMobile: regex }, { memberNumber: regex }];
    }
    const members = await InstallmentsMember.find(query).sort({ createdAt: -1 }).lean();
    if (!members.length) return res.json([]);
    const ids = members.map((member) => member._id);
    const mayViewLedger = can(req, 'installments.members.view_ledger');
    const [balances, planCounts] = await Promise.all([
      mayViewLedger ? InstallmentsLedgerEntry.aggregate([
        { $match: { businessOwnerId: new mongoose.Types.ObjectId(businessOwnerId), memberId: { $in: ids } } },
        { $group: { _id: '$memberId', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
      ]) : Promise.resolve([]),
      InstallmentsCommittee.aggregate([
        { $match: { businessOwnerId: new mongoose.Types.ObjectId(businessOwnerId), memberId: { $in: ids } } },
        { $group: { _id: '$memberId', count: { $sum: 1 }, unresolved: { $sum: { $cond: [{ $in: ['$status', ['active', 'paused']] }, 1, 0] } } } },
      ]),
    ]);
    const balanceMap = new Map(balances.map((item) => [String(item._id), roundMoney(item.debit - item.credit)]));
    const planMap = new Map(planCounts.map((item) => [String(item._id), item]));
    return res.json(members.map((member) => {
      const serialized = serializeMember(member, {
        ...(mayViewLedger ? { balance: balanceMap.get(String(member._id)) || 0 } : {}),
        committeeCount: planMap.get(String(member._id))?.count || 0,
        unresolvedCommitteeCount: planMap.get(String(member._id))?.unresolved || 0,
      });
      return mayViewLedger ? serialized : hideLedgerFields(serialized);
    }));
  } catch (error) {
    console.error('Installments member list failed:', error);
    return res.status(500).json({ message: 'Failed to load members' });
  }
};

exports.createMember = async (req, res) => {
  const session = await mongoose.startSession();
  let member = null;
  let firstCommittee = null;
  let openingChange = null;
  try {
    const businessOwnerId = ownerIdFrom(req);
    const actorId = actorIdFrom(req);
    const payload = validateMemberPayload(req.body);
    const hasOpening = hasOwn(req.body, 'openingBalanceAmount') || hasOwn(req.body, 'openingBalanceType');
    if (hasOpening && !can(req, 'installments.opening_balances.manage')) {
      return res.status(403).json({ message: 'Opening balance permission is required' });
    }
    if (req.body.firstCommittee && !can(req, 'installments.committees.create') && !can(req, 'installments.committees.manage')) {
      return res.status(403).json({ message: 'Committee management permission is required' });
    }
    await session.withTransaction(async () => {
      let memberNumber;
      if (req.body.memberNumberManual) {
        memberNumber = normalizeNewAccountNumber(req.body.memberNumber);
        await reserveNumberAtLeast(businessOwnerId, 'account', Number(memberNumber), session);
      } else {
        memberNumber = await nextNumber(businessOwnerId, 'account', '', session);
      }
      [member] = await InstallmentsMember.create([{
        businessOwnerId,
        memberNumber,
        ...payload,
        createdBy: actorId,
        updatedBy: actorId,
      }], { session });
      openingChange = await setOpeningBalance({
        member,
        amount: req.body.openingBalanceAmount || 0,
        type: req.body.openingBalanceType || 'receivable',
        entryDate: req.body.openingBalanceDate || payload.joiningDate,
        actorId,
        session,
      });
      if (req.body.firstCommittee) {
        [firstCommittee] = await InstallmentsCommittee.create(
          [await buildCommitteePayload(req, member, { ...req.body.firstCommittee, committeeNumber: member.memberNumber }, session)],
          { session },
        );
      }
    });
    await logActivity({ req, action: 'create', module: 'installments.opening_balances', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments member opening balance initialized', after: openingChange });
    await logActivity({ req, action: 'create', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments member created', after: { memberNumber: member.memberNumber, fullName: member.fullName } });
    if (firstCommittee) {
      await logActivity({ req, action: 'create', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: firstCommittee._id, title: firstCommittee.committeeNumber, description: 'First committee plan created with member', after: { memberId: member._id, targetAmount: firstCommittee.targetAmount, contributionAmount: firstCommittee.contributionAmount, schedule: firstCommittee.schedule } });
    }
    return res.status(201).json({ member: serializeMember(member), firstCommittee });
  } catch (error) {
    const duplicate = error?.code === 11000;
    return res.status(duplicate ? 409 : 400).json({ message: duplicate ? 'Member or committee number already exists' : error.message });
  } finally {
    await session.endSession();
  }
};

exports.quickCreateMember = async (req, res) => {
  const session = await mongoose.startSession();
  let member = null;
  try {
    const businessOwnerId = ownerIdFrom(req);
    const actorId = actorIdFrom(req);
    const fullName = String(req.body.fullName || '').trim();
    if (fullName.length < 2) return res.status(400).json({ message: 'Enter a valid member name' });
    const duplicate = await InstallmentsMember.findOne({ businessOwnerId, isArchived: false, fullName: new RegExp(`^${escapeRegex(fullName)}$`, 'i') }).lean();
    if (duplicate) return res.status(409).json({ message: 'An active member with this name already exists', member: serializeMember(duplicate) });
    await session.withTransaction(async () => {
      const memberNumber = await nextNumber(businessOwnerId, 'account', '', session);
      [member] = await InstallmentsMember.create([{ businessOwnerId, memberNumber, fullName, mobile: '', joiningDate: today(), status: 'active', profileIncomplete: true, createdBy: actorId, updatedBy: actorId }], { session });
    });
    await logActivity({ req, action: 'create', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Incomplete member profile quick-created from invoice', after: { fullName: member.fullName, profileIncomplete: true } });
    return res.status(201).json({ member: serializeMember(member) });
  } catch (error) { return res.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'Member number already exists' : error.message }); }
  finally { await session.endSession(); }
};

exports.getMember = async (req, res) => {
  try {
    const member = await getScopedMember(req);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    validateDateRange(req.query.startDate, req.query.endDate);
    const businessOwnerId = ownerIdFrom(req);
    const mayViewLedger = can(req, 'installments.members.view_ledger');
    const [committees, ledger] = await Promise.all([
      InstallmentsCommittee.find({ businessOwnerId, memberId: member._id }).sort({ createdAt: -1 }).lean(),
      mayViewLedger
        ? getLedger({ businessOwnerId, memberId: member._id, startDate: req.query.startDate, endDate: req.query.endDate })
        : Promise.resolve({ entries: [], closingBalance: null }),
    ]);
    const enrichedCommittees = committees.map((committee) => ({
      ...committee,
      preview: buildSchedulePreview({ schedule: committee.schedule, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount }),
    }));
    const serializedMember = serializeMember(member, mayViewLedger ? { balance: ledger.closingBalance } : {});
    return res.json({
      member: mayViewLedger ? serializedMember : hideLedgerFields(serializedMember),
      committees: enrichedCommittees,
      ...(mayViewLedger ? { ledger: ledger.entries, closingBalance: ledger.closingBalance } : {}),
    });
  } catch (error) {
    console.error('Installments member detail failed:', error);
    const invalidRange = String(error.message || '').startsWith('Invalid ledger') || String(error.message || '').startsWith('Ledger start');
    return res.status(invalidRange ? 400 : 500).json({ message: invalidRange ? error.message : 'Failed to load member details' });
  }
};

exports.updateMember = async (req, res) => {
  try {
    const member = await getScopedMember(req, { includeArchived: false });
    if (!member) return res.status(404).json({ message: 'Active member not found' });
    const before = serializeMember(member);
    const payload = validateMemberPayload(req.body, member);
    Object.assign(member, payload, { updatedBy: actorIdFrom(req) });
    if (hasOwn(req.body, 'memberNumber')) {
      const memberNumber = cleanNumber(req.body.memberNumber);
      if (!validStoredMemberNumber(memberNumber)) return res.status(400).json({ message: 'Invalid member number' });
      if (memberNumber !== member.memberNumber) return res.status(400).json({ message: 'Member number cannot be changed after creation' });
    }
    const openingChanged = hasOwn(req.body, 'openingBalanceAmount') || hasOwn(req.body, 'openingBalanceType');
    if (openingChanged) {
      if (!can(req, 'installments.opening_balances.manage')) return res.status(403).json({ message: 'Opening balance permission is required' });
      const openingChange = await setOpeningBalance({
        member,
        amount: hasOwn(req.body, 'openingBalanceAmount')
          ? req.body.openingBalanceAmount
          : Math.abs(Number(member.openingBalanceSigned || 0)),
        type: hasOwn(req.body, 'openingBalanceType')
          ? req.body.openingBalanceType
          : Number(member.openingBalanceSigned || 0) < 0 ? 'advance' : 'receivable',
        entryDate: req.body.openingBalanceDate || member.openingBalanceDate || member.joiningDate,
        actorId: actorIdFrom(req),
      });
      if (openingChange) {
        await logActivity({ req, action: 'adjust', module: 'installments.opening_balances', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments opening balance adjusted', before: { signedBalance: openingChange.previousSigned }, after: { signedBalance: openingChange.nextSigned, delta: openingChange.delta } });
      }
    } else {
      await member.save();
    }
    await logActivity({ req, action: 'update', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: openingChanged ? 'Member and opening balance updated' : 'Installments member updated', before, after: serializeMember(member) });
    return res.json({ member: serializeMember(member) });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'Member number already exists' : error.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const member = await getScopedMember(req);
    if (!member) return res.status(404).json({ message: 'Member not found' });
    validateDateRange(req.query.startDate, req.query.endDate);
    const ledger = await getLedger({ businessOwnerId: ownerIdFrom(req), memberId: member._id, startDate: req.query.startDate, endDate: req.query.endDate });
    return res.json({ member: serializeMember(member), ...ledger });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.getFinancialSummary = async (req, res) => {
  const member = await getScopedMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const businessOwnerId = ownerIdFrom(req);
  const [ledger, unresolvedPlans] = await Promise.all([
    getLedger({ businessOwnerId, memberId: member._id }),
    InstallmentsCommittee.countDocuments({ businessOwnerId, memberId: member._id, status: { $in: ['active', 'paused'] } }),
  ]);
  return res.json({
    closingBalance: ledger.closingBalance,
    receivable: Math.max(ledger.closingBalance, 0),
    advanceCredit: Math.max(-ledger.closingBalance, 0),
    unresolvedCommitteeCount: unresolvedPlans,
    canArchive: Math.abs(ledger.closingBalance) < 0.005 && unresolvedPlans === 0,
  });
};

exports.updateOpeningBalance = async (req, res) => {
  try {
    const member = await getScopedMember(req, { includeArchived: false });
    if (!member) return res.status(404).json({ message: 'Active member not found' });
    if (!hasOwn(req.body, 'openingBalanceAmount') && !hasOwn(req.body, 'openingBalanceType')) {
      return res.status(400).json({ message: 'Opening balance amount or type is required' });
    }
    const change = await setOpeningBalance({
      member,
      amount: hasOwn(req.body, 'openingBalanceAmount')
        ? req.body.openingBalanceAmount
        : Math.abs(Number(member.openingBalanceSigned || 0)),
      type: hasOwn(req.body, 'openingBalanceType')
        ? req.body.openingBalanceType
        : Number(member.openingBalanceSigned || 0) < 0 ? 'advance' : 'receivable',
      entryDate: req.body.openingBalanceDate || member.openingBalanceDate || member.joiningDate,
      actorId: actorIdFrom(req),
    });
    if (change) {
      await logActivity({ req, action: 'adjust', module: 'installments.opening_balances', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments opening balance adjusted', before: { signedBalance: change.previousSigned }, after: { signedBalance: change.nextSigned, delta: change.delta } });
    }
    return res.json({ member: serializeMember(member), change });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

exports.archiveMember = async (req, res) => {
  const member = await getScopedMember(req, { includeArchived: false });
  if (!member) return res.status(404).json({ message: 'Active member not found' });
  const businessOwnerId = ownerIdFrom(req);
  const [ledger, unresolvedPlans] = await Promise.all([
    getLedger({ businessOwnerId, memberId: member._id }),
    InstallmentsCommittee.countDocuments({ businessOwnerId, memberId: member._id, status: { $in: ['active', 'paused'] } }),
  ]);
  if (Math.abs(ledger.closingBalance) >= 0.005 || unresolvedPlans > 0) {
    await logActivity({ req, action: 'reject', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Member archive blocked due to unsettled position', metadata: { closingBalance: ledger.closingBalance, unresolvedCommitteeCount: unresolvedPlans } });
    return res.status(409).json({ message: 'Member has an unsettled financial position or unresolved committee plan', closingBalance: ledger.closingBalance, unresolvedCommitteeCount: unresolvedPlans, code: 'MEMBER_UNSETTLED' });
  }
  member.isArchived = true;
  member.archivedAt = new Date();
  member.archivedBy = actorIdFrom(req);
  member.updatedBy = actorIdFrom(req);
  await member.save();
  await logActivity({ req, action: 'delete', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments member archived' });
  return res.json({ message: 'Member archived successfully', member: serializeMember(member) });
};

exports.restoreMember = async (req, res) => {
  const member = await getScopedMember(req);
  if (!member || !member.isArchived) return res.status(404).json({ message: 'Archived member not found' });
  member.isArchived = false;
  member.archivedAt = null;
  member.archivedBy = null;
  member.restoredAt = new Date();
  member.restoredBy = actorIdFrom(req);
  member.updatedBy = actorIdFrom(req);
  await member.save();
  await logActivity({ req, action: 'restore', module: 'installments.members', moduleScope: 'installments', entityType: 'InstallmentsMember', entityId: member._id, title: member.memberNumber, description: 'Installments member restored' });
  return res.json({ message: 'Member restored successfully', member: serializeMember(member) });
};

exports.createCommittee = async (req, res) => {
  try {
    const member = await getScopedMember(req, { includeArchived: false });
    if (!member) return res.status(404).json({ message: 'Active member not found' });
    const committee = await InstallmentsCommittee.create(await buildCommitteePayload(req, member, req.body));
    await logActivity({ req, action: 'create', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: committee._id, title: committee.committeeNumber, description: 'Committee plan created', after: { memberId: member._id, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount, schedule: committee.schedule } });
    return res.status(201).json({ committee, preview: buildSchedulePreview({ schedule: committee.schedule, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount }) });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'Committee number already exists' : error.message });
  }
};

exports.listCommittees = async (req, res) => {
  const member = await getScopedMember(req);
  if (!member) return res.status(404).json({ message: 'Member not found' });
  const committees = await InstallmentsCommittee.find({
    businessOwnerId: ownerIdFrom(req),
    memberId: member._id,
  }).sort({ createdAt: -1 }).lean();
  return res.json(committees.map((committee) => ({
    ...committee,
    preview: buildSchedulePreview({
      schedule: committee.schedule,
      targetAmount: committee.targetAmount,
      contributionAmount: committee.contributionAmount,
    }),
  })));
};

exports.updateCommittee = async (req, res) => {
  try {
    if (!validId(req.params.committeeId)) return res.status(400).json({ message: 'Invalid committee ID' });
    const businessOwnerId = ownerIdFrom(req);
    const committee = await InstallmentsCommittee.findOne({ _id: req.params.committeeId, memberId: req.params.memberId, businessOwnerId, isArchived: { $ne: true } });
    if (!committee) return res.status(404).json({ message: 'Committee not found' });
    const member = await InstallmentsMember.findOne({ _id: committee.memberId, businessOwnerId, isArchived: false });
    if (!member) return res.status(409).json({ message: 'Archived members cannot be used for committee activity' });
    const before = committee.toObject();
    if (hasOwn(req.body, 'targetAmount')) {
      const allocated = await InstallmentsPaymentAllocation.aggregate([
        { $match: { businessOwnerId: new mongoose.Types.ObjectId(String(businessOwnerId)), committeeId: committee._id, allocationType: 'payment_to_schedule', status: 'allocated' } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]);
      if (roundMoney(req.body.targetAmount) + 0.005 < roundMoney(allocated[0]?.amount || 0)) {
        return res.status(409).json({ message: 'Committee target cannot be lower than verified scheduled contributions' });
      }
    }
    const scheduleChanged = ['targetAmount', 'contributionAmount', 'schedule', 'status'].some((key) => hasOwn(req.body, key));
    if (scheduleChanged) {
      const effectiveFrom = today();
      const history = committee.scheduleHistory || [];
      if (history.at(-1)?.effectiveFrom === effectiveFrom) history.pop();
      else if (history.length) history[history.length - 1].effectiveTo = previousDate(effectiveFrom);
      else history.push({ effectiveFrom: before.schedule.startDate, effectiveTo: previousDate(effectiveFrom), targetAmount: before.targetAmount, contributionAmount: before.contributionAmount, schedule: before.schedule, status: before.status, changedBy: before.updatedBy || before.createdBy });
      committee.scheduleHistory = history;
    }
    if (hasOwn(req.body, 'committeeNumber')) {
      const committeeNumber = cleanNumber(req.body.committeeNumber);
      if (!/^(?:COM-[A-Z0-9-]{1,30}|\d{6,12}(?:-\d{2,4})?)$/.test(committeeNumber)) return res.status(400).json({ message: 'Invalid committee reference number' });
      committee.committeeNumber = committeeNumber;
    }
    if (hasOwn(req.body, 'targetAmount')) committee.targetAmount = roundMoney(req.body.targetAmount);
    if (hasOwn(req.body, 'contributionAmount')) committee.contributionAmount = roundMoney(req.body.contributionAmount);
    if (hasOwn(req.body, 'schedule')) committee.schedule = normalizeSchedule(req.body.schedule);
    if (hasOwn(req.body, 'status') && req.body.status === 'closed') return res.status(409).json({ message: 'Use Close Committee Early so financial checks, reason and schedule history are preserved' });
    if (hasOwn(req.body, 'status') && ['active', 'paused'].includes(req.body.status)) committee.status = req.body.status;
    if (hasOwn(req.body, 'notes')) committee.notes = String(req.body.notes || '').trim();
    buildSchedulePreview({ schedule: committee.schedule, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount });
    if (scheduleChanged) committee.scheduleHistory.push({ effectiveFrom: today(), effectiveTo: '', targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount, schedule: committee.schedule.toObject ? committee.schedule.toObject() : committee.schedule, status: committee.status, changedBy: actorIdFrom(req) });
    committee.updatedBy = actorIdFrom(req);
    await committee.save();
    await logActivity({ req, action: 'update', module: 'installments.committees', moduleScope: 'installments', entityType: 'InstallmentsCommittee', entityId: committee._id, title: committee.committeeNumber, description: 'Committee plan or collection schedule updated', before, after: committee.toObject() });
    return res.json({ committee, preview: buildSchedulePreview({ schedule: committee.schedule, targetAmount: committee.targetAmount, contributionAmount: committee.contributionAmount }) });
  } catch (error) {
    return res.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'Committee number already exists' : error.message });
  }
};

