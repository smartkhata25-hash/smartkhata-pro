export const TRIAL_BALANCE_SCOPES = Object.freeze(['trading', 'travel', 'weaving']);

export const normalizeTrialBalanceScope = (scope) =>
  TRIAL_BALANCE_SCOPES.includes(scope) ? scope : 'trading';

export const getTrialBalancePath = (moduleScope) => {
  const scope = normalizeTrialBalanceScope(moduleScope);
  if (scope === 'weaving') return '/weaving/trial-balance';
  if (scope === 'travel') return '/travel/trial-balance';
  return '/trial-balance';
};

export const getTrialBalanceChartPath = (moduleScope) =>
  `${getTrialBalancePath(moduleScope)}/chart`;

export const getTrialBalanceLedgerPath = (moduleScope, accountId) => {
  const scope = normalizeTrialBalanceScope(moduleScope);
  const id = encodeURIComponent(String(accountId || ''));
  if (scope === 'weaving') return `/weaving/general-ledger/${id}`;
  if (scope === 'travel') return `/ledger/${id}?moduleScope=travel`;
  return `/ledger/${id}`;
};

export const getTrialBalancePdfMeta = (moduleScope, startDate = '', endDate = '') => {
  const scope = normalizeTrialBalanceScope(moduleScope);
  const labels = { trading: 'Trading', travel: 'Travel', weaving: 'Weaving' };
  return {
    title: `${labels[scope]} Trial Balance`,
    dateRange: startDate || endDate ? `${startDate || 'Beginning'} to ${endDate || 'Today'}` : 'All dates',
    filename: `${scope}_trial_balance${startDate || endDate ? `_${startDate || 'start'}_${endDate || 'today'}` : ''}.pdf`,
  };
};
