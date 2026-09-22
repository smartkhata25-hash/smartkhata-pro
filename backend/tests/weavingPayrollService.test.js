const assert = require("assert");

const {
  _test: {
    aggregateAttendanceByEmployeeDate,
    assertCycleCanFinalize,
    buildSegmentStorageKey,
    buildRecoveryApplicationsForPayroll,
    calculateEmployeePayroll,
    collectHistoricalPayrollEmployeeIds,
    derivePayrollDisplayStatus,
    getPayrollBaseCycleKey,
    getPayrollSegmentNo,
    isFinanceEntryEligibleForCycle,
    listDateKeys,
    resolvePayrollCycle,
    validateEarlyCloseEligibility,
  },
} = require("../services/weaving/weavingPayrollService");

const EMPLOYEE_ID = "64f000000000000000000001";
const USER_ID = "64f000000000000000000100";

(() => {
  const inactiveWithAttendance = "64f000000000000000000011";
  const inactiveWithPayroll = "64f000000000000000000012";
  const inactiveWithKnotting = "64f000000000000000000013";
  const outsideSegment = "64f000000000000000000014";
  const ids = collectHistoricalPayrollEmployeeIds({
    attendanceRows: [
      { employeeId: inactiveWithAttendance, attendanceDate: "2026-09-10" },
      { employeeId: outsideSegment, attendanceDate: "2026-09-20" },
    ],
    existingPayrolls: [{ employeeId: inactiveWithPayroll }],
    knottingJobs: [{ employeeId: inactiveWithKnotting }],
    segmentStart: "2026-09-01",
    calculationThroughDate: "2026-09-15",
  });

  assert.deepStrictEqual(
    [...ids].sort(),
    [inactiveWithAttendance, inactiveWithPayroll, inactiveWithKnotting].sort(),
    "only inactive employees with evidence in the selected historical period are eligible",
  );
})();

const employee = (overrides = {}) => ({
  _id: EMPLOYEE_ID,
  userId: USER_ID,
  moduleScope: "weaving",
  name: "Test Worker",
  salaryType: "monthly",
  baseSalary: 30000,
  dutyHours: 8,
  weeklyOffDays: [],
  paidLeaveAllowance: 0,
  otAllowed: true,
  joiningDate: "2026-01-01",
  isDeleted: false,
  ...overrides,
});

const row = (dateKey, status = "present", overrides = {}) => ({
  employeeId: EMPLOYEE_ID,
  attendanceDate: dateKey,
  status,
  ...overrides,
});

const rowsForDates = (dateKeys, status = "present", overrides = {}) =>
  dateKeys.map((dateKey) => row(dateKey, status, overrides));

const calc = ({
  cycleKey = "2026-09-H1",
  employeeData = employee(),
  rows = [],
  additions = [],
  deductions = [],
  openingAlreadyApplied = false,
  periodDateKeys = null,
  monthDateKeys = null,
} = {}) => {
  const cycle = resolvePayrollCycle(cycleKey);

  return calculateEmployeePayroll({
    employee: employeeData,
    cycle,
    attendanceMap: aggregateAttendanceByEmployeeDate(rows),
    periodDateKeys: periodDateKeys || listDateKeys(cycle.periodStart, cycle.periodEnd),
    monthDateKeys: monthDateKeys || listDateKeys(cycle.monthStart, cycle.monthEnd),
    manualAdditions: additions,
    manualDeductions: deductions,
    openingAlreadyApplied,
  });
};

const periodRows = (cycleKey, status = "present", overrides = {}) => {
  const cycle = resolvePayrollCycle(cycleKey);
  return rowsForDates(listDateKeys(cycle.periodStart, cycle.periodEnd), status, overrides);
};

const nonSundayRowsForH1 = () => {
  const dates = [
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
    "2026-09-10",
    "2026-09-11",
    "2026-09-12",
    "2026-09-14",
    "2026-09-15",
  ];

  return rowsForDates(dates);
};

const financeEntry = (overrides = {}) => ({
  _id: overrides._id || "64f000000000000000000201",
  userId: USER_ID,
  moduleScope: "weaving",
  employeeId: EMPLOYEE_ID,
  kind: "loan",
  amount: 50000,
  recoveredAmount: 0,
  outstandingAmount: 50000,
  date: "2026-09-16",
  status: "active",
  isDeleted: false,
  recoveryPlan: {
    frequency: "every_payroll_cycle",
    installmentAmount: 5000,
    firstCycleKey: "2026-09-H1",
    targetCycleKey: "",
    anchorHalf: "H1",
  },
  ...overrides,
});

