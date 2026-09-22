const assert = require("assert");
const fs = require("fs");
const path = require("path");

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, relativePath), "utf8");

const {
  _test: {
    activeSalaryJournalFilter,
    salaryExpenseDebitTotal,
  },
} = require("../services/weaving/weavingOperationalReportService");
const { _test: costingTest } = require("../services/weaving/weavingCostingService");

const activeSalary = {
  lines: [
    { type: "debit", amount: 50000, account: { code: "WEAVING_SALARY_EXP", category: "salary" } },
    { type: "credit", amount: 50000, account: { category: "employee" } },
  ],
};
const paymentReversal = {
  lines: [
    { type: "debit", amount: 40000, account: { category: "employee" } },
    { type: "credit", amount: 40000, account: { category: "cash" } },
  ],
};
assert.strictEqual(salaryExpenseDebitTotal([activeSalary]), 50000);
assert.strictEqual(
  salaryExpenseDebitTotal([activeSalary, paymentReversal]),
  50000,
  "payment and reversal debits are not payroll expense",
);
assert.deepStrictEqual(activeSalaryJournalFilter("owner", {}), {
  createdBy: "owner",
  moduleScope: "weaving",
  originModule: "weaving_employee_salary",
  isDeleted: { $ne: true },
  isReversed: { $ne: true },
  isReversal: { $ne: true },
  sourceType: { $ne: "reversal" },
});

assert.strictEqual(costingTest.isCostingRunDirty(null), false);
assert.strictEqual(costingTest.isCostingRunDirty({ dimensions: { dirty: false } }), false);
assert.strictEqual(costingTest.isCostingRunDirty({ dimensions: { dirty: true } }), true);

const attendance = read("../controllers/weavingAttendanceController.js");
const historicalJoin = attendance.slice(
  attendance.indexOf("const extraEmployees"),
  attendance.indexOf("const employeeMap"),
);
assert.doesNotMatch(historicalJoin, /status:\s*"active"|isDeleted:\s*false|unitId:/);
assert.match(attendance, /const baseEmployees[\s\S]*status: "active"[\s\S]*isDeleted: false/);
assert.match(attendance, /const getReplacementOptions[\s\S]*status: "active"[\s\S]*isDeleted: false/);
assert.match(attendance, /const employeeRows[\s\S]*status: "active"[\s\S]*isDeleted: false/);

const payroll = read("../services/weaving/weavingPayrollService.js");
const finalizeLookup = payroll.slice(
  payroll.indexOf("const finalizePayrollDocument"),
  payroll.indexOf("const finalizeWeavingPayroll"),
);
const payLookup = payroll.slice(
  payroll.indexOf("const payWeavingPayroll"),
  payroll.indexOf("const voidWeavingPayroll"),
);
assert.doesNotMatch(finalizeLookup, /Employee\.findOne\([\s\S]*status:\s*"active"/);
assert.doesNotMatch(payLookup, /Employee\.findOne\([\s\S]*status:\s*"active"/);
assert.match(payroll, /collectHistoricalPayrollEmployeeIds/);
assert.match(payroll, /\{ _id: \{ \$in: historicalObjectIds \} \}/);

const reports = read("../services/weaving/weavingOperationalReportService.js");
assert.match(reports, /activeSalaryJournalFilter\(userId, range\)/g);
assert.match(reports, /salaryExpenseDebitTotal\(payrollJournals\)/g);
assert.match(reports, /if \(!canViewProfit\)/);
assert.match(reports, /canViewProfit: false/);

const reportController = read("../controllers/weaving/weavingReportController.js");
assert.match(reportController, /hasPermission\(req\.user\?\.permissions \|\| \[\], "weaving\.reports\.profit"\)/);
const reportRoutes = read("../routes/weavingReportRoutes.js");
assert.match(reportRoutes, /profit: \["weaving\.reports\.profit"\]/);
assert.match(reportRoutes, /operational\/:kind\/print[\s\S]*requireReportKindPermission/);
assert.match(reportRoutes, /operational\/:kind\/pdf[\s\S]*requireReportKindPermission/);

const costing = read("../services/weaving/weavingCostingService.js");
assert.match(costing, /markWeavingCostingDirty/);
assert.match(costing, /rebuildPromises/);
assert.match(costing, /const run = await ensureFreshRun\(userId\)/g);
[
  "weavingCommercialService.js",
  "weavingFoldingService.js",
  "weavingBeamService.js",
  "weavingSizingService.js",
  "weavingStockControlService.js",
  "weavingYarnStockService.js",
  "weavingSalesService.js",
].forEach((file) => {
  assert.match(
    read(`../services/weaving/${file}`),
    /withCostingInvalidation/,
    `${file} must invalidate costing after source mutations`,
  );
});
assert.match(
  read("../controllers/weavingOperationsController.js"),
  /markWeavingCostingDirty\(ownerId, "opening_stock"\)/,
);
assert.doesNotMatch(
  read("../services/weaving/weavingSalesService.js"),
  /costing\.rebuildCosting/,
  "sales mutations should invalidate rather than eagerly rebuild",
);

const accounting = read("../services/employee/employeeAccountingService.js");
const financialSummary = accounting.slice(
  accounting.indexOf("const getEmployeeFinancialSummary"),
  accounting.indexOf("const normalizeMasterLedgerStatusFilter"),
);
const financialEmployeeQuery = financialSummary.slice(
  financialSummary.indexOf("Employee.find"),
  financialSummary.indexOf("const balanceMap"),
);
assert.doesNotMatch(financialEmployeeQuery, /isDeleted:\s*false|status:\s*"active"/);

const employeeController = read("../controllers/employeeController.js");
const updatePayroll = employeeController.slice(
  employeeController.indexOf("exports.updatePayroll"),
  employeeController.indexOf("exports.finalizePayroll"),
);
const payPayroll = employeeController.slice(
  employeeController.indexOf("exports.payPayroll"),
  employeeController.indexOf("exports.voidPayroll"),
);
assert.doesNotMatch(updatePayroll, /action:\s*"pay"/);
assert.match(updatePayroll, /Salary Corrected|corrected/);
assert.match(payPayroll, /action:\s*"pay"/);
assert.match(payPayroll, /paymentAccountId/);

const backup = read("../services/backupService.js");
const restore = read("../services/restoreService.js");
[
  ["weavingbeamsets", "WeavingBeamSet"],
  ["weavingbeams", "WeavingBeam"],
  ["weavingknottingjobs", "WeavingKnottingJob"],
].forEach(([collection, model]) => {
  assert.match(backup, new RegExp(`${collection}: \\{ field: "userId"`));
  assert.match(restore, new RegExp(`${collection}: \\(\\) => require\\("\\.\\./models/${model}"\\)`));
  assert.strictEqual(require(`../models/${model}`).collection.name, collection);
});

console.log("targeted Weaving regression tests passed");
