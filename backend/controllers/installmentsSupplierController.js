const mongoose = require('mongoose');
const Supplier = require('../models/InstallmentsSupplier');
const LedgerEntry = require('../models/InstallmentsSupplierLedgerEntry');
const { logActivity } = require('../utils/activityLogger');
const { roundMoney } = require('../utils/money');
const { getCurrentBusinessDateKey } = require('../utils/businessDate');
const { getLedger, nextSupplierNumber, peekSupplierNumber, setOpeningBalance } = require('../services/installments/installmentsSupplierService');

const ownerId = (req) => req.user?.businessOwnerId || req.user?.id || req.userId;
const actorId = (req) => req.actorId || req.user?.actorId || ownerId(req);
const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const today = () => getCurrentBusinessDateKey();
const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const can = (req, permission) => req.user?.accountRole === 'owner' || (req.user?.permissions || []).includes(permission);
const serialize = (supplier, extras = {}) => ({ ...(supplier?.toObject ? supplier.toObject() : supplier), openingBalanceAmount: Math.abs(Number(supplier?.openingBalanceSigned || 0)), openingBalanceType: Number(supplier?.openingBalanceSigned || 0) < 0 ? 'receivable' : 'payable', ...extras });
const publicSupplier = (supplier) => { const safe = { ...supplier }; ['openingBalanceSigned', 'openingBalanceAmount', 'openingBalanceType', 'openingBalanceDate', 'openingBalanceInitializedAt', 'openingBalanceEnteredBy', 'openingBalanceLastAdjustedAt', 'openingBalanceLastAdjustedBy'].forEach((key) => delete safe[key]); return safe; };
const validate = (body = {}, existing = null) => {
  const name = String(body.name ?? existing?.name ?? '').trim(); if (!name) throw new Error('Supplier name is required');
  const phone = String(body.phone ?? existing?.phone ?? '').trim(); const digits = phone.replace(/\D/g, '');
  if (phone && !/^(?:03\d{9}|923\d{9}|3\d{9})$/.test(digits)) throw new Error('Enter a valid Pakistani phone number');
  return { name, phone, notes: String(body.notes ?? existing?.notes ?? '').trim() };
};
const scoped = (req, activeOnly = false) => validId(req.params.supplierId) ? Supplier.findOne({ _id: req.params.supplierId, businessOwnerId: ownerId(req), ...(activeOnly ? { isArchived: false } : {}) }) : null;
const validDates = (start, end) => { if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end)) || (start && end && start > end)) throw new Error('Invalid ledger date range'); };