const draftPayroll = (overrides = {}) => ({
  status: "draft",
  calculationThroughDate: "2026-09-16",
  attendanceIncomplete: false,
  finalizeBlockedReasons: [],
  recoveryApplications: [],
  netSalary: 10000,
  ...overrides,
});

const scheduledRecoveries = ({
  entries = [financeEntry()],
  cycleKey = "2026-09-H1",
  availableSalary = 15000,
  activeDraftRecoveryIds = new Set(),
  existingApplications = [],
} = {}) =>
  buildRecoveryApplicationsForPayroll({
    financeEntries: entries,
    cycle: resolvePayrollCycle(cycleKey),
    availableSalary,
    activeDraftRecoveryIds,
    existingApplications,
  });

(() => {
  const h1 = resolvePayrollCycle("2026-09-H1");
  assert.strictEqual(h1.periodStart, "2026-09-01");
  assert.strictEqual(h1.periodEnd, "2026-09-15");
  assert.strictEqual(h1.dueDate, "2026-09-22");
  assert.strictEqual(h1.halfDays, 15);

  const h2 = resolvePayrollCycle("2026-12-H2");
  assert.strictEqual(h2.periodStart, "2026-12-16");
  assert.strictEqual(h2.periodEnd, "2026-12-31");
  assert.strictEqual(h2.dueDate, "2027-01-07");

  assert.strictEqual(resolvePayrollCycle("2026-02-H2").periodEnd, "2026-02-28");
  assert.strictEqual(resolvePayrollCycle("2028-02-H2").periodEnd, "2028-02-29");
})();

(() => {
  assert.strictEqual(getPayrollBaseCycleKey("2026-09-H2-S2"), "2026-09-H2");
  assert.strictEqual(getPayrollSegmentNo("2026-09-H2-S2"), 2);
  assert.strictEqual(buildSegmentStorageKey("2026-09-H2", 1), "2026-09-H2");
  assert.strictEqual(buildSegmentStorageKey("2026-09-H2", 3), "2026-09-H2-S3");
})();

(() => {
  assert.strictEqual(calc({ cycleKey: "2026-09-H1", rows: periodRows("2026-09-H1") }).netSalary, 15000);
  assert.strictEqual(calc({ cycleKey: "2026-01-H2", rows: periodRows("2026-01-H2") }).netSalary, 15000);
  assert.strictEqual(calc({ cycleKey: "2026-02-H2", rows: periodRows("2026-02-H2") }).netSalary, 15000);
})();

(() => {
  const cycle = resolvePayrollCycle("2026-09-H2");
  const monthDateKeys = listDateKeys(cycle.monthStart, cycle.monthEnd);
  const firstClosing = calc({
    cycleKey: "2026-09-H2",
    rows: [row("2026-09-16")],
    periodDateKeys: ["2026-09-16"],
    monthDateKeys,
  });
  const resumedClosing = calc({
    cycleKey: "2026-09-H2",
    rows: rowsForDates(listDateKeys("2026-09-20", "2026-09-30")),
    periodDateKeys: listDateKeys("2026-09-20", "2026-09-30"),
    monthDateKeys,
  });

  assert.strictEqual(firstClosing.baseSalaryAmount, 1000);
  assert.strictEqual(resumedClosing.baseSalaryAmount, 11000);
  assert.strictEqual(firstClosing.baseSalaryAmount + resumedClosing.baseSalaryAmount, 12000);
})();

(() => {
  const result = calc({
    rows: rowsForDates(listDateKeys("2026-09-06", "2026-09-15")),
    employeeData: employee({ joiningDate: "2026-09-06" }),
  });

  assert.strictEqual(result.eligibleDays, 10);
  assert.strictEqual(result.baseSalaryAmount, 10000);
  assert.strictEqual(result.netSalary, 10000);
})();

