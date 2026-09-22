import {
  weavingDashboardItem,
  weavingSearchConfig,
  weavingSidebarItems,
  weavingTopMenuConfig,
} from './weavingNavigationConfig';
import { weavingDashboardCards } from '../dashboard/weavingDashboardConfig';

const topMenuLabels = weavingTopMenuConfig.map((item) => item.label);
const topMenuPaths = weavingTopMenuConfig.flatMap((menu) => [
  menu.path,
  ...(menu.sections || []).flatMap((section) =>
    (section.items || []).map((item) => item.path)
  ),
]).filter(Boolean);
const menuPaths = (label) => weavingTopMenuConfig
  .find((menu) => menu.label === label)
  ?.sections.flatMap((section) => section.items.map((item) => item.path)) || [];

describe('Weaving navigation coverage', () => {
  test('keeps one primary Dashboard and a compact daily sidebar', () => {
    expect(weavingDashboardItem.to).toBe('/weaving/dashboard');
    expect(weavingSidebarItems).toHaveLength(11);
    expect(weavingSidebarItems.some((item) => item.to === '/weaving/dashboard')).toBe(false);
    expect(weavingSidebarItems[weavingSidebarItems.length - 1].to).toBe('/weaving/settings');
  });

  test('uses the requested professional top-level groups without Settings', () => {
    expect(topMenuLabels).toEqual([
      'weaving.nav.dashboard',
      'weaving.nav.parties',
      'weaving.nav.employees',
      'weaving.nav.commercial',
      'weaving.nav.production',
      'weaving.nav.masterForms',
      'weaving.nav.finance',
      'weaving.nav.reports',
    ]);
    expect(topMenuPaths).not.toContain('/weaving/settings');
  });

  test('keeps direct tab routes and removes the Parts Store placeholder', () => {
    expect(topMenuPaths).toEqual(expect.arrayContaining([
      '/weaving/parties?tab=customer',
      '/weaving/parties?tab=supplier',
      '/weaving/payments?tab=receive',
      '/weaving/payments?tab=pay',
      '/weaving/payments?tab=history',
      '/weaving/sales-settlement?tab=ready',
      '/weaving/sales-settlement?tab=kacchi',
      '/weaving/sales-settlement?tab=pakki',
      '/weaving/sales-settlement?tab=pending',
      '/weaving/sales-settlement?tab=receipts',
      '/weaving/reports?tab=profit',
    ]));
    expect(topMenuPaths.some((path) => path.includes('parts-store'))).toBe(false);
  });

  test('keeps every daily module reachable from the compact sidebar', () => {
    expect([weavingDashboardItem.to, ...weavingSidebarItems.map((item) => item.to)]).toEqual([
      '/weaving/dashboard',
      '/weaving/parties',
      '/weaving/purchase',
      '/weaving/payments',
      '/weaving/sales-settlement',
      '/weaving/yarn-stock',
      '/weaving/sizing',
      '/weaving/beams',
      '/weaving/folding-quality',
      '/weaving/fabric-stock',
      '/weaving/accounts',
      '/weaving/settings',
    ]);
  });

  test('keeps employee and commercial workspaces reachable from the header', () => {
    expect(menuPaths('weaving.nav.employees')).toEqual(expect.arrayContaining([
      '/weaving/employees',
      '/weaving/attendance',
      '/weaving/payroll',
      '/weaving/employee-finance',
      '/weaving/employee-ledgers',
    ]));
    expect(menuPaths('weaving.nav.commercial')).toEqual(expect.arrayContaining([
      '/weaving/purchase',
      '/weaving/payments?tab=receive',
      '/weaving/payments?tab=pay',
      '/weaving/payments?tab=history',
      '/weaving/sales-settlement?tab=kacchi',
      '/weaving/sales-settlement?tab=pakki',
      '/weaving/sales-settlement?tab=ready',
      '/weaving/sales-settlement?tab=invoices',
      '/weaving/sales-settlement?tab=pending',
      '/weaving/sales-settlement?tab=receipts',
    ]));
  });

  test('makes Master Forms first-class without duplicating it in Production', () => {
    const masterPaths = menuPaths('weaving.nav.masterForms');
    const productionPaths = menuPaths('weaving.nav.production');

    expect(masterPaths).toEqual(expect.arrayContaining([
      '/weaving/forms',
      '/weaving/forms?tab=yarn',
      '/weaving/forms?tab=fabric',
      '/weaving/forms?tab=loom',
      '/weaving/forms?tab=sales',
      '/weaving/forms?tab=purchase',
    ]));
    expect(productionPaths.some((path) => path.startsWith('/weaving/forms'))).toBe(false);
    expect(weavingDashboardCards.find((card) => card.key === 'masterForms')?.route)
      .toBe('/weaving/forms');
  });

  test('covers production stock actions, finance, and every report tab', () => {
    expect(menuPaths('weaving.nav.production')).toEqual(expect.arrayContaining([
      '/weaving/sizing',
      '/weaving/beams',
      '/weaving/folding-quality',
      '/weaving/production',
      '/weaving/looms',
      '/weaving/yarn-stock',
      '/weaving/fabric-stock',
      '/weaving/fabric-stock?action=transfer',
      '/weaving/yarn-stock?action=transfer',
      '/weaving/yarn-stock?action=recovery',
      '/weaving/yarn-stock?action=consumption',
    ]));
    expect(menuPaths('weaving.nav.finance')).toEqual(expect.arrayContaining([
      '/weaving/accounts',
      '/weaving/expenses',
      '/weaving/journal-entries',
      '/weaving/general-ledger',
      '/weaving/business-value',
    ]));
    expect(menuPaths('weaving.nav.reports')).toEqual(expect.arrayContaining([
      '/weaving/reports?tab=salary',
      '/weaving/reports?tab=production',
      '/weaving/reports?tab=looms',
      '/weaving/reports?tab=quality',
      '/weaving/reports?tab=stock',
      '/weaving/reports?tab=sales',
      '/weaving/reports?tab=rejection',
      '/weaving/reports?tab=profit',
    ]));
  });

  test('search covers the major Weaving destinations without exposing Settings', () => {
    const searchPaths = weavingSearchConfig.map((item) => item.path);

    expect(searchPaths).toEqual(expect.arrayContaining([
      '/weaving/forms',
      '/weaving/parties?tab=both',
      '/weaving/employees',
      '/weaving/payroll',
      '/weaving/payments',
      '/weaving/purchase',
      '/weaving/sales-settlement',
      '/weaving/yarn-stock',
      '/weaving/fabric-stock',
      '/weaving/business-value',
      '/weaving/reports?tab=profit',
    ]));
    expect(searchPaths).not.toContain('/weaving/settings');
    expect(searchPaths.some((path) => path.includes('parts-store'))).toBe(false);
  });

  test('includes the four requested management cards', () => {
    expect(weavingDashboardCards.map((card) => card.key)).toEqual(
      expect.arrayContaining([
        'salesRevenue',
        'readyToInvoice',
        'pendingRejectionMeter',
        'purchaseTotal',
      ])
    );
  });

  test('keeps Master Forms and adds a direct Loom Master dashboard card', () => {
    expect(weavingDashboardCards.find((card) => card.key === 'masterForms')?.route)
      .toBe('/weaving/forms');
    expect(weavingDashboardCards.find((card) => card.key === 'looms')).toMatchObject({
      route: '/weaving/forms?tab=loom',
      permission: 'weaving.masters.view',
      format: 'looms',
    });
  });
});
