const test = require("node:test");
const assert = require("node:assert/strict");

const { _test } = require("../services/weaving/weavingPayrollService");

test("owner-selected historical payroll range resolves inside H1", () => {
  const result = _test.assertPayrollRange({ fromDate: "2026-08-01", toDate: "2026-08-12" });
  assert.equal(result.from, "2026-08-01");
  assert.equal(result.to, "2026-08-12");
  assert.equal(result.cycle.key, "2026-08-H1");
  assert.equal(result.cycle.dueDate, "2026-08-22");
});

test("owner-selected partial H2 range keeps scheduled next-month due date", () => {
  const result = _test.assertPayrollRange({ fromDate: "2026-09-20", toDate: "2026-09-26" });
  assert.equal(result.cycle.key, "2026-09-H2");
  assert.equal(result.cycle.dueDate, "2026-10-07");
});

test("range rejects reverse dates and crossing a standard cycle boundary", () => {
  assert.throws(() => _test.assertPayrollRange({ fromDate: "2026-09-10", toDate: "2026-09-05" }), /From Date/);
  assert.throws(() => _test.assertPayrollRange({ fromDate: "2026-09-10", toDate: "2026-09-20" }), /one standard payroll cycle/);
});

test("factory holiday is paid once for daily employee without consuming leave", () => {
  const attendanceMap = _test.aggregateAttendanceByEmployeeDate([{ employeeId: "e1", attendanceDate: "2026-09-07", status: "leave", isFactoryHoliday: true }]);
  const result = _test.calculateEmployeePayroll({
    employee: { _id: "e1", salaryType: "daily", baseSalary: 1000, weeklyOffDays: ["monday"], paidLeaveAllowance: 2 },
    cycle: { key: "2026-09-H1", halfDays: 15 }, attendanceMap,
    periodDateKeys: ["2026-09-07"], monthDateKeys: ["2026-09-07"],
  });
  assert.equal(result.factoryHolidayDays, 1);
  assert.equal(result.paidLeaveDays, 0);
  assert.equal(result.baseSalaryAmount, 1000);
});