(() => {
  const rows = periodRows("2026-09-H1");
  rows[4] = row("2026-09-05", "absent");
  const result = calc({ rows });

  assert.strictEqual(result.absentDays, 1);
  assert.strictEqual(result.absentDeductionAmount, 1000);
  assert.strictEqual(result.netSalary, 14000);
})();

(() => {
  const rows = [
    ...nonSundayRowsForH1(),
    row("2026-09-06", "present"),
    row("2026-09-06", "present"),
  ];
  const result = calc({
    rows,
    employeeData: employee({ weeklyOffDays: ["sunday"] }),
  });

  assert.strictEqual(result.attendanceIncomplete, false);
  assert.strictEqual(result.weeklyOffDaysInPeriod, 2);
  assert.strictEqual(result.offDayWorkedDays, 1);
  assert.strictEqual(result.offDayWorkedAmount, 1000);
  assert.strictEqual(result.netSalary, 16000);
})();

(() => {
  const monthlyRows = periodRows("2026-09-H1");
  monthlyRows[0] = row("2026-09-01", "present", { otHours: 4 });
  const monthly = calc({ rows: monthlyRows });

  assert.strictEqual(monthly.otHours, 4);
  assert.strictEqual(monthly.otAmount, 500);

  const dailyRows = periodRows("2026-09-H1", "absent");
  dailyRows[0] = row("2026-09-01", "present", { otHours: 2 });
  const daily = calc({
    rows: dailyRows,
    employeeData: employee({ salaryType: "daily", baseSalary: 1200 }),
  });

  assert.strictEqual(daily.otAmount, 300);
  assert.strictEqual(daily.netSalary, 1500);
})();

(() => {
  const rows = [
    ...nonSundayRowsForH1().map((item) => ({ ...item, status: "absent" })),
    row("2026-09-06", "present", { isDoubleDuty: true }),
  ];
  const result = calc({
    rows,
    employeeData: employee({
      salaryType: "daily",
      baseSalary: 1200,
      weeklyOffDays: ["sunday"],
    }),
  });

  assert.strictEqual(result.offDayWorkedDays, 1);
  assert.strictEqual(result.doubleDutyCount, 1);
  assert.strictEqual(result.netSalary, 3600);
})();

(() => {
  const firstHalfRows = [
    row("2026-09-01", "leave"),
    row("2026-09-02", "leave"),
    ...rowsForDates(listDateKeys("2026-09-03", "2026-09-15")),
  ];
  const firstHalf = calc({
    rows: firstHalfRows,
    employeeData: employee({ paidLeaveAllowance: 2 }),
  });

  assert.strictEqual(firstHalf.paidLeaveDays, 2);
  assert.strictEqual(firstHalf.unpaidLeaveDays, 0);
  assert.strictEqual(firstHalf.netSalary, 15000);

  const secondHalfRows = [
    row("2026-09-01", "leave"),
    row("2026-09-02", "leave"),
    row("2026-09-16", "leave"),
    ...rowsForDates(listDateKeys("2026-09-17", "2026-09-30")),
  ];
  const secondHalf = calc({
    cycleKey: "2026-09-H2",
    rows: secondHalfRows,
    employeeData: employee({ paidLeaveAllowance: 2 }),
  });

  assert.strictEqual(secondHalf.paidLeaveDays, 0);
  assert.strictEqual(secondHalf.unpaidLeaveDays, 1);
  assert.strictEqual(secondHalf.netSalary, 14000);
})();

(() => {
  const rows = [row("2026-09-01", "leave"), ...rowsForDates(listDateKeys("2026-09-02", "2026-09-15"), "absent")];
  const result = calc({
    rows,
    employeeData: employee({ salaryType: "daily", baseSalary: 1200, paidLeaveAllowance: 1 }),
  });

  assert.strictEqual(result.paidLeaveDays, 1);
  assert.strictEqual(result.unpaidLeaveDays, 0);
  assert.strictEqual(result.netSalary, 1200);
})();

(() => {
  const result = calc({
    rows: rowsForDates(listDateKeys("2026-09-02", "2026-09-15")),
  });

  assert.strictEqual(result.attendanceIncomplete, true);
  assert.deepStrictEqual(result.missingAttendanceDates, ["2026-09-01"]);
  assert.ok(result.finalizeBlockedReasons.includes("Attendance Incomplete"));
})();