exports.nextNumber = async (req, res) => { try { return res.json({ number: await peekSupplierNumber(ownerId(req)) }); } catch { return res.status(500).json({ message: 'Unable to generate supplier number' }); } };
exports.list = async (req, res) => {
  try {
    const businessOwnerId = ownerId(req); const status = ['active', 'archived', 'all'].includes(req.query.status) ? req.query.status : 'active'; const query = { businessOwnerId };
    if (status === 'active') query.isArchived = false; if (status === 'archived') query.isArchived = true;
    if (String(req.query.search || '').trim()) { const regex = new RegExp(escapeRegex(req.query.search.trim()), 'i'); query.$or = [{ name: regex }, { phone: regex }, { supplierNumber: regex }]; }
    const suppliers = await Supplier.find(query).sort({ createdAt: -1 }).lean(); const mayView = can(req, 'installments.suppliers.ledger.view');
    if (!suppliers.length || !mayView) return res.json(suppliers.map((row) => publicSupplier(serialize(row))));
    const balances = await LedgerEntry.aggregate([{ $match: { businessOwnerId: new mongoose.Types.ObjectId(businessOwnerId), supplierId: { $in: suppliers.map((row) => row._id) } } }, { $group: { _id: '$supplierId', debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } }]);
    const map = new Map(balances.map((row) => [String(row._id), roundMoney(row.credit - row.debit)])); return res.json(suppliers.map((row) => serialize(row, { balance: map.get(String(row._id)) || 0 })));
  } catch { return res.status(500).json({ message: 'Failed to load suppliers' }); }
};
exports.create = async (req, res) => {
  const session = await mongoose.startSession(); let supplier; let openingChange;
  try {
    const payload = validate(req.body); if (!can(req, 'installments.suppliers.opening.manage') && (Number(req.body.openingBalanceAmount || 0) !== 0)) return res.status(403).json({ message: 'Opening balance permission is required' });
    await session.withTransaction(async () => { const supplierNumber = await nextSupplierNumber(ownerId(req), session); [supplier] = await Supplier.create([{ businessOwnerId: ownerId(req), supplierNumber, ...payload, createdBy: actorId(req), updatedBy: actorId(req) }], { session }); openingChange = await setOpeningBalance({ supplier, amount: req.body.openingBalanceAmount || 0, type: req.body.openingBalanceType || 'payable', entryDate: today(), actorId: actorId(req), session }); });
    await logActivity({ req, action: 'create', module: 'installments.suppliers', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Installments supplier created', after: serialize(supplier) });
    if (openingChange) await logActivity({ req, action: 'create', module: 'installments.suppliers.opening', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Supplier opening balance initialized', after: openingChange });
    return res.status(201).json({ supplier: serialize(supplier) });
  } catch (error) { return res.status(error?.code === 11000 ? 409 : 400).json({ message: error?.code === 11000 ? 'Supplier number already exists' : error.message }); }
  finally { await session.endSession(); }
};
exports.detail = async (req, res) => {
  try { const supplier = await scoped(req); if (!supplier) return res.status(404).json({ message: 'Supplier not found' }); validDates(req.query.startDate, req.query.endDate); const mayView = can(req, 'installments.suppliers.ledger.view'); const ledger = mayView ? await getLedger({ businessOwnerId: ownerId(req), supplierId: supplier._id, startDate: req.query.startDate, endDate: req.query.endDate }) : null; const data = serialize(supplier, mayView ? { balance: ledger.closingBalance } : {}); return res.json({ supplier: mayView ? data : publicSupplier(data), ...(mayView ? { ledger: ledger.entries, openingBalance: ledger.openingBalance, closingBalance: ledger.closingBalance } : {}) }); }
  catch (error) { return res.status(400).json({ message: error.message }); }
};
exports.update = async (req, res) => {
  try {
    const supplier = await scoped(req, true); if (!supplier) return res.status(404).json({ message: 'Active supplier not found' }); const before = serialize(supplier); Object.assign(supplier, validate(req.body, supplier), { updatedBy: actorId(req) });
    const openingChanged = Object.prototype.hasOwnProperty.call(req.body, 'openingBalanceAmount') || Object.prototype.hasOwnProperty.call(req.body, 'openingBalanceType');
    if (openingChanged) { if (!can(req, 'installments.suppliers.opening.manage')) return res.status(403).json({ message: 'Opening balance permission is required' }); const change = await setOpeningBalance({ supplier, amount: req.body.openingBalanceAmount ?? Math.abs(supplier.openingBalanceSigned), type: req.body.openingBalanceType ?? (supplier.openingBalanceSigned < 0 ? 'receivable' : 'payable'), entryDate: supplier.openingBalanceDate || today(), actorId: actorId(req) }); if (change) await logActivity({ req, action: 'adjust', module: 'installments.suppliers.opening', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Supplier opening balance adjusted', before: { signedBalance: change.previousSigned }, after: { signedBalance: change.nextSigned, delta: change.delta } }); } else await supplier.save();
    await logActivity({ req, action: 'update', module: 'installments.suppliers', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Installments supplier updated', before, after: serialize(supplier) }); return res.json({ supplier: serialize(supplier) });
  } catch (error) { return res.status(400).json({ message: error.message }); }
};
exports.summary = async (req, res) => { const supplier = await scoped(req); if (!supplier) return res.status(404).json({ message: 'Supplier not found' }); const ledger = await getLedger({ businessOwnerId: ownerId(req), supplierId: supplier._id }); return res.json({ closingBalance: ledger.closingBalance, canArchive: Math.abs(ledger.closingBalance) < 0.005 }); };
exports.archive = async (req, res) => { const supplier = await scoped(req, true); if (!supplier) return res.status(404).json({ message: 'Active supplier not found' }); const ledger = await getLedger({ businessOwnerId: ownerId(req), supplierId: supplier._id }); if (Math.abs(ledger.closingBalance) >= 0.005) { await logActivity({ req, action: 'reject', module: 'installments.suppliers', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Supplier archive blocked by unsettled balance', metadata: { closingBalance: ledger.closingBalance } }); return res.status(409).json({ code: 'SUPPLIER_UNSETTLED', closingBalance: ledger.closingBalance, message: `This supplier has an unsettled balance of ${Math.abs(ledger.closingBalance)}. Please settle the account before deleting.` }); } supplier.isArchived = true; supplier.archivedAt = new Date(); supplier.archivedBy = actorId(req); supplier.updatedBy = actorId(req); await supplier.save(); await logActivity({ req, action: 'delete', module: 'installments.suppliers', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Installments supplier archived' }); return res.json({ supplier: serialize(supplier) }); };
exports.restore = async (req, res) => { const supplier = await scoped(req); if (!supplier?.isArchived) return res.status(404).json({ message: 'Archived supplier not found' }); supplier.isArchived = false; supplier.archivedAt = null; supplier.archivedBy = null; supplier.restoredAt = new Date(); supplier.restoredBy = actorId(req); supplier.updatedBy = actorId(req); await supplier.save(); await logActivity({ req, action: 'restore', module: 'installments.suppliers', moduleScope: 'installments', entityType: 'InstallmentsSupplier', entityId: supplier._id, title: supplier.supplierNumber, description: 'Installments supplier restored' }); return res.json({ supplier: serialize(supplier) }); };
