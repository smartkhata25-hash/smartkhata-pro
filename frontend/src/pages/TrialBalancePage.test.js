import {
  getTrialBalanceLedgerPath,
  getTrialBalancePdfMeta,
  normalizeTrialBalanceScope,
} from './trialBalanceUtils';

describe('Trial Balance module presentation', () => {
  test.each([
    ['trading', 'account 1', '/ledger/account%201'],
    ['travel', 'travel-account', '/ledger/travel-account?moduleScope=travel'],
    ['weaving', 'weaving-account', '/weaving/general-ledger/weaving-account'],
  ])('builds the %s ledger drill-down', (scope, accountId, expected) => {
    expect(getTrialBalanceLedgerPath(scope, accountId)).toBe(expected);
  });

  test('defaults unknown scopes to Trading', () => {
    expect(normalizeTrialBalanceScope('unknown')).toBe('trading');
  });

  test('builds module and period specific PDF metadata', () => {
    expect(getTrialBalancePdfMeta('travel', '2026-10-01', '2026-10-09')).toEqual({
      title: 'Travel Trial Balance',
      dateRange: '2026-10-01 to 2026-10-09',
      filename: 'travel_trial_balance_2026-10-01_2026-10-09.pdf',
    });
    expect(getTrialBalancePdfMeta('weaving').filename).toBe('weaving_trial_balance.pdf');
  });
});