(() => {
  const result = calc({
    rows: periodRows("2026-09-H1"),
    additions: [{ type: "bonus", amount: 500, reason: "Quality bonus" }],
    deductions: [{ amount: 200, reason: "Tool recovery" }],
  });

  assert.strictEqual(result.manualAdditionAmount, 500);
  assert.strictEqual(result.manualDeductionAmount, 200);
  assert.strictEqual(result.netSalary, 15300);
})();

(() => {
  const payable = calc({
    rows: periodRows("2026-09-H1"),
    employeeData: employee({ openingBalance: { type: "payable", amount: 5000 } }),
  });
  assert.strictEqual(payable.openingBalanceRecovery.applied, true);
  assert.strictEqual(payable.netSalary, 20000);

  const receivable = calc({
    rows: periodRows("2026-09-H1"),
    employeeData: employee({
      openingBalance: {
        type: "receivable",
        amount: 600,
        deductionIntent: "future_salary",
      },
    }),
  });
  assert.strictEqual(receivable.openingBalanceRecovery.applied, true);
  assert.strictEqual(receivable.netSalary, 14400);

  const unmatchedManualReview = calc({
    rows: periodRows("2026-09-H1"),
    employeeData: employee({
      openingBalance: {
        type: "receivable",
        amount: 600,
        deductionIntent: "manual_review",
        targetCycleKey: "2026-09-H2",
      },
    }),
  });
  assert.strictEqual(unmatchedManualReview.openingBalanceRecovery.applied, false);
  assert.strictEqual(unmatchedManualReview.netSalary, 15000);

  const alreadyApplied = calc({
    rows: periodRows("2026-09-H1"),
    openingAlreadyApplied: true,
    employeeData: employee({ openingBalance: { type: "payable", amount: 5000 } }),
  });
  assert.strictEqual(alreadyApplied.openingBalanceRecovery.applied, false);
  assert.strictEqual(alreadyApplied.netSalary, 15000);
})();

(() => {
  assert.strictEqual(
    derivePayrollDisplayStatus(
      { status: "finalized", paidAmount: 0, remainingDue: 100, dueDate: "2026-09-14" },
      "2026-09-15",
    ),
    "overdue",
  );
  assert.strictEqual(
    derivePayrollDisplayStatus(
      { status: "finalized", paidAmount: 50, remainingDue: 50, dueDate: "2026-09-22" },
      "2026-09-15",
    ),
    "partially_paid",
  );
  assert.strictEqual(
    derivePayrollDisplayStatus(
      { status: "paid", paidAmount: 100, remainingDue: 0, dueDate: "2026-09-22" },
      "2026-09-15",
    ),
    "paid",
  );
})();

(() => {
  const h1 = resolvePayrollCycle("2026-09-H1");
  const h2 = resolvePayrollCycle("2026-09-H2");

  assert.notStrictEqual(h1.key, h2.key);
  assert.strictEqual(h1.periodEnd, "2026-09-15");
  assert.strictEqual(h2.periodStart, "2026-09-16");
})();

(() => {
  const h1 = scheduledRecoveries();
  assert.strictEqual(h1.length, 1);
  assert.strictEqual(h1[0].amount, 5000);
  assert.strictEqual(h1[0].scheduledAmount, 5000);

  const h2 = scheduledRecoveries({
    cycleKey: "2026-09-H2",
    entries: [financeEntry({ outstandingAmount: 45000, recoveredAmount: 5000 })],
  });
  assert.strictEqual(h2[0].amount, 5000);
})();

(() => {
  const duplicateInNextContinuation = scheduledRecoveries({
    cycleKey: "2026-09-H2",
    activeDraftRecoveryIds: new Set(["64f000000000000000000201"]),
  });
  assert.strictEqual(duplicateInNextContinuation.length, 0);

  const freshFinanceStillSchedules = scheduledRecoveries({
    cycleKey: "2026-09-H2",
    activeDraftRecoveryIds: new Set(["64f000000000000000000201"]),
    entries: [
      financeEntry(),
      financeEntry({
        _id: "64f000000000000000000202",
        amount: 3000,
        outstandingAmount: 3000,
        recoveredAmount: 0,
      }),
    ],
  });
  assert.strictEqual(freshFinanceStillSchedules.length, 1);
  assert.strictEqual(String(freshFinanceStillSchedules[0].advanceLoanId), "64f000000000000000000202");
})();

