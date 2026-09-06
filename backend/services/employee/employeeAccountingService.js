const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Employee = require("../../models/Employee");
const EmployeeAdvanceLoan = require("../../models/EmployeeAdvanceLoan");
const JournalEntry = require("../../models/JournalEntry");
const { recalculateAccountBalances } = require("../../utils/accountHelper");
const { createReversalEntry } = require("../../utils/journalReversal");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  documentMatchesModuleScope,
  normalizeModuleScope,
} = require("../../utils/moduleScope");
const {
  buildBusinessDateRange,
  formatBusinessDate,
  getBusinessDateKey,
  getCurrentBusinessTimeInput,
  parseBusinessDateTime,
} = require("../../utils/businessDate");
const {
  getEmployeeOriginsForScope,
  getEmployeeOriginValuesForScope,
} = require("../../utils/employeePayrollOrigins");

const EMPLOYEE_ACCOUNT_CATEGORY = "employee";
const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];

const roundMoney = (value = 0) => Math.round(Number(value || 0) * 100) / 100;

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const toObjectId = (value, label = "id") => {
  if (!isValidObjectId(value)) {
    throw createHttpError(`Invalid ${label}`, 400);
  }

  return new mongoose.Types.ObjectId(value);
};

const getSessionQuery = (query, session) =>
  session ? query.session(session) : query;

const normalizeEmployeeModuleScope = (
  value,
  fallback = MODULE_SCOPES.TRADING,
) => {
  const scope = normalizeModuleScope(value, fallback);
  return scope === MODULE_SCOPES.TRAVEL
    ? MODULE_SCOPES.TRAVEL
    : MODULE_SCOPES.TRADING;
};

const getModuleScopeFromRequest = (req) => {
  const fromTravelRoute = String(req.originalUrl || "").startsWith(
    "/api/travel/",
  );

  return normalizeEmployeeModuleScope(
    req.body?.moduleScope || req.query?.moduleScope,
    fromTravelRoute ? MODULE_SCOPES.TRAVEL : MODULE_SCOPES.TRADING,
  );
};

const getOriginsForScope = (moduleScope) =>
  getEmployeeOriginsForScope(normalizeEmployeeModuleScope(moduleScope));

const getOriginValuesForScope = (moduleScope) =>
  getEmployeeOriginValuesForScope(normalizeEmployeeModuleScope(moduleScope));

const getSalaryExpenseAccountConfig = (moduleScope) =>
  moduleScope === MODULE_SCOPES.TRAVEL
    ? {
        code: "TRAVEL_SALARY_EXP",
        name: "Travel Salary Expense",
        moduleScope: MODULE_SCOPES.TRAVEL,
      }
    : {
        code: "SALARY_EXP",
        name: "Salary Expense",
        moduleScope: MODULE_SCOPES.TRADING,
      };

