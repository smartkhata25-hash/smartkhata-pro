const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PAYROLL_REVIEW_SECRET = process.env.PAYROLL_REVIEW_SECRET || "weaving-payroll-test-secret";
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

test("range review classifies full, partial, paid and revised overlaps", () => {
  const full = _test.classifyPayrollOverlap({
    from: "2026-09-01", to: "2026-09-15",
    payrolls: [{ _id: "p1", periodStart: "2026-09-01", calculationThroughDate: "2026-09-15", status: "paid", paidAmount: 1000, revisionHistory: [{}] }],
  });
  assert.equal(full.outcome, "already_finalized");
  assert.equal(full.overlaps[0].status, "paid");
  assert.equal(full.overlaps[0].wasRevised, true);

  const partial = _test.classifyPayrollOverlap({
    from: "2026-09-01", to: "2026-09-15",
    payrolls: [{ _id: "p2", segmentStart: "2026-09-01", calculationThroughDate: "2026-09-07", status: "finalized" }],
  });
  assert.equal(partial.outcome, "partial_overlap");
  assert.equal(partial.overlaps[0].overlapToDate, "2026-09-07");

  assert.equal(_test.classifyPayrollOverlap({ from: "2026-09-01", to: "2026-09-15", payrolls: [] }).outcome, "processed");
});

test("review token is required, signed, scoped, input-bound and refreshable", () => {
  const now = Date.UTC(2026, 8, 1);
  const inputs = { userId: "u1", fromDate: "2026-09-01", toDate: "2026-09-15", employeeId: "e1", finalSettlement: true, payAfterFinalize: false, reviewFingerprint: "financial-snapshot-1" };
  const reviewed = _test.buildPayrollReviewToken(inputs, now);
  assert.equal(_test.verifyPayrollReviewToken(reviewed, inputs, now + 1), true);
  assert.doesNotThrow(() => _test.assertValidPayrollReviewToken({ reviewToken: reviewed, ...inputs }, now + 1));
  assert.throws(() => _test.assertValidPayrollReviewToken({ reviewToken: "", ...inputs }, now + 1), /Fresh payroll review required/);
  assert.throws(() => _test.assertValidPayrollReviewToken({ reviewToken: reviewed, ...inputs, toDate: "2026-09-14" }, now + 1), /Fresh payroll review required/);
  assert.throws(() => _test.assertValidPayrollReviewToken({ reviewToken: reviewed, ...inputs, finalSettlement: false }, now + 1), /Fresh payroll review required/);
  assert.throws(() => _test.assertValidPayrollReviewToken({ reviewToken: reviewed, ...inputs, userId: "u2" }, now + 1), /Fresh payroll review required/);
  assert.throws(() => _test.assertValidPayrollReviewToken({ reviewToken: reviewed, ...inputs }, now + (16 * 60 * 1000)), /Fresh payroll review required/);
  const fresh = _test.buildPayrollReviewToken({ ...inputs, finalSettlement: false, reviewFingerprint: "financial-snapshot-2" }, now + 2);
  assert.doesNotThrow(() => _test.assertValidPayrollReviewToken({ reviewToken: fresh, ...inputs, finalSettlement: false }, now + 3));
});

test("review totals include non-zero manual additions and deductions", () => {
  const totals = _test.summarizePayrollRangeRows([
    { payroll: { grossSalary: 54000, netSalary: 47000, totalAdditions: 4000, totalDeductions: 5000, recoveryApplications: [{ kind: "loan", amount: 2000 }] } },
    { payroll: { grossSalary: 31500, netSalary: 30000, totalAdditions: 1500, totalDeductions: 1000, recoveryApplications: [{ kind: "advance", amount: 500 }] } },
  ]);
  assert.deepEqual(totals, { grossSalary: 85500, netPayable: 77000, loanRecovery: 2000, advanceRecovery: 500, additions: 5500, deductions: 6000 });
});

test("structured final settlement protects skipped recovery and applies only selected recovery", () => {
  const skipped = _test.buildSettlementPosition({ currentPayrollNet: 40000, payAfterFinalize: true, outstandingLoanBefore: 10000, skippedLoanRecovery: 10000 });
  assert.equal(skipped.settlement.amountBeingPaidNow, 40000);
  assert.equal(skipped.finance.remainingLoan, 10000);
  assert.equal(skipped.finance.skippedLoanRecovery, 10000);
  const manual = _test.buildSettlementPosition({ currentPayrollNet: 36000, payAfterFinalize: true, outstandingLoanBefore: 10000, loanRecovery: 4000 });
  assert.equal(manual.settlement.amountBeingPaidNow, 36000);
  assert.equal(manual.finance.remainingLoan, 6000);
});

test("final settlement cash follows eligible prior receivable/payable including zero payroll", () => {
  const payable = _test.buildSettlementPosition({ broughtForwardPayable: 20000, currentPayrollNet: 40000, payAfterFinalize: true });
  assert.equal(payable.settlement.amountBeingPaidNow, 60000);
  assert.equal(payable.settlement.remainingEmployeePayable, 0);
  assert.deepEqual(_test.buildLedgerSettlementAllocation({ currentPayrollNet: 40000, broughtForwardPayable: 20000 }), { cashAmount: 60000, payrollAppliedAmount: 40000, settlementOffsetAmount: 0, broughtForwardPayableApplied: 20000, broughtForwardReceivableApplied: 0 });
  const receivable = _test.buildSettlementPosition({ broughtForwardReceivable: 10000, currentPayrollNet: 40000, payAfterFinalize: true });
  assert.equal(receivable.settlement.amountBeingPaidNow, 30000);
  assert.equal(receivable.settlement.remainingEmployeeReceivable, 0);
  assert.deepEqual(_test.buildLedgerSettlementAllocation({ currentPayrollNet: 40000, broughtForwardReceivable: 10000 }), { cashAmount: 30000, payrollAppliedAmount: 30000, settlementOffsetAmount: 10000, broughtForwardPayableApplied: 0, broughtForwardReceivableApplied: 10000 });
  assert.equal(_test.buildSettlementPosition({ broughtForwardPayable: 20000, currentPayrollNet: 0, payAfterFinalize: true }).settlement.amountBeingPaidNow, 20000);
});