(() => {
  const monthlyH1 = financeEntry({
    recoveryPlan: {
      frequency: "monthly",
      installmentAmount: 5000,
      firstCycleKey: "2026-09-H1",
      targetCycleKey: "",
      anchorHalf: "H1",
    },
  });

  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH1], cycleKey: "2026-09-H1" }).length, 1);
  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH1], cycleKey: "2026-09-H2" }).length, 0);
  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH1], cycleKey: "2026-10-H1" })[0].amount, 5000);
})();

(() => {
  const monthlyH2 = financeEntry({
    recoveryPlan: {
      frequency: "monthly",
      installmentAmount: 5000,
      firstCycleKey: "2026-09-H2",
      targetCycleKey: "",
      anchorHalf: "H2",
    },
  });

  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH2], cycleKey: "2026-09-H1" }).length, 0);
  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH2], cycleKey: "2026-09-H2" })[0].amount, 5000);
  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH2], cycleKey: "2026-10-H1" }).length, 0);
  assert.strictEqual(scheduledRecoveries({ entries: [monthlyH2], cycleKey: "2026-10-H2" })[0].amount, 5000);
})();

(() => {
  const skipped = scheduledRecoveries({
    existingApplications: [
      {
        advanceLoanId: "64f000000000000000000201",
        kind: "loan",
        amount: 0,
        scheduledAmount: 5000,
        isSkipped: true,
        isManualOverride: true,
      },
    ],
  });
  assert.strictEqual(skipped[0].amount, 0);
  assert.strictEqual(skipped[0].isSkipped, true);

  const nextCycle = scheduledRecoveries({
    cycleKey: "2026-09-H2",
    entries: [financeEntry({ outstandingAmount: 50000 })],
  });
  assert.strictEqual(nextCycle[0].amount, 5000);
})();

(() => {
  const overridden = scheduledRecoveries({
    existingApplications: [
      {
        advanceLoanId: "64f000000000000000000201",
        kind: "loan",
        amount: 3000,
        scheduledAmount: 5000,
        isManualOverride: true,
      },
    ],
  });
  assert.strictEqual(overridden[0].amount, 3000);

  const nextCycle = scheduledRecoveries({
    cycleKey: "2026-09-H2",
    entries: [financeEntry({ outstandingAmount: 47000 })],
  });
  assert.strictEqual(nextCycle[0].amount, 5000);
})();

(() => {
  const finalInstallment = scheduledRecoveries({
    entries: [financeEntry({ amount: 50000, recoveredAmount: 47800, outstandingAmount: 2200 })],
  });
  assert.strictEqual(finalInstallment[0].scheduledAmount, 2200);
  assert.strictEqual(finalInstallment[0].amount, 2200);
})();

(() => {
  const capped = scheduledRecoveries({ availableSalary: 3000 });
  assert.strictEqual(capped[0].amount, 3000);
  assert.strictEqual(capped.reduce((sum, entry) => sum + entry.amount, 0), 3000);
})();

(() => {
  const entry = financeEntry();
  const before = JSON.stringify(entry);
  scheduledRecoveries({ entries: [entry] });
  assert.strictEqual(JSON.stringify(entry), before);
})();

(() => {
  const skippedAfterRecalculate = scheduledRecoveries({
    existingApplications: [
      {
        advanceLoanId: "64f000000000000000000201",
        kind: "loan",
        amount: 0,
        scheduledAmount: 5000,
        isSkipped: true,
        isManualOverride: true,
      },
    ],
  });
  const overriddenAfterRecalculate = scheduledRecoveries({
    existingApplications: [
      {
        advanceLoanId: "64f000000000000000000201",
        kind: "loan",
        amount: 2000,
        scheduledAmount: 5000,
        isManualOverride: true,
      },
    ],
  });

  assert.strictEqual(skippedAfterRecalculate[0].amount, 0);
  assert.strictEqual(overriddenAfterRecalculate[0].amount, 2000);
})();

