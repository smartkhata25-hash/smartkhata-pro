const test = require('node:test');
const assert = require('node:assert/strict');

const InstallmentsLedgerEntry = require('../models/InstallmentsLedgerEntry');
const InstallmentsMember = require('../models/InstallmentsMember');
const InstallmentsCommittee = require('../models/InstallmentsCommittee');
const InstallmentsSequence = require('../models/InstallmentsSequence');
const WhatsAppTemplate = require('../models/WhatsAppTemplate');
const {
  DEFAULT_INSTALLMENTS_TEMPLATES,
  DEFAULT_REMINDER_TEMPLATES,
} = require('../controllers/whatsAppTemplateController');
const {
  buildSchedulePreview,
  normalizeSchedule,
} = require('../services/installments/installmentsScheduleService');
const {
  nextCommitteeReference,
  nextNumber,
  normalizeOpeningBalance,
  peekNextNumber,
} = require('../services/installments/installmentsMemberService');
const { requirePermission } = require('../middleware/permissionMiddleware');

const preview = (frequency, schedule = {}) => buildSchedulePreview({
  targetAmount: 1000,
  contributionAmount: 100,
  schedule: { frequency, startDate: '2026-01-30', ...schedule },
});

test('opening balances preserve debit, advance-credit and zero signs', () => {
  assert.equal(normalizeOpeningBalance(15000, 'receivable'), 15000);
  assert.equal(normalizeOpeningBalance(20000, 'advance'), -20000);
  assert.equal(normalizeOpeningBalance(0, 'advance'), 0);
  assert.throws(() => normalizeOpeningBalance(-1, 'receivable'));
});

test('installments ledger supports the complete auditable financial source set', () => {
  assert.deepEqual(
    InstallmentsLedgerEntry.schema.path('sourceType').enumValues,
    ['opening_balance', 'opening_adjustment', 'sale_invoice', 'customer_receipt', 'customer_advance', 'committee_savings_payout', 'payment_reversal', 'invoice_reversal'],
  );
  assert.equal(InstallmentsLedgerEntry.schema.path('cashAccountId'), undefined);
  assert.equal(InstallmentsLedgerEntry.schema.path('receiptId'), undefined);
});

test('member, committee and ledger models are owner-scoped with unique business references', () => {
  const memberIndexes = InstallmentsMember.schema.indexes();
  const committeeIndexes = InstallmentsCommittee.schema.indexes();
  const ledgerIndexes = InstallmentsLedgerEntry.schema.indexes();
  assert.ok(memberIndexes.some(([keys, options]) => keys.businessOwnerId === 1 && keys.memberNumber === 1 && options.unique));
  assert.ok(committeeIndexes.some(([keys, options]) => keys.businessOwnerId === 1 && keys.committeeNumber === 1 && options.unique));
  assert.ok(ledgerIndexes.some(([keys, options]) => keys.businessOwnerId === 1 && keys.memberId === 1 && keys.idempotencyKey === 1 && options.unique));
});

test('interval schedule rules remain distinct and timezone-safe', () => {
  assert.deepEqual(preview('daily').dates.slice(0, 3), ['2026-01-30', '2026-01-31', '2026-02-01']);
  assert.deepEqual(preview('every_other_day').dates.slice(0, 3), ['2026-01-30', '2026-02-01', '2026-02-03']);
  assert.deepEqual(preview('every_3_days').dates.slice(0, 3), ['2026-01-30', '2026-02-02', '2026-02-05']);
  assert.deepEqual(preview('every_15_days').dates.slice(0, 3), ['2026-01-30', '2026-02-14', '2026-03-01']);
  assert.deepEqual(preview('custom_days', { intervalDays: 9 }).dates.slice(0, 3), ['2026-01-30', '2026-02-08', '2026-02-17']);
});

test('weekly, twice-monthly and monthly rules honor their own calendar semantics', () => {
  assert.deepEqual(preview('weekly', { weekday: 1 }).dates.slice(0, 2), ['2026-02-02', '2026-02-09']);
  assert.deepEqual(preview('twice_monthly', { twiceMonthlyDays: [7, 22] }).dates.slice(0, 3), ['2026-02-07', '2026-02-22', '2026-03-07']);
  assert.deepEqual(preview('monthly', { monthlyDay: 31 }).dates.slice(0, 3), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.notDeepEqual(
    preview('every_15_days').dates.slice(0, 3),
    preview('twice_monthly', { twiceMonthlyDays: [7, 22] }).dates.slice(0, 3),
  );
});

test('invalid schedule input is rejected before persistence', () => {
  assert.throws(() => normalizeSchedule({ frequency: 'weekly', startDate: '2026-01-01', weekday: 9 }));
  assert.throws(() => normalizeSchedule({ frequency: 'custom_days', startDate: '2026-01-01', intervalDays: 0 }));
  assert.throws(() => normalizeSchedule({ frequency: 'monthly', startDate: 'not-a-date', monthlyDay: 1 }));
});

test('installments WhatsApp templates are isolated and neutral by default', () => {
  assert.ok(WhatsAppTemplate.schema.path('moduleScope').enumValues.includes('installments'));
  assert.notEqual(DEFAULT_INSTALLMENTS_TEMPLATES.englishTemplate, DEFAULT_REMINDER_TEMPLATES.englishTemplate);
  assert.match(DEFAULT_INSTALLMENTS_TEMPLATES.englishTemplate, /{{name}}/);
  assert.match(DEFAULT_INSTALLMENTS_TEMPLATES.englishTemplate, /{{businessName}}/);
  assert.doesNotMatch(DEFAULT_INSTALLMENTS_TEMPLATES.englishTemplate, /{{balance}}/);
});

test('view-only installments staff cannot pass edit, delete or opening-balance permissions', () => {
  const user = {
    accountRole: 'staff',
    permissions: ['installments.members.view'],
    enabledModules: { installments: true },
  };
  for (const permission of [
    'installments.members.edit',
    'installments.members.delete',
    'installments.opening_balances.manage',
  ]) {
    let nextCalled = false;
    const req = { user };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; },
    };
    requirePermission(permission)(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  }
});

test('unified account preview is non-consuming and save allocation has no legacy prefix', async () => {
  const originalFindOne = InstallmentsSequence.findOne;
  const originalFindOneAndUpdate = InstallmentsSequence.findOneAndUpdate;
  let writes = 0;
  try {
    InstallmentsSequence.findOne = () => ({ select: () => ({ lean: async () => ({ seq: 41 }) }) });
    InstallmentsSequence.findOneAndUpdate = async () => { writes += 1; return { seq: 42 }; };
    assert.equal(await peekNextNumber('owner-1', 'account'), '000042');
    assert.equal(writes, 0);
    assert.equal(await nextNumber('owner-1', 'account', ''), '000042');
    assert.equal(writes, 1);
  } finally {
    InstallmentsSequence.findOne = originalFindOne;
    InstallmentsSequence.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test('later committees derive subordinate references from the member number', async () => {
  const originalFindOneAndUpdate = InstallmentsSequence.findOneAndUpdate;
  try {
    InstallmentsSequence.findOneAndUpdate = async () => ({ seq: 2 });
    const reference = await nextCommitteeReference({
      businessOwnerId: 'owner-1',
      member: { _id: 'member-1', memberNumber: '000123', businessOwnerId: 'owner-1' },
      existingCount: 1,
    });
    assert.equal(reference, '000123-02');
    assert.deepEqual(InstallmentsSequence.schema.path('key').enumValues, []);
  } finally {
    InstallmentsSequence.findOneAndUpdate = originalFindOneAndUpdate;
  }
});
