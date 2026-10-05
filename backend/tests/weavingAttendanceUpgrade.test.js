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
  `${source}\nmodule.exports.__attendanceTest = { buildLockState, canOverrideAttendance, canManageAttendance, assertEditable, assertPostedPayrollCorrectionAllowed, buildAttendanceCorrectionDocument, joinedByDateQuery, normalizeNote, buildSummary };`,
  sandbox,
);

const helpers = sandbox.module.exports.__attendanceTest;
assert.strictEqual(helpers.canOverrideAttendance({ user: { accountRole: "owner" } }), true);
assert.strictEqual(helpers.canOverrideAttendance({ user: { accountRole: "staff", permissions: ["override"] } }), false);
assert.strictEqual(helpers.canManageAttendance({ user: { accountRole: "staff", permissions: ["manage"] } }), true);
assert.strictEqual(helpers.canManageAttendance({ user: { accountRole: "staff", permissions: ["override"] } }), true);
assert.doesNotThrow(() =>
  helpers.assertEditable({
    req: { user: { accountRole: "staff", permissions: ["manage"] } },
    lockState: { locked: false },
  }),
);
assert.doesNotThrow(() => helpers.assertPostedPayrollCorrectionAllowed({
  req: { user: { accountRole: "staff", permissions: ["manage"] } },
  affectsPostedPayroll: false,
}));
assert.throws(() => helpers.assertPostedPayrollCorrectionAllowed({
  req: { user: { accountRole: "staff", permissions: ["manage"] } },
  affectsPostedPayroll: true,
}), (error) => error.statusCode === 403);
assert.doesNotThrow(() => helpers.assertPostedPayrollCorrectionAllowed({
  req: { user: { accountRole: "owner" } },
  affectsPostedPayroll: true,
}));
assert.throws(
  () => helpers.assertEditable({
    req: { user: { accountRole: "staff", permissions: ["manage"] } },
    lockState: { locked: true },
  }),
  (error) => error.statusCode === 423,
);
assert.throws(
  () => helpers.assertEditable({
    req: { user: { accountRole: "staff", permissions: ["override"] } },
    lockState: { locked: true },
  }),
  (error) => error.statusCode === 423,
);
assert.doesNotThrow(() =>
  helpers.assertEditable({
    req: { user: { accountRole: "owner" } },
    lockState: { locked: true },
  }),
);
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

const auditContext = { userId: "000000000000000000000001", dateKey: "2026-10-05", shift: { _id: "000000000000000000000002" } };
const revision = { payrollId: "000000000000000000000010", oldNetSalary: 1000, newNetSalary: 0, oldJournalEntryId: "000000000000000000000011", reversalJournalEntryIds: ["000000000000000000000012"], newJournalEntryId: null };
const removedB = helpers.buildAttendanceCorrectionDocument({ context: auditContext, actorId: "000000000000000000000003", candidate: { attendanceId: "000000000000000000000004", employeeId: "000000000000000000000005", previousStatus: "present", previousReplacementForEmployeeId: "000000000000000000000006" }, current: null, revision });
assert.strictEqual(removedB.previousStatus, "present");
assert.strictEqual(removedB.newStatus, "");
assert.strictEqual(String(removedB.previousReplacementForEmployeeId), "000000000000000000000006");
const addedC = helpers.buildAttendanceCorrectionDocument({ context: auditContext, actorId: "000000000000000000000003", candidate: { attendanceId: "000000000000000000000007", employeeId: "000000000000000000000008", previousStatus: "" }, current: { status: "present", replacementForEmployeeId: "000000000000000000000006" }, revision: { ...revision, oldNetSalary: 0, newNetSalary: 1000 } });
assert.strictEqual(addedC.previousStatus, "");
assert.strictEqual(addedC.newStatus, "present");
assert.strictEqual(String(addedC.newReplacementForEmployeeId), "000000000000000000000006");
assert(source.includes("assertNoUnauthorizedPostedPayrollEdit({ req, context, preparedRows, session })"), "posted payroll authorization must run inside the save transaction");

assert(source.includes("session.withTransaction"), "bulk save must use a MongoDB transaction");
assert(source.includes("exports.getAttendanceHistory"), "history endpoint must remain available");
assert(source.includes('query.attendanceDate.$gte'), "history From Date filter must remain available");
assert(source.includes('query.attendanceDate.$lte'), "history To Date filter must remain available");
assert(source.includes('["employeeId", "Employee"]'), "history Employee filter must remain available");
assert(source.includes('["departmentId", "Department"]'), "history Department filter must remain available");
assert(source.includes('["shiftId", "Shift"]'), "history Shift filter must remain available");
assert(source.includes("query.status = status"), "history Status filter must remain available");

console.log("Weaving Attendance: owner override, joining date, notes, summary, atomic save and history filters passed");
