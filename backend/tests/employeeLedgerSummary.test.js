const assert = require("assert");

const {
  _test: {
    buildEmployeeLedgerSummaryRow,
    summarizeEmployeeLedgerRows,
  },
} = require("../services/employee/employeeAccountingService");

const employee = (overrides = {}) => ({
  _id: overrides._id || "64f000000000000000000001",
  employeeNo: "EMP-001",
  name: "Test Employee",
  phone: "03001234567",
  designationName: "Weaver",
  unitNo: 1,
  unitName: "Unit 1",
  departmentName: "Weaving",
  status: "active",
  isDeleted: false,
  ...overrides,
});

(() => {
  const row = buildEmployeeLedgerSummaryRow({
    employee: employee(),
    balanceSummary: { balance: 12000, totalDebit: 0, totalCredit: 12000 },
  });

  assert.strictEqual(row.payable, 12000);
  assert.strictEqual(row.recoverable, 0);
  assert.strictEqual(row.netPosition, 12000);
  assert.strictEqual(row.positionType, "payable");
})();

(() => {
  const row = buildEmployeeLedgerSummaryRow({
    employee: employee(),
    balanceSummary: { balance: -8500, totalDebit: 8500, totalCredit: 0 },
  });

  assert.strictEqual(row.payable, 0);
  assert.strictEqual(row.recoverable, 8500);
  assert.strictEqual(row.netPosition, 8500);
  assert.strictEqual(row.positionType, "recoverable");
})();

(() => {
  const row = buildEmployeeLedgerSummaryRow({
    employee: employee(),
    balanceSummary: { balance: 0, totalDebit: 0, totalCredit: 0 },
  });

  assert.strictEqual(row.payable, 0);
  assert.strictEqual(row.recoverable, 0);
  assert.strictEqual(row.netPosition, 0);
  assert.strictEqual(row.positionType, "settled");
})();

(() => {
  const row = buildEmployeeLedgerSummaryRow({
    employee: employee(),
    balanceSummary: { balance: -20000, totalDebit: 20000, totalCredit: 0 },
    financeSummary: {
      loanOutstanding: 15000,
      kharchaOutstanding: 5000,
    },
  });
  const summary = summarizeEmployeeLedgerRows([row]);

  assert.strictEqual(row.recoverable, 20000);
  assert.strictEqual(row.loanOutstanding, 15000);
  assert.strictEqual(row.kharchaOutstanding, 5000);
  assert.strictEqual(summary.totalRecoverable, 20000);
  assert.strictEqual(summary.totalLoan, 15000);
  assert.strictEqual(summary.totalKharcha, 5000);
})();

(() => {
  const hidden = buildEmployeeLedgerSummaryRow({
    employee: employee({ _id: "64f000000000000000000002", isDeleted: true }),
    balanceSummary: { balance: -4000 },
  });

  assert.strictEqual(hidden.isDeleted, true);
  assert.strictEqual(hidden.recoverable, 4000);
})();

console.log("employee ledger summary tests passed");
