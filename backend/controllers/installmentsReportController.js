const mongoose = require('mongoose');
const Account = require('../models/Account');
const Committee = require('../models/InstallmentsCommittee');
const ExpenseTitle = require('../models/ExpenseTitle');
const Invoice = require('../models/InstallmentsInvoice');
const Member = require('../models/InstallmentsMember');
const Supplier = require('../models/InstallmentsSupplier');
const { roundMoney } = require('../utils/money');
const { balanceReport, collectionReport, expenseRows, profitReport, resolveRange, savingsReport } = require('../services/installments/installmentsReportService');

const ownerId = (req) => req.user?.businessOwnerId || req.user?.id || req.userId;
const send = (res, error) => res.status(error.statusCode || 400).json({ message: error.message });

exports.lookups = async (req, res) => {
  try {
    const businessOwnerId = ownerId(req);
    const [products, members, committees, suppliers, accounts, expenseTitles] = await Promise.all([
      Invoice.aggregate([{ $match: { businessOwnerId: new mongoose.Types.ObjectId(String(businessOwnerId)), status: 'posted', accountingStatus: 'posted' } }, { $unwind: '$items' }, { $group: { _id: '$items.productId', name: { $first: '$items.productName' }, category: { $first: '$items.category' }, brand: { $first: '$items.brand' } } }, { $sort: { name: 1 } }]),
      Member.find({ businessOwnerId, isArchived: false }).select('fullName memberNumber').sort({ fullName: 1 }).lean(),
      Committee.find({ businessOwnerId }).select('committeeNumber memberId').sort({ committeeNumber: 1 }).lean(),
      Supplier.find({ businessOwnerId, isArchived: false }).select('name supplierNumber').sort({ name: 1 }).lean(),
      Account.find({ userId: businessOwnerId, moduleScope: { $in: ['installments', 'shared'] }, type: 'Asset', category: { $in: ['cash', 'bank', 'online', 'cheque'] }, isActive: { $ne: false } }).select('name code category').sort({ name: 1 }).lean(),
      ExpenseTitle.find({ userId: businessOwnerId, moduleScope: 'installments', isDeleted: { $ne: true } }).select('name categoryId').sort({ name: 1 }).lean(),
    ]);
    return res.json({ products, categories: [...new Set(products.map((row) => row.category).filter(Boolean))].sort(), brands: [...new Set(products.map((row) => row.brand).filter(Boolean))].sort(), members, committees, suppliers, accounts, expenseTitles });
  } catch (error) { return send(res, error); }
};

exports.profit = async (req, res) => { try { return res.json(await profitReport({ businessOwnerId: ownerId(req), filters: req.query })); } catch (error) { return send(res, error); } };
exports.collections = async (req, res) => { try { return res.json(await collectionReport({ businessOwnerId: ownerId(req), filters: req.query })); } catch (error) { return send(res, error); } };
exports.balances = async (req, res) => { try { return res.json(await balanceReport({ businessOwnerId: ownerId(req) })); } catch (error) { return send(res, error); } };
exports.savings = async (req, res) => { try { return res.json(await savingsReport({ businessOwnerId: ownerId(req) })); } catch (error) { return send(res, error); } };
exports.expenses = async (req, res) => {
  try {
    const range = resolveRange(req.query); const rows = await expenseRows({ businessOwnerId: ownerId(req), ...range, ...req.query });
    const group = (key) => Object.values(rows.reduce((map, row) => { const label = key(row) || 'Unclassified'; map[label] ||= { label, amount: 0, count: 0 }; map[label].amount = roundMoney(map[label].amount + row.amount); map[label].count += 1; return map; }, {})).sort((a, b) => b.amount - a.amount);
    return res.json({ range, summary: { totalOperatingExpenses: roundMoney(rows.reduce((sum, row) => sum + row.amount, 0)), transactionCount: rows.length }, byTitle: group((row) => row.title), byCategory: group((row) => row.category?.name), byDate: group((row) => row.date), byAccount: group((row) => row.paidFrom.map((account) => account.name).join(', ')), rows });
  } catch (error) { return send(res, error); }
};
