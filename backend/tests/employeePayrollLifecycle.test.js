const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  getEmployeeOriginsForScope,
} = require("../utils/employeePayrollOrigins");

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, relativePath), "utf8");

const controller = read("../controllers/employeeController.js");
const accounting = read("../services/employee/employeeAccountingService.js");
const weaving = read("../services/weaving/weavingPayrollService.js");
const routes = read("../routes/employeeRoutes.js");
const model = read("../models/EmployeePayroll.js");
const reportSources = [
  read("../controllers/dashboardController.js"),
  read("../controllers/profitController.js"),
  read("../controllers/incomeStatementController.js"),
  read("../services/accounting/profitService.js"),
];

assert.match(
  controller,
  /\{ isDeleted: true \},\s*\{ isDeleted: \{ \$ne: true \}, status: "inactive" \}/,
  "inactive employee state must include archived and manually inactive employees",
);
assert.match(
  controller,
  /isDeleted: \{ \$ne: true \}, status: "active"/,
  "active employee state must require both active status and a non-deleted record",
);
assert.match(accounting, /isDeleted: false,\s*status: "active"/);
assert.match(routes, /"\/payroll\/:id\/restore"/);

const tradingOrigins = getEmployeeOriginsForScope("trading");
const travelOrigins = getEmployeeOriginsForScope("travel");
const weavingOrigins = getEmployeeOriginsForScope("weaving");
assert.notStrictEqual(tradingOrigins.SALARY, travelOrigins.SALARY);
assert.notStrictEqual(tradingOrigins.SALARY, weavingOrigins.SALARY);
assert.notStrictEqual(travelOrigins.SALARY_PAYMENT, weavingOrigins.SALARY_PAYMENT);

assert.match(model, /supersededJournalEntryIds/);
assert.match(model, /statusBeforeVoid/);
assert.match(controller, /recreatePayrollPaymentJournals/);
assert.match(weaving, /recreatePayrollPaymentJournals/);
assert.match(
  accounting,
  /paymentDate: oldHistory\?\.paymentDate \|\| original\.date/,
  "restore must retain each original payment date",
);
assert.match(
  accounting,
  /paymentAccountId: paymentAccount\._id/,
  "restore must retain each payment account",
);

assert.match(
  controller,
  /journalIds: \[payroll\.journalEntryId\]/,
  "shared payroll correction must reverse only the salary accrual",
);
assert.match(
  weaving,
  /journalIds: \[payroll\.journalEntryId\]/,
  "Weaving payroll correction must reverse only the salary accrual",
);
assert.match(controller, /Paid amount exceeds the corrected salary/);
assert.match(weaving, /Paid amount exceeds the corrected salary/);
assert.match(controller, /await reversePayrollRecoveries[\s\S]*await applyPayrollRecoveries/);
assert.match(weaving, /await reversePayrollRecoveries[\s\S]*await applyPayrollRecoveries/);

assert.match(
  weaving,
  /fixedGross[\s\S]*manualAdditionAmount[\s\S]*fixedDeductions[\s\S]*manualDeductionAmount/,
  "finalized Weaving correction must use stored payroll values plus manual changes",
);
assert.match(weaving, /attendanceIncomplete/);
assert.match(weaving, /recordState = "active"/);

reportSources.forEach((source) => {
  assert.match(source, /isReversed: \{ \$ne: true \}/);
  assert.match(source, /isReversal: \{ \$ne: true \}/);
  assert.match(source, /moduleScope: \{ \$in: \["travel", "weaving"\] \}/);
});

console.log("employee/payroll lifecycle tests passed");
