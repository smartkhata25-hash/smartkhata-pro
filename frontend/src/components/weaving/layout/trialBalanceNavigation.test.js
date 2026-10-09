import { weavingSearchConfig, weavingTopMenuConfig } from './weavingNavigationConfig';

test('Weaving exposes Trial Balance in reports and search with its own permission', () => {
  const reports = weavingTopMenuConfig.find((menu) => menu.label === 'weaving.nav.reports');
  const item = reports.sections.flatMap((section) => section.items)
    .find((entry) => entry.path === '/weaving/trial-balance');
  expect(reports.anyPermissions).toContain('reports.trial_balance');
  expect(item).toMatchObject({
    label: 'reports.trialBalance',
    permission: 'reports.trial_balance',
  });
  expect(weavingSearchConfig).toContainEqual(expect.objectContaining({
    terms: ['trial balance', 'balance'],
    path: '/weaving/trial-balance',
    permission: 'reports.trial_balance',
  }));
});