const ensureSalaryExpenseAccount = async ({ userId, moduleScope, session }) => {
  const config = getSalaryExpenseAccountConfig(moduleScope);
  const query = {
    userId,
    code: config.code,
    moduleScope: config.moduleScope,
  };

  return getSessionQuery(
    Account.findOneAndUpdate(
      query,
      {
        $setOnInsert: {
          userId,
          name: config.name,
          type: "Expense",
          category: "salary",
          code: config.code,
          normalBalance: "debit",
          openingBalance: 0,
          isSystem: false,
          moduleScope: config.moduleScope,
          isActive: true,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ),
    session,
  );
};

const buildEmployeeAccountCode = (employee, moduleScope) => {
  const prefix = moduleScope === MODULE_SCOPES.TRAVEL ? "TRAVEL_EMP" : "EMP";
  return `${prefix}_${String(employee._id).slice(-8).toUpperCase()}`;
};

const ensureEmployeeAccount = async ({ userId, moduleScope, employee, session }) => {
  if (employee.account && isValidObjectId(employee.account)) {
    return getSessionQuery(Account.findById(employee.account), session);
  }

  const code = buildEmployeeAccountCode(employee, moduleScope);
  const name = `${employee.name} Employee Account`;
  const account = await getSessionQuery(
    Account.findOneAndUpdate(
      {
        userId,
        code,
        moduleScope,
      },
      {
        $setOnInsert: {
          userId,
          name,
          type: "Liability",
          category: EMPLOYEE_ACCOUNT_CATEGORY,
          code,
          normalBalance: "credit",
          openingBalance: 0,
          isSystem: false,
          moduleScope,
          isActive: true,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ),
    session,
  );

  employee.account = account._id;
  await employee.save(session ? { session } : undefined);

  return account;
};

const syncEmployeeAccountName = async ({ employee, session }) => {
  if (!employee?.account) return;

  await getSessionQuery(
    Account.updateOne(
      { _id: employee.account, userId: employee.userId },
      {
        $set: {
          name: `${employee.name} Employee Account`,
          moduleScope: employee.moduleScope,
          category: EMPLOYEE_ACCOUNT_CATEGORY,
        },
      },
      { strict: false },
    ),
    session,
  );
};

const validateEmployee = async ({ userId, employeeId, moduleScope, session }) => {
  const employee = await getSessionQuery(
    Employee.findOne({
      _id: toObjectId(employeeId, "employee"),
      userId,
      moduleScope,
      isDeleted: false,
    }),
    session,
  );

  if (!employee) {
    throw createHttpError("Employee not found", 404);
  }

  return employee;
};

const validatePaymentAccount = async ({
  userId,
  moduleScope,
  paymentAccountId,
  session,
}) => {
  const query = {
    _id: toObjectId(paymentAccountId, "payment account"),
    userId,
    type: "Asset",
    category: { $in: PAYMENT_ACCOUNT_CATEGORIES },
    isActive: { $ne: false },
  };

  applyModuleScopeFilter(query, moduleScope);

  const account = await getSessionQuery(Account.findOne(query), session);

  if (!account || !documentMatchesModuleScope(account, moduleScope)) {
    throw createHttpError(
      "Payment account is not available in this module.",
      400,
    );
  }

  return account;
};

const getPaymentTypeFromAccount = (account) => {
  if (account?.category === "cash") return "cash";
  if (account?.category === "cheque") return "cheque";
  return "online";
};

const parseEntryDateTime = ({ date, time, label }) => {
  const businessDate = getBusinessDateKey(date, {
    fallback: new Date(),
    label,
  });
  const businessTime = time || getCurrentBusinessTimeInput();

  return {
    businessDate,
    businessTime,
    journalDate: parseBusinessDateTime(businessDate, businessTime, {
      defaultTime: "00:00",
      label,
    }),
  };
};

const collectAccountIdsFromJournal = (journal) =>
  (journal?.lines || [])
    .map((line) => line.account)
    .filter(Boolean)
    .map((id) => String(id));

const createEmployeeJournal = async ({
  userId,
  moduleScope,
  employee,
  date,
  time,
  description,
  sourceType = "payment",
  originModule,
  referenceId = null,
  billNo = "",
  lines,
  session,
}) => {
  const { businessTime, journalDate } = parseEntryDateTime({
    date,
    time,
    label: "employee journal date",
  });

  const roundedLines = lines.map((line) => ({
    account: line.account,
    type: line.type,
    amount: roundMoney(line.amount),
    paymentType: line.paymentType || undefined,
  }));

  const debitTotal = roundedLines
    .filter((line) => line.type === "debit")
    .reduce((sum, line) => sum + line.amount, 0);
  const creditTotal = roundedLines
    .filter((line) => line.type === "credit")
    .reduce((sum, line) => sum + line.amount, 0);

  if (
    roundedLines.length < 2 ||
    Math.abs(roundMoney(debitTotal) - roundMoney(creditTotal)) > 0.001
  ) {
    throw createHttpError("Employee journal entry is not balanced.", 400);
  }

  const journal = new JournalEntry({
    date: journalDate,
    time: businessTime,
    description,
    createdBy: userId,
    sourceType,
    originModule,
    referenceId,
    invoiceId: referenceId || null,
    invoiceModel: null,
    employeeId: employee._id,
    billNo,
    lines: roundedLines,
  });

  await journal.save(session ? { session } : undefined);
  return journal;
};

const createSalaryJournal = async ({
  userId,
  moduleScope,
  employee,
  payroll,
  date,
  time,
  amount,
  session,
}) => {
  if (roundMoney(amount) <= 0) return null;

  const origins = getOriginsForScope(moduleScope);
  const employeeAccount = await ensureEmployeeAccount({
    userId,
    moduleScope,
    employee,
    session,
  });
  const salaryExpense = await ensureSalaryExpenseAccount({
    userId,
    moduleScope,
    session,
  });

  return createEmployeeJournal({
    userId,
    moduleScope,
    employee,
    date,
    time,
    description: `Salary due for ${employee.name} (${payroll.periodKey})`,
    sourceType: "expense",
    originModule: origins.SALARY,
    referenceId: payroll._id,
    billNo: `PAY-${payroll.periodKey}-${String(employee._id).slice(-4)}`,
    lines: [
      {
        account: salaryExpense._id,
        type: "debit",
        amount,
      },
      {
        account: employeeAccount._id,
        type: "credit",
        amount,
      },
    ],
    session,
  });
};

const createSalaryPaymentJournal = async ({
  userId,
  moduleScope,
  employee,
  payroll,
  paymentAccount,
  date,
  time,
  amount,
  session,
}) => {
  if (roundMoney(amount) <= 0) return null;

  const origins = getOriginsForScope(moduleScope);
  const employeeAccount = await ensureEmployeeAccount({
    userId,
    moduleScope,
    employee,
    session,
  });
  const paymentType = getPaymentTypeFromAccount(paymentAccount);

  return createEmployeeJournal({
    userId,
    moduleScope,
    employee,
    date,
    time,
    description: `Salary payment to ${employee.name} (${payroll.periodKey})`,
    sourceType: "payment",
    originModule: origins.SALARY_PAYMENT,
    referenceId: payroll._id,
    billNo: `SALPAY-${payroll.periodKey}-${String(employee._id).slice(-4)}`,
    lines: [
      {
        account: employeeAccount._id,
        type: "debit",
        amount,
      },
      {
        account: paymentAccount._id,
        type: "credit",
        amount,
        paymentType,
      },
    ],
    session,
  });
};

const createAdvanceLoanJournal = async ({
  userId,
  moduleScope,
  employee,
  advanceLoan,
  paymentAccount,
  date,
  time,
  session,
}) => {
  const origins = getOriginsForScope(moduleScope);
  const employeeAccount = await ensureEmployeeAccount({
    userId,
    moduleScope,
    employee,
    session,
  });
  const paymentType = getPaymentTypeFromAccount(paymentAccount);
  const originModule =
    advanceLoan.kind === "loan" ? origins.LOAN : origins.ADVANCE;

  return createEmployeeJournal({
    userId,
    moduleScope,
    employee,
    date,
    time,
    description:
      advanceLoan.kind === "loan"
        ? `Employee loan paid to ${employee.name}`
        : `Employee advance paid to ${employee.name}`,
    sourceType: "payment",
    originModule,
    referenceId: advanceLoan._id,
    billNo: `${advanceLoan.kind === "loan" ? "LOAN" : "ADV"}-${String(
      advanceLoan._id,
    ).slice(-6)}`,
    lines: [
      {
        account: employeeAccount._id,
        type: "debit",
        amount: advanceLoan.amount,
      },
      {
        account: paymentAccount._id,
        type: "credit",
        amount: advanceLoan.amount,
        paymentType,
      },
    ],
    session,
  });
};

const createRecoveryJournal = async ({
  userId,
  moduleScope,
  employee,
  advanceLoan,
  paymentAccount,
  date,
  time,
  amount,
  session,
}) => {
  const origins = getOriginsForScope(moduleScope);
  const employeeAccount = await ensureEmployeeAccount({
    userId,
    moduleScope,
    employee,
    session,
  });
  const paymentType = getPaymentTypeFromAccount(paymentAccount);
  const originModule =
    advanceLoan.kind === "loan" ? origins.LOAN_RECOVERY : origins.ADVANCE_RECOVERY;

  return createEmployeeJournal({
    userId,
    moduleScope,
    employee,
    date,
    time,
    description:
      advanceLoan.kind === "loan"
        ? `Employee loan recovery from ${employee.name}`
        : `Employee advance recovery from ${employee.name}`,
    sourceType: "payment",
    originModule,
    referenceId: advanceLoan._id,
    billNo: `REC-${String(advanceLoan._id).slice(-6)}`,
    lines: [
      {
        account: paymentAccount._id,
        type: "debit",
        amount,
        paymentType,
      },
      {
        account: employeeAccount._id,
        type: "credit",
        amount,
      },
    ],
    session,
  });
};

const reverseJournals = async ({
  journalIds = [],
  userId,
  date,
  time,
  session,
}) => {
  const validJournalIds = [
    ...new Set(
      journalIds
        .filter(Boolean)
        .map((id) => String(id))
        .filter((id) => isValidObjectId(id)),
    ),
  ];
  const accountIds = [];
  const reversalIds = [];

  for (const journalId of validJournalIds) {
    const journal = await getSessionQuery(
      JournalEntry.findOne({
        _id: journalId,
        createdBy: userId,
        isDeleted: false,
      }),
      session,
    );

    if (!journal) continue;

    accountIds.push(...collectAccountIdsFromJournal(journal));
    const reversal = await createReversalEntry(journal, userId, {
      date: date || new Date(),
      time: time || getCurrentBusinessTimeInput(),
      session,
      employeeId: journal.employeeId || null,
    });

    accountIds.push(...collectAccountIdsFromJournal(reversal));
    reversalIds.push(reversal._id);
  }

  return {
    accountIds: [...new Set(accountIds.map((id) => String(id)))],
    reversalIds,
  };
};

const calculatePayrollTotals = (payload = {}) => {
  const baseSalary = roundMoney(payload.baseSalary);
  const additions = Array.isArray(payload.additions) ? payload.additions : [];
  const deductions = Array.isArray(payload.deductions) ? payload.deductions : [];
  const recoveryApplications = Array.isArray(payload.recoveryApplications)
    ? payload.recoveryApplications
    : [];

  const normalizedAdditions = additions
    .map((entry) => ({
      type: String(entry.type || "other").trim() || "other",
      amount: roundMoney(entry.amount),
      description: String(entry.description || "").trim(),
    }))
    .filter((entry) => entry.amount > 0);

  const normalizedDeductions = deductions
    .map((entry) => ({
      amount: roundMoney(entry.amount),
      description: String(entry.description || "").trim(),
    }))
    .filter((entry) => entry.amount > 0);

  const normalizedRecoveries = recoveryApplications
    .map((entry) => ({
      advanceLoanId: entry.advanceLoanId || entry._id || entry.id || null,
      kind: entry.kind === "loan" ? "loan" : "advance",
      amount: roundMoney(entry.amount),
      description: String(entry.description || "").trim(),
    }))
    .filter((entry) => entry.advanceLoanId && entry.amount > 0);

  const totalAdditions = roundMoney(
    normalizedAdditions.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const totalDeductions = roundMoney(
    normalizedDeductions.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const recoveryAmount = roundMoney(
    normalizedRecoveries.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const grossSalary = roundMoney(baseSalary + totalAdditions);
  const salaryExpenseAmount = roundMoney(grossSalary - totalDeductions);
  const netSalary = roundMoney(salaryExpenseAmount - recoveryAmount);

  if (baseSalary < 0 || salaryExpenseAmount < 0 || netSalary < 0) {
    throw createHttpError("Payroll amounts cannot result in a negative salary.", 400);
  }

  return {
    additions: normalizedAdditions,
    deductions: normalizedDeductions,
    recoveryApplications: normalizedRecoveries,
    baseSalary,
    totalAdditions,
    totalDeductions,
    recoveryAmount,
    grossSalary,
    salaryExpenseAmount,
    netSalary,
  };
};

const applyPayrollRecoveries = async ({
  userId,
  moduleScope,
  employee,
  payroll,
  recoveries = [],
  journalEntryId,
  session,
}) => {
  const normalizedRecoveries = [];

  for (const recovery of recoveries) {
    const advanceLoan = await getSessionQuery(
      EmployeeAdvanceLoan.findOne({
        _id: toObjectId(recovery.advanceLoanId, "advance/loan"),
        userId,
        moduleScope,
        employeeId: employee._id,
        kind: recovery.kind,
        isDeleted: false,
      }),
      session,
    );

    if (!advanceLoan) {
      throw createHttpError("Selected employee advance/loan was not found.", 404);
    }

    if (roundMoney(recovery.amount) > roundMoney(advanceLoan.outstandingAmount)) {
      throw createHttpError("Recovery amount is greater than outstanding amount.", 400);
    }

    advanceLoan.recoveredAmount = roundMoney(
      Number(advanceLoan.recoveredAmount || 0) + recovery.amount,
    );
    advanceLoan.outstandingAmount = roundMoney(
      Number(advanceLoan.outstandingAmount || 0) - recovery.amount,
    );
    advanceLoan.status = advanceLoan.outstandingAmount <= 0 ? "closed" : "active";
    advanceLoan.recoveryHistory.push({
      amount: recovery.amount,
      date: payroll.salaryDate,
      time: payroll.salaryTime || "",
      payrollId: payroll._id,
      journalEntryId,
      description: recovery.description || "Recovered from salary",
    });

    await advanceLoan.save(session ? { session } : undefined);

    normalizedRecoveries.push({
      advanceLoanId: advanceLoan._id,
      kind: advanceLoan.kind,
      amount: recovery.amount,
      description: recovery.description || "Recovered from salary",
    });
  }

  return normalizedRecoveries;
};

const reversePayrollRecoveries = async ({ payroll, session }) => {
  if (!payroll?._id || !Array.isArray(payroll.recoveryApplications)) {
    return;
  }

  for (const recovery of payroll.recoveryApplications) {
    if (!recovery.advanceLoanId || roundMoney(recovery.amount) <= 0) continue;

    const advanceLoan = await getSessionQuery(
      EmployeeAdvanceLoan.findOne({
        _id: recovery.advanceLoanId,
        userId: payroll.userId,
        moduleScope: payroll.moduleScope,
        employeeId: payroll.employeeId,
      }),
      session,
    );

    if (!advanceLoan) continue;

    advanceLoan.recoveredAmount = roundMoney(
      Number(advanceLoan.recoveredAmount || 0) - recovery.amount,
    );
    advanceLoan.outstandingAmount = roundMoney(
      Number(advanceLoan.outstandingAmount || 0) + recovery.amount,
    );
    advanceLoan.status =
      advanceLoan.isDeleted || advanceLoan.status === "void"
        ? advanceLoan.status
        : advanceLoan.outstandingAmount <= 0
          ? "closed"
          : "active";
    advanceLoan.recoveryHistory = (advanceLoan.recoveryHistory || []).filter(
      (entry) => String(entry.payrollId || "") !== String(payroll._id),
    );

    await advanceLoan.save(session ? { session } : undefined);
  }
};

const buildEmployeeBalanceMap = async ({ userId, moduleScope, employees }) => {
  const employeeAccountIds = employees
    .map((employee) => employee.account)
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(id));

  if (employeeAccountIds.length === 0) return new Map();

  const summary = await JournalEntry.aggregate([
    {
      $match: {
        createdBy: new mongoose.Types.ObjectId(userId),
        isDeleted: false,
        employeeId: { $in: employees.map((employee) => employee._id) },
        originModule: { $in: getOriginValuesForScope(moduleScope) },
        "lines.account": { $in: employeeAccountIds },
      },
    },
    { $unwind: "$lines" },
    {
      $match: {
        "lines.account": { $in: employeeAccountIds },
      },
    },
    {
      $group: {
        _id: "$employeeId",
        totalDebit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "debit"] }, "$lines.amount", 0],
          },
        },
        totalCredit: {
          $sum: {
            $cond: [{ $eq: ["$lines.type", "credit"] }, "$lines.amount", 0],
          },
        },
      },
    },
  ]);

  return new Map(
    summary.map((entry) => [
      String(entry._id),
      {
        totalDebit: roundMoney(entry.totalDebit),
        totalCredit: roundMoney(entry.totalCredit),
        balance: roundMoney(entry.totalCredit - entry.totalDebit),
      },
    ]),
  );
};

const appendEmployeeBalances = async ({ userId, moduleScope, employees }) => {
  const docs = employees.map((employee) =>
    typeof employee.toObject === "function" ? employee.toObject() : employee,
  );
  const balanceMap = await buildEmployeeBalanceMap({
    userId,
    moduleScope,
    employees,
  });

  return docs.map((employee) => {
    const summary = balanceMap.get(String(employee._id)) || {
      totalDebit: 0,
      totalCredit: 0,
      balance: 0,
    };
    const netBalance = roundMoney(summary.balance);

    return {
      ...employee,
      totalDebit: summary.totalDebit,
      totalCredit: summary.totalCredit,
      balance: netBalance,
      payableBalance: netBalance > 0 ? netBalance : 0,
      recoverableBalance: netBalance < 0 ? Math.abs(netBalance) : 0,
    };
  });
};

const getEmployeeFinancialSummary = async ({ userId, moduleScope }) => {
  const employees = await Employee.find({
    userId,
    moduleScope,
    isDeleted: false,
  }).select("_id account name status");

  const balanceMap = await buildEmployeeBalanceMap({
    userId,
    moduleScope,
    employees,
  });

  let totalPayable = 0;
  let totalRecoverable = 0;

  employees.forEach((employee) => {
    const balance = roundMoney(balanceMap.get(String(employee._id))?.balance || 0);
    if (balance > 0) totalPayable += balance;
    if (balance < 0) totalRecoverable += Math.abs(balance);
  });

  const advanceLoanSummary = await EmployeeAdvanceLoan.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        moduleScope,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: "$kind",
        outstanding: { $sum: "$outstandingAmount" },
      },
    },
  ]);

  const outstandingByKind = advanceLoanSummary.reduce(
    (acc, item) => ({
      ...acc,
      [item._id]: roundMoney(item.outstanding),
    }),
    {},
  );

  return {
    employeeCount: employees.length,
    totalPayable: roundMoney(totalPayable),
    totalRecoverable: roundMoney(totalRecoverable),
    netPosition: roundMoney(totalPayable - totalRecoverable),
    advanceOutstanding: roundMoney(outstandingByKind.advance || 0),
    loanOutstanding: roundMoney(outstandingByKind.loan || 0),
  };
};

