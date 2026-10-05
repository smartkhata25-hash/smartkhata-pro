import { getPayrollActionState, getSimplePayrollStatus, invalidatePayrollReview } from './weavingPayrollUi';

const permissions = { canEdit: true, canPay: true, canDelete: true };

test('maps payroll actions to valid financial states', () => {
  expect(getPayrollActionState({ payroll: { status: 'draft' }, permissions }).canPay).toBe(false);
  expect(getPayrollActionState({ payroll: { status: 'finalized', remainingDue: 100 }, permissions }).canPay).toBe(true);
  expect(getPayrollActionState({ payroll: { status: 'partially_paid', remainingDue: 50 }, permissions }).canPay).toBe(true);
  expect(getPayrollActionState({ payroll: { status: 'paid', remainingDue: 0 }, permissions }).canPay).toBe(false);
  expect(getPayrollActionState({ payroll: { status: 'finalized', isFinalSettlement: true }, permissions }).canAdjust).toBe(false);
});

test('presents revised and receivable states clearly', () => {
  expect(getSimplePayrollStatus({ status: 'finalized', remainingDue: 100, revisionHistory: [{}] })).toBe('Finalized · Revised');
  expect(getSimplePayrollStatus({ status: 'paid', remainingDue: -500 })).toBe('Employee Receivable');
});

test('invalidates reviewed totals when a calculation input changes', () => {
  const reviewed = { ready: true, netPayable: 1000 };
  const result = invalidatePayrollReview({ fromDate: '2026-09-01', toDate: '2026-09-14' }, reviewed);
  expect(result.precheck).toBeNull();
  expect(result.form.toDate).toBe('2026-09-14');
});
