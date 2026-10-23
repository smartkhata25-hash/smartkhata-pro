const InstallmentsLedgerEntry = require('../../models/InstallmentsLedgerEntry');
const InstallmentsSequence = require('../../models/InstallmentsSequence');
const { roundMoney } = require('../../utils/money');
const { decorateLedgerReferences } = require('../../utils/installmentsInvoiceIdentity');
const { projectInstallmentsLedgerEntries } = require('../../utils/installmentsOperationalProjection');

const nextNumber = async (businessOwnerId, key, prefix, session = null) => {
  const options = { new: true, upsert: true, setDefaultsOnInsert: true };
  if (session) options.session = session;
  const sequence = await InstallmentsSequence.findOneAndUpdate(
    { businessOwnerId, key },
    { $inc: { seq: 1 } },
    options,
  );
  return `${prefix ? `${prefix}-` : ''}${String(sequence.seq).padStart(6, '0')}`;
};

const reserveNumberAtLeast = async (businessOwnerId, key, minimum, session = null) => {
  const numericMinimum = Math.max(0, Number(minimum) || 0);
  return InstallmentsSequence.findOneAndUpdate(
    { businessOwnerId, key },
    { $max: { seq: numericMinimum }, $setOnInsert: { businessOwnerId, key } },
    { new: true, upsert: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
  );
};

const peekNextNumber = async (businessOwnerId, key) => {
  const sequence = await InstallmentsSequence.findOne({ businessOwnerId, key }).select('seq').lean();
  return String(Number(sequence?.seq || 0) + 1).padStart(6, '0');
};

const nextCommitteeReference = async ({ businessOwnerId, member, existingCount, session = null }) => {
  const key = `committee:${member._id}`;
  const sequence = await InstallmentsSequence.findOneAndUpdate(
    { businessOwnerId, key },
    [{
      $set: {
        businessOwnerId: { $literal: member.businessOwnerId },
        key,
        seq: { $add: [{ $max: [{ $ifNull: ['$seq', 0] }, Number(existingCount || 0)] }, 1] },
      },
    }],
    { new: true, upsert: true, ...(session ? { session } : {}) },
  );
  const index = Number(sequence.seq);
  return index === 1 ? member.memberNumber : `${member.memberNumber}-${String(index).padStart(2, '0')}`;
};

const normalizeOpeningBalance = (amount, type) => {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value < 0) throw new Error('Opening balance cannot be negative');
  const direction = String(type || 'receivable').toLowerCase();
  if (!['receivable', 'advance'].includes(direction)) throw new Error('Invalid opening balance type');
  return roundMoney(direction === 'advance' ? -value : value);
};

const isDateOnly = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const setOpeningBalance = async ({ member, amount, type, entryDate, actorId, session = null }) => {
  const nextSigned = normalizeOpeningBalance(amount, type);
  const previousSigned = roundMoney(member.openingBalanceSigned || 0);
  const date = String(entryDate || member.joiningDate || '').trim();
  if (!isDateOnly(date)) throw new Error('A valid opening balance date is required');
  const isInitial = !member.openingBalanceInitializedAt;
  const delta = roundMoney(nextSigned - previousSigned);

  if (!isInitial && delta === 0) return null;
  if (delta !== 0) {
    const revision = isInitial ? 'initial' : String(Date.now());
    const entry = {
      businessOwnerId: member.businessOwnerId,
      memberId: member._id,
      entryDate: date,
      sourceType: isInitial ? 'opening_balance' : 'opening_adjustment',
      referenceNumber: `OPEN-${member.memberNumber}${isInitial ? '' : `-${revision.slice(-6)}`}`,
      description: isInitial ? 'Opening Balance' : 'Opening Balance Adjustment',
      debit: delta > 0 ? delta : 0,
      credit: delta < 0 ? Math.abs(delta) : 0,
      signedAmountAfter: nextSigned,
      idempotencyKey: isInitial ? 'opening-balance-initial' : `opening-adjustment-${revision}`,
      createdBy: actorId,
    };
    if (isInitial) {
      const existingOrCreated = await InstallmentsLedgerEntry.findOneAndUpdate(
        {
          businessOwnerId: member.businessOwnerId,
          memberId: member._id,
          idempotencyKey: 'opening-balance-initial',
        },
        { $setOnInsert: entry },
        { new: true, upsert: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) },
      );
      if (roundMoney(existingOrCreated.signedAmountAfter) !== nextSigned) {
        throw new Error('Opening balance was already initialized with a different amount');
      }
    } else {
      await InstallmentsLedgerEntry.create([entry], session ? { session } : {});
    }
  }
  member.openingBalanceSigned = nextSigned;
  member.openingBalanceInitializedAt = member.openingBalanceInitializedAt || new Date();
  if (isInitial) {
    member.openingBalanceDate = date;
    member.openingBalanceEnteredBy = member.openingBalanceEnteredBy || actorId;
  } else {
    member.openingBalanceLastAdjustedAt = new Date();
    member.openingBalanceLastAdjustedBy = actorId;
  }
  member.updatedBy = actorId;
  await member.save(session ? { session } : undefined);
  return { previousSigned, nextSigned, delta };
};

const getLedger = async ({ businessOwnerId, memberId, startDate, endDate }) => {
  const query = { businessOwnerId, memberId };
  if (startDate || endDate) {
    query.entryDate = {};
    if (startDate) query.entryDate.$gte = startDate;
    if (endDate) query.entryDate.$lte = endDate;
  }
  const [entries, earlierEntries] = await Promise.all([
    InstallmentsLedgerEntry.find(query).sort({ entryDate: 1, createdAt: 1 }).lean(),
    startDate
      ? InstallmentsLedgerEntry.find({ businessOwnerId, memberId, entryDate: { $lt: startDate } })
        .lean()
      : Promise.resolve([]),
  ]);
  const openingBalance = roundMoney(earlierEntries.reduce(
    (total, entry) => total + Number(entry.debit || 0) - Number(entry.credit || 0),
    0,
  ));
  let runningBalance = openingBalance;
  const displayEntries = await decorateLedgerReferences(entries, businessOwnerId);
  const projectedEntries = await projectInstallmentsLedgerEntries({ entries: [...earlierEntries, ...displayEntries], businessOwnerId, balanceKind: 'member' });
  const currentProjection = projectedEntries.slice(earlierEntries.length);
  const rows = displayEntries.map((entry, index) => {
    runningBalance = roundMoney(runningBalance + Number(entry.debit || 0) - Number(entry.credit || 0));
    return { ...entry, runningBalance, operationalRunningBalance: currentProjection[index].operationalRunningBalance, isOperationalEffective: currentProjection[index].isOperationalEffective };
  });
  return { entries: rows, openingBalance, closingBalance: runningBalance };
};

module.exports = {
  getLedger,
  nextCommitteeReference,
  nextNumber,
  normalizeOpeningBalance,
  peekNextNumber,
  reserveNumberAtLeast,
  setOpeningBalance,
};

