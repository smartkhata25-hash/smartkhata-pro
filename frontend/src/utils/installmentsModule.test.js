import { MODULE_KEYS, normalizeModuleConfig } from './moduleConfig';
import { getDefaultWorkspacePath } from './moduleNavigation';
import en from '../i18n/en.json';
import ur from '../i18n/ur.json';

test('legacy frontend module config keeps installments disabled', () => {
  expect(normalizeModuleConfig({
    enabledModules: { trading: true, travel: false, weaving: true },
    defaultModule: 'weaving',
  })).toEqual({
    enabledModules: {
      trading: true,
      travel: false,
      weaving: true,
      installments: false,
    },
    defaultModule: 'weaving',
  });
});

test('authorized installments default resolves to its dashboard', () => {
  const user = {
    accountRole: 'staff',
    permissions: ['installments.view'],
    enabledModules: {
      trading: false,
      travel: false,
      weaving: false,
      installments: true,
    },
    defaultModule: MODULE_KEYS.INSTALLMENTS,
  };

  expect(getDefaultWorkspacePath(user)).toBe('/installments/dashboard');
});

test('installments default does not bypass explicit staff permission', () => {
  const user = {
    accountRole: 'staff',
    permissions: [],
    enabledModules: { trading: true, installments: true },
    defaultModule: MODULE_KEYS.INSTALLMENTS,
  };

  expect(getDefaultWorkspacePath(user)).toBe('/dashboard');
});

test('installments foundation has matching English and Urdu translation keys', () => {
  const requiredKeys = [
    'business.modules.installments',
    'installments.dashboard.title',
    'installments.dashboard.cards.expectedCollection',
    'installments.dashboard.collectionSchedule.title',
    'installments.dashboard.quickActions.receivePayment',
    'installments.sidebar.reports',
  ];

  requiredKeys.forEach((key) => {
    expect(en[key]).toBeTruthy();
    expect(ur[key]).toBeTruthy();
    expect(ur[key]).not.toBe(key);
  });
});