test("prior unpaid payroll is intentionally excluded and settled opening balance is not paid twice", () => {
  const position = _test.buildSettlementPosition({ currentPayrollNet: 30000, priorPayrollOutstanding: 20000, payAfterFinalize: true });
  assert.equal(position.settlement.amountBeingPaidNow, 30000);
  assert.equal(position.settlement.priorPayrollSettlement, 0);
  assert.equal(position.settlement.priorPayrollOutstanding, 20000);
  const remaining = _test.getEligibleBroughtForwardPosition({ employee: { openingBalance: { amount: 20000, type: "payable" } }, priorState: { payableApplied: 20000 } });
  assert.deepEqual(remaining, { broughtForwardPayable: 0, broughtForwardReceivable: 0 });
  assert.deepEqual(_test.getEligibleBroughtForwardPosition({ employee: { openingBalance: { amount: 0, type: "" } }, priorState: { receivableApplied: 10000 } }), { broughtForwardPayable: 0, broughtForwardReceivable: 0 });
});

test("final settlement exposes loan remaining after salary and allows operational inactivation", () => {
  const position = _test.buildSettlementPosition({
    currentPayrollNet: 0,
    payAfterFinalize: true,
    outstandingLoanBefore: 50000,
    loanRecovery: 30000,
  });
  assert.equal(position.finance.remainingLoan, 20000);
  assert.equal(position.settlement.remainingEmployeeReceivable, 0);
  assert.equal(position.settlement.remainingEmployeePayable, 0);
});

const snapshotFixture = () => ({
  from: "2026-09-01",
  to: "2026-09-15",
  totals: { grossSalary: 44000, netPayable: 40000, additions: 1000, deductions: 5000, loanRecovery: 0, advanceRecovery: 0 },
  rows: [{
    employee: { _id: "e1", salaryType: "monthly", baseSalary: 40000, dutyHours: 8, weeklyOffDays: ["sunday"], paidLeaveAllowance: 1, otAllowed: true, openingBalance: { amount: 10000, type: "receivable" } },
    payroll: { employeeId: "e1", baseSalary: 40000, grossSalary: 44000, totalAdditions: 1000, totalDeductions: 5000, recoveryAmount: 0, otHours: 2, otAmount: 3000, doubleDutyCount: 0, doubleDutyAmount: 0, netSalary: 40000, additions: [{ type: "other", amount: 1000 }], deductions: [{ amount: 5000 }], recoveryApplications: [{ advanceLoanId: "loan1", kind: "loan", amount: 0, scheduledAmount: 10000, isSkipped: true, isManualOverride: true }] },
  }],
  overlapReviews: [{ employeeId: "e1", outcome: "processed", overlaps: [], broughtForward: { employeeReceivable: 10000 }, settlement: { currentPayrollNet: 40000, broughtForwardReceivable: 10000, amountBeingPaidNow: 30000 }, finance: { remainingLoan: 10000, skippedLoanRecovery: 10000 } }],
  context: { attendanceRows: [{ employeeId: "e1", attendanceDate: "2026-09-01", shiftId: "s1", status: "present", otHours: 2, isDoubleDuty: false }] },
});

test("review fingerprint is stable across ordering and accepts unchanged recalculation", () => {
  const reviewed = snapshotFixture();
  const reordered = snapshotFixture();
  reordered.rows[0].payroll.additions = [...reordered.rows[0].payroll.additions].reverse();
  reordered.context.attendanceRows = [...reordered.context.attendanceRows].reverse();
  const fingerprint = _test.buildPayrollReviewFingerprint(reviewed);
  assert.equal(_test.buildPayrollReviewFingerprint(reordered), fingerprint);
  assert.doesNotThrow(() => _test.assertPayrollReviewFingerprint(fingerprint, reordered));
});

test("review fingerprint rejects attendance, OT, recovery, salary and opening-balance changes", () => {
  const original = snapshotFixture();
  const fingerprint = _test.buildPayrollReviewFingerprint(original);
  const mutations = [
    (value) => { value.context.attendanceRows[0].status = "absent"; },
    (value) => { value.rows[0].payroll.otHours = 3; },
    (value) => { value.rows[0].payroll.recoveryApplications[0].amount = 4000; },
    (value) => { value.rows[0].payroll.recoveryApplications[0].isSkipped = false; },
    (value) => { value.rows[0].employee.baseSalary = 45000; },
    (value) => { value.rows[0].employee.openingBalance.amount = 12000; },
  ];
  mutations.forEach((mutate) => {
    const changed = snapshotFixture();
    mutate(changed);
    assert.throws(() => _test.assertPayrollReviewFingerprint(fingerprint, changed), /Payroll data changed after review/);
    const refreshed = _test.buildPayrollReviewFingerprint(changed);
    assert.doesNotThrow(() => _test.assertPayrollReviewFingerprint(refreshed, changed));
  });
});