(() => {
  const advance = financeEntry({
    _id: "64f000000000000000000301",
    kind: "advance",
    amount: 3000,
    outstandingAmount: 3000,
    recoveryPlan: {
      frequency: "carry_forward",
      installmentAmount: 0,
      firstCycleKey: "",
      targetCycleKey: "2026-09-H1",
      anchorHalf: "H1",
    },
  });

  assert.strictEqual(isFinanceEntryEligibleForCycle(advance, "2026-09-H1"), true);
  assert.strictEqual(scheduledRecoveries({ entries: [advance], availableSalary: 2000 })[0].amount, 2000);
  assert.strictEqual(
    scheduledRecoveries({
      entries: [financeEntry({ ...advance, outstandingAmount: 1000, recoveredAmount: 2000 })],
      cycleKey: "2026-09-H2",
      availableSalary: 15000,
    })[0].amount,
    1000,
  );
})();

(() => {
  const advanceFromAfterPeriod = financeEntry({
    _id: "64f000000000000000000302",
    kind: "advance",
    amount: 3000,
    outstandingAmount: 3000,
    date: "2026-09-16",
    recoveryPlan: {
      frequency: "carry_forward",
      installmentAmount: 0,
      firstCycleKey: "",
      targetCycleKey: "2026-09-H1",
      anchorHalf: "H1",
    },
  });

  assert.strictEqual(isFinanceEntryEligibleForCycle(advanceFromAfterPeriod, "2026-09-H1"), true);
})();

(() => {
  const blocked = scheduledRecoveries({
    activeDraftRecoveryIds: new Set(["64f000000000000000000201"]),
  });

  assert.strictEqual(blocked.length, 0);
})();

(() => {
  const cycle = resolvePayrollCycle("2026-09-H2");
  const eligibility = validateEarlyCloseEligibility({
    cycle,
    payrolls: [draftPayroll()],
    reason: "Factory closed early",
    todayKey: "2026-09-16",
  });

  assert.strictEqual(eligibility.throughDate, "2026-09-16");
  assert.strictEqual(eligibility.reason, "Factory closed early");
  assert.strictEqual(eligibility.draftPayrolls.length, 1);
})();

(() => {
  assert.throws(
    () => assertCycleCanFinalize(resolvePayrollCycle("2026-09-H2"), "2026-09-16"),
    /Cannot Finalize Before Cycle End/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [draftPayroll()],
        reason: "",
        todayKey: "2026-09-16",
      }),
    /Reason/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [draftPayroll()],
        reason: "Too soon",
        todayKey: "2026-09-15",
      }),
    /Not Started/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [draftPayroll()],
        reason: "Cycle ended",
        todayKey: "2026-10-01",
      }),
    /normal Finalize/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [
          draftPayroll({ calculationThroughDate: "2026-09-16" }),
          draftPayroll({ calculationThroughDate: "2026-09-17" }),
        ],
        reason: "Mixed rows",
        todayKey: "2026-09-17",
      }),
    /not synchronized/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [draftPayroll(), draftPayroll({ status: "finalized" })],
        reason: "Partial close",
        todayKey: "2026-09-16",
      }),
    /all payroll rows to be Draft/,
  );
})();

(() => {
  assert.throws(
    () =>
      validateEarlyCloseEligibility({
        cycle: resolvePayrollCycle("2026-09-H2"),
        payrolls: [
          draftPayroll({
            attendanceIncomplete: true,
            finalizeBlockedReasons: ["Attendance Incomplete"],
          }),
        ],
        reason: "Blocked rows",
        todayKey: "2026-09-16",
      }),
    /blocked/,
  );
})();

(() => {
  const fullHistoricalCycle = calc({
    rows: rowsForDates(listDateKeys("2026-09-01", "2026-09-15")),
    employeeData: employee({
      isDeleted: true,
      status: "inactive",
      deletedAt: "2026-09-16T08:00:00.000Z",
    }),
  });
  assert.strictEqual(fullHistoricalCycle.eligibleDays, 15);
  assert.strictEqual(fullHistoricalCycle.netSalary, 15000);

  const cutoffCycle = calc({
    rows: rowsForDates(listDateKeys("2026-09-01", "2026-09-15")),
    employeeData: employee({
      isDeleted: true,
      status: "inactive",
      deletedAt: "2026-09-10T08:00:00.000Z",
    }),
  });
  assert.strictEqual(cutoffCycle.eligibleDays, 10);
  assert.strictEqual(cutoffCycle.netSalary, 10000);
})();

console.log("weaving payroll calculation tests passed");
