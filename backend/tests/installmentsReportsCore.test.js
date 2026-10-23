const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Expense = require('../models/Expense');
const ExpenseTitle = require('../models/ExpenseTitle');
const { buildExpenseTitleScopeFilter, documentMatchesExpenseTitleScope } = require('../utils/expenseTitleScope');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../utils/permissionList');
const { resolveRange, summarizeProfitRows } = require('../services/installments/installmentsReportService');

test('Installments expense and title scopes are additive and isolated', () => {
  assert.ok(Expense.schema.path('moduleScope').enumValues.includes('installments'));
  assert.ok(ExpenseTitle.schema.path('moduleScope').enumValues.includes('installments'));
  assert.deepEqual(buildExpenseTitleScopeFilter('installments'), { moduleScope: 'installments' });
  assert.equal(documentMatchesExpenseTitleScope({ moduleScope: 'installments' }, 'installments'), true);
  assert.equal(documentMatchesExpenseTitleScope({ moduleScope: 'trading' }, 'installments'), false);
  assert.equal(documentMatchesExpenseTitleScope({ moduleScope: 'both' }, 'installments'), false);
});

test('profit arithmetic uses sales less COGS less operating expenses exactly once', () => {
  const summary = summarizeProfitRows([{ saleAmount: 100000, purchaseCost: 80000 }], 5000);
  assert.deepEqual(summary, { totalSales: 100000, cogs: 80000, grossProfit: 20000, operatingExpenses: 5000, netProfit: 15000 });
  assert.equal(summarizeProfitRows([{ saleAmount: 100000, purchaseCost: 80000 }], null).netProfit, null);
});

test('report ranges are inclusive, validated and bounded', () => {
  assert.deepEqual(resolveRange({ fromDate: '2026-01-01', toDate: '2026-01-31' }), { fromDate: '2026-01-01', toDate: '2026-01-31' });
  assert.throws(() => resolveRange({ fromDate: '2026-02-01', toDate: '2026-01-01' }), /valid inclusive date range/);
  assert.throws(() => resolveRange({ fromDate: '2024-01-01', toDate: '2026-01-01' }), /cannot exceed 366 days/);
});

test('report and expense permissions are registered and routes stay Installments-specific', () => {
  [...Object.values(PERMISSIONS.INSTALLMENTS_EXPENSES), ...Object.values(PERMISSIONS.INSTALLMENTS_REPORTS)].forEach((permission) => assert.ok(ALL_PERMISSIONS.includes(permission)));
  const routes = fs.readFileSync(path.join(__dirname, '../routes/installmentsReportRoutes.js'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../services/installments/installmentsReportService.js'), 'utf8');
  assert.match(routes, /installments\.reports\.profit/);
  assert.match(service, /status: 'posted', accountingStatus: 'posted'/);
  assert.match(service, /moduleScope: 'installments'/);
  assert.doesNotMatch(service, /supplier_payment.*operating/i);
});
