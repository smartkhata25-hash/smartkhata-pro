const InstallmentsSequence = require('../../models/InstallmentsSequence');
const LedgerEntry = require('../../models/InstallmentsSupplierLedgerEntry');
const { roundMoney } = require('../../utils/money');
const { decorateLedgerReferences } = require('../../utils/installmentsInvoiceIdentity');
const { projectInstallmentsLedgerEntries } = require('../../utils/installmentsOperationalProjection');

const peekSupplierNumber = async (businessOwnerId) => {
  const sequence = await InstallmentsSequence.findOne({ businessOwnerId, key: 'supplier' }).select('seq').lean();
  return String(Number(sequence?.seq || 0) + 1);
};
const nextSupplierNumber = async (businessOwnerId, session) => {
  const sequence = await InstallmentsSequence.findOneAndUpdate({ businessOwnerId, key: 'supplier' }, { $inc: { seq: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true, session });
  return String(sequence.seq);
};
const signedOpening = (amount, type) => {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value < 0) throw new Error('Opening amount must be zero or greater');
  if (!['payable', 'receivable'].includes(type)) throw new Error('Invalid balance type');
  return roundMoney(type === 'payable' ? value : -value);
};
const setOpeningBalance = async ({ supplier, amount, type, entryDate, actorId, session = null }) => {
  const next = signedOpening(amount, type); const previous = roundMoney(supplier.openingBalanceSigned || 0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('A valid opening date is required');
  const initial = !supplier.openingBalanceInitializedAt; const delta = roundMoney(next - previous);
  if (!initial && delta === 0) return null;
  if (delta !== 0) {
    const revision = initial ? 'initial' : String(Date.now());
    const entry = { businessOwnerId: supplier.businessOwnerId, supplierId: supplier._id, entryDate, sourceType: initial ? 'opening_balance' : 'opening_adjustment', referenceNumber: `OPEN-SUP-${supplier.supplierNumber}${initial ? '' : `-${revision.slice(-6)}`}`, description: initial ? 'Opening Balance' : 'Opening Balance Adjustment', debit: delta < 0 ? Math.abs(delta) : 0, credit: delta > 0 ? delta : 0, signedAmountAfter: next, idempotencyKey: initial ? 'opening-balance-initial' : `opening-adjustment-${revision}`, createdBy: actorId };
    if (initial) await LedgerEntry.findOneAndUpdate({ businessOwnerId: supplier.businessOwnerId, supplierId: supplier._id, idempotencyKey: entry.idempotencyKey }, { $setOnInsert: entry }, { new: true, upsert: true, setDefaultsOnInsert: true, ...(session ? { session } : {}) });
    else await LedgerEntry.create([entry], session ? { session } : {});
  }
  supplier.openingBalanceSigned = next; supplier.openingBalanceDate = supplier.openingBalanceDate || entryDate;
  supplier.openingBalanceInitializedAt = supplier.openingBalanceInitializedAt || new Date(); supplier.openingBalanceEnteredBy = supplier.openingBalanceEnteredBy || actorId;
  if (!initial) { supplier.openingBalanceLastAdjustedAt = new Date(); supplier.openingBalanceLastAdjustedBy = actorId; }
  supplier.updatedBy = actorId; await supplier.save(session ? { session } : undefined);
  return { previousSigned: previous, nextSigned: next, delta };
};
const getLedger = async ({ businessOwnerId, supplierId, startDate, endDate }) => {
  const query = { businessOwnerId, supplierId }; if (startDate || endDate) { query.entryDate = {}; if (startDate) query.entryDate.$gte = startDate; if (endDate) query.entryDate.$lte = endDate; }
  const [entries, earlier] = await Promise.all([LedgerEntry.find(query).sort({ entryDate: 1, createdAt: 1 }).lean(), startDate ? LedgerEntry.find({ businessOwnerId, supplierId, entryDate: { $lt: startDate } }).lean() : []]);
  let runningBalance = roundMoney(earlier.reduce((sum, row) => sum + Number(row.credit || 0) - Number(row.debit || 0), 0));
  const displayEntries = await decorateLedgerReferences(entries, businessOwnerId);
  const projectedEntries = await projectInstallmentsLedgerEntries({ entries: [...earlier, ...displayEntries], businessOwnerId, balanceKind: 'supplier' });
  const currentProjection = projectedEntries.slice(earlier.length);
  return { openingBalance: runningBalance, entries: displayEntries.map((row, index) => ({ ...row, runningBalance: (runningBalance = roundMoney(runningBalance + Number(row.credit || 0) - Number(row.debit || 0))), operationalRunningBalance: currentProjection[index].operationalRunningBalance, isOperationalEffective: currentProjection[index].isOperationalEffective })), closingBalance: runningBalance };
};
module.exports = { getLedger, nextSupplierNumber, peekSupplierNumber, setOpeningBalance, signedOpening };
