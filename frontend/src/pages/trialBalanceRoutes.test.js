const fs = require('fs');
const path = require('path');

const appSource = fs.readFileSync(path.join(process.cwd(), 'src', 'App.js'), 'utf8');

describe('Trial Balance routes', () => {
  test.each([
    ['/trial-balance', 'trading'],
    ['/travel/trial-balance', 'travel'],
    ['/weaving/trial-balance', 'weaving'],
  ])('registers %s with an explicit %s scope', (route, scope) => {
    const routeIndex = appSource.indexOf(`path="${route}"`);
    expect(routeIndex).toBeGreaterThan(-1);
    expect(appSource.slice(routeIndex, routeIndex + 500)).toContain('permission="reports.trial_balance"');
    expect(appSource.slice(routeIndex, routeIndex + 500)).toContain(`<TrialBalancePage moduleScope="${scope}" />`);
  });

  test('module routes also enforce their module gate', () => {
    const travelRoute = appSource.slice(appSource.indexOf('path="/travel/trial-balance"'), appSource.indexOf('path="/travel/trial-balance"') + 500);
    const weavingRoute = appSource.slice(appSource.indexOf('path="/weaving/trial-balance"'), appSource.indexOf('path="/weaving/trial-balance"') + 500);
    expect(travelRoute).toContain('moduleKey={MODULE_KEYS.TRAVEL}');
    expect(weavingRoute).toContain('moduleKey={MODULE_KEYS.WEAVING}');
  });
});