const getEmployeeLedger = async ({
  userId,
  moduleScope,
  employeeId,
  startDate,
  endDate,
}) => {
  const employee = await validateEmployee({
    userId,
    employeeId,
    moduleScope,
  });

  const query = {
    createdBy: userId,
    employeeId: employee._id,
    isDeleted: false,
    originModule: { $in: getOriginValuesForScope(moduleScope) },
    ...buildBusinessDateRange({ startDate, endDate, field: "date" }),
  };

  const journals = await JournalEntry.find(query)
    .sort({ date: 1, time: 1, createdAt: 1 })
    .lean();

  const rows = [];
  let runningBalance = 0;
  let totalDebit = 0;
  let totalCredit = 0;
  const employeeAccountId = String(employee.account || "");

  journals.forEach((journal) => {
    const employeeLines = (journal.lines || []).filter(
      (line) => String(line.account) === employeeAccountId,
    );

    employeeLines.forEach((line) => {
      const debit = line.type === "debit" ? roundMoney(line.amount) : 0;
      const credit = line.type === "credit" ? roundMoney(line.amount) : 0;
      totalDebit += debit;
      totalCredit += credit;
      runningBalance = roundMoney(runningBalance + credit - debit);

      rows.push({
        _id: journal._id,
        date: journal.date,
        formattedDate: formatBusinessDate(journal.date),
        time: journal.time || "",
        description: journal.description || "",
        originModule: journal.originModule || "",
        sourceType: journal.sourceType || "",
        billNo: journal.billNo || "",
        debit,
        credit,
        balance: runningBalance,
        position: runningBalance >= 0 ? "payable" : "recoverable",
      });
    });
  });

  return {
    employee: employee.toObject(),
    rows,
    totals: {
      debit: roundMoney(totalDebit),
      credit: roundMoney(totalCredit),
      closingBalance: roundMoney(runningBalance),
      payableBalance: runningBalance > 0 ? roundMoney(runningBalance) : 0,
      recoverableBalance: runningBalance < 0 ? roundMoney(Math.abs(runningBalance)) : 0,
    },
  };
};

