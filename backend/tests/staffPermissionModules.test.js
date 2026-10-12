const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STAFF_PERMISSIONS,
  getAllowedPermissions,
  getEffectivePermissions,
  getPermissionCatalog,
} = require("../utils/permissionList");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { resolveActivityModuleScope } = require("../utils/activityLogger");
const { applyActivityModuleScopeFilter } = require("../controllers/activityController");

const moduleKeys = ["trading", "travel", "weaving"];
const combinations = [
  ["trading"],
  ["travel"],
  ["weaving"],
  ["trading", "travel"],
  ["trading", "weaving"],
  ["travel", "weaving"],
  ["trading", "travel", "weaving"],
];

test("new staff defaults to least privilege", () => {
  assert.deepEqual(DEFAULT_STAFF_PERMISSIONS, []);
});

for (const enabledKeys of combinations) {
  test(`catalog follows enabled modules: ${enabledKeys.join("+")}`, () => {
    const enabledModules = Object.fromEntries(
      moduleKeys.map((key) => [key, enabledKeys.includes(key)]),
    );
    const config = { enabledModules };
    const allowed = getAllowedPermissions(config);
    const sections = getPermissionCatalog(config).map((section) => section.key);

    assert.ok(sections.includes("shared"));
    for (const key of moduleKeys) {
      assert.equal(sections.includes(key), enabledKeys.includes(key));
    }
    assert.equal(allowed.some((value) => value.startsWith("travel.")), enabledKeys.includes("travel"));
    assert.equal(allowed.some((value) => value.startsWith("weaving.")), enabledKeys.includes("weaving"));
    assert.equal(allowed.includes("sales.view"), enabledKeys.includes("trading"));
    assert.equal(allowed.some((value) => value.startsWith("staff.")), false);
    assert.equal(allowed.includes("settings.personal_info"), false);
    assert.equal(allowed.includes("settings.business_info"), false);
  });
}

test("disabled and unreviewed module permissions stay dormant", () => {
  const stored = ["sales.view", "travel.view", "accounts.view"];
  const enabledModules = { trading: true, travel: true, weaving: false };
  assert.deepEqual(
    getEffectivePermissions(stored, { enabledModules }, ["trading"]),
    ["sales.view", "accounts.view"],
  );
});

test("owner bypass cannot enter a disabled module API", () => {
  const middleware = requirePermission("travel.view");
  let nextCalled = false;
  const req = {
    user: {
      accountRole: "owner",
      permissions: [],
      enabledModules: { trading: true, travel: false, weaving: false },
    },
  };
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  middleware(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test("shared activity is classified independently of workspace", () => {
  assert.equal(resolveActivityModuleScope({ module: "staff" }), "shared");
  assert.equal(resolveActivityModuleScope({ module: "auth" , requestedScope: "shared" }), "shared");
  assert.equal(resolveActivityModuleScope({ module: "weaving.sales" }), "weaving");
});

test("all activity includes only enabled scopes plus shared compatibility", () => {
  const query = {};
  applyActivityModuleScopeFilter(query, "all", {
    trading: false,
    travel: true,
    weaving: false,
  });
  const explicit = query.$and[0].$or[0].moduleScope.$in;
  assert.deepEqual(explicit.sort(), ["both", "shared", "travel"]);
  assert.ok(
    query.$and[0].$or.some(
      (condition) => String(condition.module) === String(/^(staff(?:\.|$)|auth$)/i),
    ),
  );
});
