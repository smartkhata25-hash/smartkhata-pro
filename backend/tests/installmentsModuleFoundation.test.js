const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_ENABLED_MODULES,
  MODULE_KEYS,
  normalizeModuleConfig,
} = require('../utils/moduleConfig');
const {
  getEffectivePermissions,
  getPermissionCatalog,
} = require('../utils/permissionList');
const { requireModule } = require('../middleware/moduleMiddleware');

test('installments is registered and remains disabled for legacy accounts', () => {
  assert.equal(MODULE_KEYS.INSTALLMENTS, 'installments');
  assert.equal(DEFAULT_ENABLED_MODULES.installments, false);

  assert.deepEqual(normalizeModuleConfig({
    enabledModules: { trading: false, travel: true, weaving: true },
    defaultModule: 'travel',
  }), {
    enabledModules: {
      trading: false,
      travel: true,
      weaving: true,
      installments: false,
    },
    defaultModule: 'travel',
  });
});

test('installments can be enabled and selected without changing other modules', () => {
  const config = normalizeModuleConfig({
    enabledModules: {
      trading: true,
      travel: true,
      weaving: false,
      installments: true,
    },
    defaultModule: 'installments',
  });

  assert.equal(config.defaultModule, 'installments');
  assert.deepEqual(config.enabledModules, {
    trading: true,
    travel: true,
    weaving: false,
    installments: true,
  });
});

test('installments permission is catalogued only when the module is enabled', () => {
  const disabledCatalog = getPermissionCatalog({
    enabledModules: { trading: true, installments: false },
  });
  assert.equal(disabledCatalog.some((section) => section.key === 'installments'), false);

  const enabledCatalog = getPermissionCatalog({
    enabledModules: { trading: true, installments: true },
  });
  const section = enabledCatalog.find((entry) => entry.key === 'installments');
  assert.ok(section);
  assert.ok(section.groups.some((group) => group.permissions.includes('installments.view')));
  assert.ok(section.groups.some((group) => group.permissions.includes('installments.members.view')));
  assert.ok(section.groups.some((group) => group.permissions.includes('installments.members.restore')));
  assert.ok(section.groups.some((group) => group.permissions.includes('installments.committees.manage')));
  assert.ok(section.groups.some((group) => group.permissions.includes('installments.opening_balances.manage')));

  assert.deepEqual(
    getEffectivePermissions(
      ['installments.view', 'sales.view'],
      { enabledModules: { trading: true, installments: true } },
      ['trading'],
    ),
    ['sales.view'],
  );
});

test('disabled installments module is denied by backend module middleware', () => {
  const middleware = requireModule(MODULE_KEYS.INSTALLMENTS);
  let nextCalled = false;
  const req = { user: { enabledModules: { trading: true, installments: false } } };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  middleware(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

