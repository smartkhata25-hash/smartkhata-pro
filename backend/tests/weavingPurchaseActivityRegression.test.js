const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const controller = read('controllers/weavingCommercialController.js');
const activityModel = read('models/ActivityLog.js');
const commercial = read('services/weaving/weavingCommercialService.js');

for (const unsupported of [
  'create_direct_sizing_issue',
  'update_direct_sizing_issue',
  'reverse_direct_sizing_issue',
  'action: "edit"',
]) {
  assert.ok(!controller.includes(unsupported), `unsupported activity action remains: ${unsupported}`);
}

assert.match(controller, /action: "create", module: "weaving\.sizing"/);
assert.match(controller, /action: "update", module: "weaving\.sizing"/);
assert.match(controller, /action: "reverse", module: "weaving\.sizing"/);
assert.match(controller, /eventType: "direct_sizing_purchase"/);
assert.match(controller, /action: "update", module: "weaving\.purchases"/);
assert.match(activityModel, /"create"/);
assert.match(activityModel, /"update"/);
assert.match(activityModel, /"reverse"/);

// The purchase service still guards retries before creating accounting records.
assert.match(commercial, /findOne\(\{ userId, requestKey \}\)/);
assert.match(commercial, /if \(existing\) return existing/);
assert.match(commercial, /sourceType: "direct_purchase"/);

console.log('weaving purchase activity regression tests passed');
