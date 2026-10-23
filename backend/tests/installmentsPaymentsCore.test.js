const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Committee = require('../models/InstallmentsCommittee');
const PaymentTransaction = require('../models/InstallmentsPaymentTransaction');
const { buildScheduleDues } = require('../services/installments/installmentsScheduleService');
const { PERMISSIONS, ALL_PERMISSIONS } = require('../utils/permissionList');

const committee = (frequency, extra = {}) => ({
  _id: '507f1f77bcf86cd799439011',
  targetAmount: 1000,
  contributionAmount: 300,
  schedule: { frequency, startDate: '2026-01-01', ...extra },
});

test('collection schedules are deterministic and never exceed the target', () => {
  const rows = buildScheduleDues({ committee: committee('daily'), throughDate: '2026-01-10' });
  assert.deepEqual(rows.map((row) => row.dueDate), ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  assert.deepEqual(rows.map((row) => row.amount), [300, 300, 300, 100]);
  assert.equal(rows.reduce((sum, row) => sum + row.amount, 0), 1000);
});

test('weekly, twice-monthly, monthly and custom schedules use stable dates', () => {
  assert.deepEqual(buildScheduleDues({ committee: committee('weekly', { weekday: 1 }), throughDate: '2026-02-28' }).map((row) => row.dueDate), ['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  assert.deepEqual(buildScheduleDues({ committee: committee('twice_monthly', { twiceMonthlyDays: [15, 31] }), throughDate: '2026-03-31' }).map((row) => row.dueDate), ['2026-01-15', '2026-01-31', '2026-02-15', '2026-02-28']);
  assert.deepEqual(buildScheduleDues({ committee: committee('monthly', { monthlyDay: 31 }), throughDate: '2026-05-31' }).map((row) => row.dueDate), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(buildScheduleDues({ committee: committee('custom_days', { intervalDays: 10 }), throughDate: '2026-02-15' }).map((row) => row.dueDate), ['2026-01-01', '2026-01-11', '2026-01-21', '2026-01-31']);
});

test('payment records capture source, mode, split accounting and idempotency', () => {
  assert.ok(PaymentTransaction.schema.path('paymentSource').enumValues.includes('today_collections'));
  assert.ok(PaymentTransaction.schema.path('paymentMode').enumValues.includes('jazzcash'));
  assert.ok(PaymentTransaction.schema.path('receivableAmount'));
  assert.ok(PaymentTransaction.schema.path('advanceAmount'));
  const unique = PaymentTransaction.schema.indexes().find(([fields]) => fields.businessOwnerId === 1 && fields.idempotencyKey === 1);
  assert.equal(unique[1].unique, true);
});

test('committee records retain dated schedule revisions', () => {
  assert.ok(Committee.schema.path('scheduleHistory'));
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/installmentsMemberController.js'), 'utf8');
  assert.match(controller, /effectiveTo: previousDate/);
  assert.match(controller, /committee\.scheduleHistory\.push/);
});

test('payment permissions and one authoritative posting path are wired', () => {
  Object.values(PERMISSIONS.INSTALLMENTS_PAYMENTS).forEach((permission) => assert.ok(ALL_PERMISSIONS.includes(permission)));
  const controller = fs.readFileSync(path.join(__dirname, '../controllers/installmentsPaymentController.js'), 'utf8');
  const routes = fs.readFileSync(path.join(__dirname, '../routes/installmentsPaymentRoutes.js'), 'utf8');
  assert.match(controller, /postPayment\(/);
  assert.match(controller, /paymentSource: req\.body\.paymentSource === 'today_collections'/);
  assert.match(controller, /verifiedAvailableAdvance/);
  assert.match(routes, /installments\.payments\.receive/);
  assert.match(routes, /installments\.payments\.reverse/);
});
