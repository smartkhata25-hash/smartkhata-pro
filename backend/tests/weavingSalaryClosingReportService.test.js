const assert = require("assert");

const {
  assertOfficialPrintable,
  _test: {
    buildSalaryClosingReportData,
    buildSalaryClosingRow,
    isReportPayrollStatusIncluded,
    splitSavedRecoveries,
  },
} = require("../services/weaving/weavingSalaryClosingReportService");
const { resolvePayrollCycle } = require("../services/weaving/weavingPayrollService");

const employee = (overrides = {}) => ({
  _id: overrides._id || "64f000000000000000000001",
  employeeNo: overrides.employeeNo || "EMP-001",
  name: overrides.name || "Test Worker",
  unitId: overrides.unitId || "64f000000000000000000101",
  unitNo: overrides.unitNo || 1,
  unitName: overrides.unitName || "Unit 1",
  departmentName: overrides.departmentName || "Loom",
  designationName: overrides.designationName || "Weaver",
  listOrder: overrides.listOrder || 1,
  isDeleted: overrides.isDeleted || false,
});

const payroll = (overrides = {}) => ({
  _id: overrides._id || "64f000000000000000000201",
  employeeId: overrides.employeeId || employee(),
  status: overrides.status || "finalized",
  baseSalary: 15000,
  totalAdditions: 1000,
  totalDeductions: 6000,
  recoveryAmount: 5000,
  recoveryApplications: [
    {
      kind: "loan",
      amount: 3000,
      scheduledAmount: 5000,
    },
    {
      kind: "advance",
      amount: 2000,
      scheduledAmount: 3000,
    },
  ],
  netSalary: 10000,
  paidAmount: 0,
  remainingDue: 10000,
  ...overrides,
});

(() => {
  const row = buildSalaryClosingRow(payroll());

  assert.strictEqual(row.salary, 15000);
  assert.strictEqual(row.plus, 1000);
  assert.strictEqual(row.deduction, 1000);
  assert.strictEqual(row.loan, 3000);
  assert.strictEqual(row.kharcha, 2000);
  assert.strictEqual(row.payable, 10000);
})();

(() => {
  const recoveries = splitSavedRecoveries({
    recoveryApplications: [
      {
        kind: "loan",
        amount: 2000,
        scheduledAmount: 5000,
        outstandingAmount: 45000,
      },
    ],
  });

  assert.strictEqual(recoveries.loan, 2000);
})();

(() => {
  const row = buildSalaryClosingRow(
    payroll({
      recoveryAmount: 0,
      totalDeductions: 0,
      recoveryApplications: [
        {
          kind: "advance",
          amount: 0,
          scheduledAmount: 3000,
          isSkipped: true,
        },
      ],
    }),
  );

  assert.strictEqual(row.kharcha, 0);
})();

(() => {
  const row = buildSalaryClosingRow(
    payroll({
      paidAmount: 4000,
      remainingDue: 6000,
    }),
  );

  assert.strictEqual(row.paidAmount, 4000);
  assert.strictEqual(row.payable, 6000);
})();

(() => {
  const row = buildSalaryClosingRow(
    payroll({
      paidAmount: 10000,
      remainingDue: 0,
      status: "paid",
    }),
  );

  assert.strictEqual(row.payable, 0);
  assert.strictEqual(row.paidAmount, 10000);
})();

(() => {
  const row = buildSalaryClosingRow(
    payroll({
      masterLedgerRecoverable: 45000,
      remainingDue: 10000,
    }),
  );

  assert.strictEqual(row.payable, 10000);
})();

(() => {
  const report = buildSalaryClosingReportData({
    cycle: resolvePayrollCycle("2026-09-H1"),
    rows: [
      buildSalaryClosingRow(payroll()),
      buildSalaryClosingRow(
        payroll({
          _id: "64f000000000000000000202",
          employeeId: employee({
            _id: "64f000000000000000000002",
            employeeNo: "EMP-002",
            name: "Second Worker",
            unitId: "64f000000000000000000102",
            unitNo: 2,
            unitName: "Unit 2",
            listOrder: 2,
          }),
          baseSalary: 12000,
          totalAdditions: 0,
          totalDeductions: 0,
          recoveryAmount: 0,
          recoveryApplications: [],
          netSalary: 12000,
          paidAmount: 12000,
          remainingDue: 0,
          status: "paid",
        }),
      ),
    ],
  });

  assert.strictEqual(report.groups.length, 2);
  assert.strictEqual(report.summary.employees, 2);
  assert.strictEqual(report.summary.salary, 27000);
  assert.strictEqual(report.summary.payable, 10000);
  assert.strictEqual(report.status.canOfficialPrint, true);
  assert.doesNotThrow(() => assertOfficialPrintable(report));
})();