const recalculateTouchedAccounts = async (accountIds = []) => {
  const uniqueAccountIds = [
    ...new Set(accountIds.filter(Boolean).map((id) => String(id))),
  ];

  if (uniqueAccountIds.length > 0) {
    await recalculateAccountBalances(uniqueAccountIds);
  }

  return uniqueAccountIds;
};

module.exports = {
  EMPLOYEE_ACCOUNT_CATEGORY,
  PAYMENT_ACCOUNT_CATEGORIES,
  appendEmployeeBalances,
  applyPayrollRecoveries,
  calculatePayrollTotals,
  collectAccountIdsFromJournal,
  createAdvanceLoanJournal,
  createEmployeeJournal,
  createHttpError,
  createRecoveryJournal,
  createSalaryJournal,
  createSalaryPaymentJournal,
  ensureEmployeeAccount,
  ensureSalaryExpenseAccount,
  getEmployeeFinancialSummary,
  getEmployeeLedger,
  getModuleScopeFromRequest,
  getOriginsForScope,
  getOriginValuesForScope,
  getPaymentTypeFromAccount,
  getSessionQuery,
  normalizeEmployeeModuleScope,
  parseEntryDateTime,
  recalculateTouchedAccounts,
  reverseJournals,
  reversePayrollRecoveries,
  roundMoney,
  syncEmployeeAccountName,
  validateEmployee,
  validatePaymentAccount,
};
