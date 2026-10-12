import {
  getActivityScopeOptions,
  getEnabledActivityScopes,
  resolveActivityScope,
} from './activityScope';

const combinations = [
  ['trading'],
  ['travel'],
  ['weaving'],
  ['trading', 'travel'],
  ['trading', 'weaving'],
  ['travel', 'weaving'],
  ['trading', 'travel', 'weaving'],
];

test.each(combinations)('activity scopes match enabled modules: %j', (...enabled) => {
  const enabledModules = Object.fromEntries(
    ['trading', 'travel', 'weaving'].map((key) => [key, enabled.includes(key)]),
  );
  const user = { enabledModules, defaultModule: enabled[0] };
  expect(getEnabledActivityScopes(user)).toEqual(enabled);
  expect(getActivityScopeOptions(user)).toEqual(
    enabled.length > 1 ? ['all', ...enabled] : enabled,
  );
});

test('current workspace wins when enabled and disabled workspace safely falls back', () => {
  const user = {
    enabledModules: { trading: true, travel: false, weaving: true },
    defaultModule: 'trading',
  };
  expect(resolveActivityScope(user, { pathname: '/staff', state: { moduleScope: 'weaving' } })).toBe('weaving');
  expect(resolveActivityScope(user, { pathname: '/travel/activity-log' })).toBe('trading');
});