(() => {
  const report = buildSalaryClosingReportData({
    cycle: resolvePayrollCycle("2026-09-H1"),
    rows: [
      buildSalaryClosingRow(
        payroll({
          status: "draft",
        }),
      ),
    ],
  });

  assert.strictEqual(report.status.draftCount, 1);
  assert.strictEqual(report.status.canOfficialPrint, false);
  assert.throws(() => assertOfficialPrintable(report), /Draft/);
})();

(() => {
  assert.strictEqual(isReportPayrollStatusIncluded("void"), false);
  assert.strictEqual(isReportPayrollStatusIncluded("finalized"), true);
})();

(() => {
  const row = buildSalaryClosingRow(
    payroll({
      employeeId: employee({ isDeleted: true }),
    }),
  );

  assert.strictEqual(row.isHidden, true);
})();

(() => {
  const report = buildSalaryClosingReportData({
    cycle: resolvePayrollCycle("2026-09-H2"),
    todayKey: "2026-09-16",
    rows: [
      buildSalaryClosingRow(
        payroll({
          earlyClosed: true,
          earlyCloseThroughDate: "2026-09-16",
          earlyCloseReason: "Factory close",
          status: "finalized",
        }),
      ),
    ],
  });

  assert.strictEqual(report.cycle.earlyClosed, true);
  assert.strictEqual(report.cycle.earlyCloseThroughDate, "2026-09-16");
  assert.strictEqual(report.cycle.earlyCloseReason, "Factory close");
  assert.strictEqual(report.cycle.periodEnd, "2026-09-16");
  assert.strictEqual(report.cycle.originalPeriodEnd, "2026-09-30");
  assert.strictEqual(report.status.canOfficialPrint, true);
  assert.doesNotThrow(() => assertOfficialPrintable(report));
})();

(() => {
  const report = buildSalaryClosingReportData({
    cycle: resolvePayrollCycle("2026-09-H2"),
    todayKey: "2026-09-16",
    rows: [
      buildSalaryClosingRow(
        payroll({
          status: "finalized",
        }),
      ),
    ],
  });

  assert.strictEqual(report.cycle.earlyClosed, false);
  assert.strictEqual(report.status.canOfficialPrint, false);
  assert.strictEqual(report.status.provisionalPrintBlocked, true);
  assert.throws(() => assertOfficialPrintable(report), /provisional payroll cycle/);
})();

(() => {
  const report = buildSalaryClosingReportData({
    cycle: resolvePayrollCycle("2026-09-H2"),
    todayKey: "2026-09-30",
    selectedSegmentNo: 2,
    segments: [
      {
        segmentNo: 1,
        storageKey: "2026-09-H2",
        segmentStart: "2026-09-16",
        segmentEnd: "2026-09-16",
        earlyClosed: true,
      },
      {
        segmentNo: 2,
        storageKey: "2026-09-H2-S2",
        segmentStart: "2026-09-20",
        segmentEnd: "2026-09-30",
      },
    ],
    rows: [
      buildSalaryClosingRow(
        payroll({
          cycleKey: "2026-09-H2-S2",
          baseCycleKey: "2026-09-H2",
          segmentNo: 2,
          segmentStart: "2026-09-20",
          segmentEnd: "2026-09-30",
        }),
      ),
    ],
  });

  assert.strictEqual(report.cycle.segmentNo, 2);
  assert.strictEqual(report.cycle.storageKey, "2026-09-H2-S2");
  assert.strictEqual(report.cycle.periodStart, "2026-09-20");
  assert.strictEqual(report.cycle.periodEnd, "2026-09-30");
})();

console.log("weaving salary closing report tests passed");
