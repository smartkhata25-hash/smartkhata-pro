const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const mongoose = require("mongoose");

const controllerPath = path.join(__dirname, "../controllers/weavingAttendanceController.js");
const source = fs.readFileSync(controllerPath, "utf8");
const sandbox = {
  module: { exports: {} },
  exports: {},
  require(name) {
    if (name === "mongoose") return mongoose;
    if (name.endsWith("activityLogger")) return { logActivity: async () => {} };
    if (name.endsWith("permissionList")) {
      return { PERMISSIONS: { WEAVING_ATTENDANCE: { MANAGE: "manage", OVERRIDE: "override" } } };
    }
    return {};
  },
  console,
};
sandbox.exports = sandbox.module.exports;
vm.runInNewContext(
  `${source}\nmodule.exports.__attendanceTest = { buildLockState, canOverrideAttendance, joinedByDateQuery, normalizeNote, buildSummary };`,
  sandbox,
);

const helpers = sandbox.module.exports.__attendanceTest;
assert.strictEqual(helpers.canOverrideAttendance({ user: { accountRole: "owner" } }), true);
assert.strictEqual(helpers.canOverrideAttendance({ user: { accountRole: "staff", permissions: ["override"] } }), true);
assert.strictEqual(helpers.normalizeNote("  Holiday  "), "Holiday");
assert.strictEqual(helpers.normalizeNote("x".repeat(250)).length, 200);

const joiningFilter = helpers.joinedByDateQuery("2026-10-10");
assert.strictEqual(joiningFilter.$or[2].joiningDate.$lte.toISOString(), "2026-10-10T18:59:59.000Z");
const summary = helpers.buildSummary([
  { status: "present", otHours: 2, isDoubleDuty: true },
  { status: "leave", dutyType: "normal" },
]);
assert.deepStrictEqual(
  { total: summary.total, present: summary.present, leave: summary.leave, ot: summary.ot, double: summary.double },
  { total: 2, present: 1, leave: 1, ot: 1, double: 1 },
);

assert(source.includes("session.withTransaction"), "bulk save must use a MongoDB transaction");
assert(source.includes("exports.getAttendanceHistory"), "history endpoint must remain available");
assert(source.includes('query.attendanceDate.$gte'), "history From Date filter must remain available");
assert(source.includes('query.attendanceDate.$lte'), "history To Date filter must remain available");
assert(source.includes('["employeeId", "Employee"]'), "history Employee filter must remain available");
assert(source.includes('["departmentId", "Department"]'), "history Department filter must remain available");
assert(source.includes('["shiftId", "Shift"]'), "history Shift filter must remain available");
assert(source.includes("query.status = status"), "history Status filter must remain available");

console.log("Weaving Attendance: owner override, joining date, notes, summary, atomic save and history filters passed");
