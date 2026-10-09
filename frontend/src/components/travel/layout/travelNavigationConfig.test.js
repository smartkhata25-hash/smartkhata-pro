import { travelSidebarItems } from './travelNavigationConfig';

test('Travel Reports remains discoverable with Trial Balance permission only', () => {
  expect(travelSidebarItems.find((item) => item.key === 'travelReports')).toMatchObject({
    to: '/travel/reports',
    anyPermissions: ['travel.reports', 'reports.trial_balance'],
  });
});
