const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Employee = require("../../models/Employee");
const EmployeeAdvanceLoan = require("../../models/EmployeeAdvanceLoan");
const EmployeePayroll = require("../../models/EmployeePayroll");
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

const getDateKeyFromValue = (value) => {
  if (!value) return "";

  try {
    return getBusinessDateKey(value, { allowEmpty: true });
  } catch (error) {
    return "";
  }
};

const normalizeEmployeeModuleScope = (
  value,
  fallback = MODULE_SCOPES.TRADING,
) => {
  const scope = normalizeModuleScope(value, fallback);

  if (scope === MODULE_SCOPES.TRAVEL) return MODULE_SCOPES.TRAVEL;
  if (scope === MODULE_SCOPES.WEAVING) return MODULE_SCOPES.WEAVING;

  return MODULE_SCOPES.TRADING;
};

const getModuleScopeFromRequest = (req) => {
  const fromTravelRoute = String(req.originalUrl || "").startsWith(
    "/api/travel/",
  );
  const fromWeavingRoute = String(req.originalUrl || "").startsWith(
    "/api/weaving/",
  );

  return normalizeEmployeeModuleScope(
    req.body?.moduleScope || req.query?.moduleScope,
    fromWeavingRoute
      ? MODULE_SCOPES.WEAVING
      : fromTravelRoute
        ? MODULE_SCOPES.TRAVEL
        : MODULE_SCOPES.TRADING,
  );
};

const getOriginsForScope = (moduleScope) =>
  getEmployeeOriginsForScope(normalizeEmployeeModuleScope(moduleScope));

const getOriginValuesForScope = (moduleScope) =>
  getEmployeeOriginValuesForScope(normalizeEmployeeModuleScope(moduleScope));

const getSalaryExpenseAccountConfig = (moduleScope) =>
  moduleScope === MODULE_SCOPES.WEAVING
    ? {
        code: "WEAVING_SALARY_EXP",
        name: "Weaving Salary Expense",
        moduleScope: MODULE_SCOPES.WEAVING,
      }
    : moduleScope === MODULE_SCOPES.TRAVEL
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
  const prefix =
    moduleScope === MODULE_SCOPES.WEAVING
      ? "WEAVING_EMP"
      : moduleScope === MODULE_SCOPES.TRAVEL
        ? "TRAVEL_EMP"
        : "EMP";

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
      status: "active",
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
    moduleScope: normalizeEmployeeModuleScope(moduleScope),
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
  description = "",
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
    description:
      description || `Salary payment to ${employee.name} (${payroll.periodKey})`,
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

const getPayrollPaymentJournals = async ({ userId, payroll, session }) => {
  const ids = (payroll?.paymentJournalEntryIds || []).filter(Boolean);
  if (ids.length === 0) return [];

  const journals = await getSessionQuery(
    JournalEntry.find({
      _id: { $in: ids },
      createdBy: userId,
      employeeId: payroll.employeeId,
    }),
    session,
  );
  const byId = new Map(journals.map((journal) => [String(journal._id), journal]));

  return ids.map((id) => byId.get(String(id))).filter(Boolean);
};

const getSalaryPaymentAmount = (journal) =>
  roundMoney(
    (journal?.lines || [])
      .filter((line) => line.type === "credit")
      .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );

const getActivePayrollPaymentState = async ({ userId, payroll, session }) => {
  const journals = (await getPayrollPaymentJournals({ userId, payroll, session })).filter(
    (journal) =>
      journal.isDeleted !== true &&
      journal.isReversed !== true &&
      journal.isReversal !== true,
  );

  return {
    journals,
    paidAmount: roundMoney(
      journals.reduce((sum, journal) => sum + getSalaryPaymentAmount(journal), 0),
    ),
  };
};

const recreatePayrollPaymentJournals = async ({
  userId,
  moduleScope,
  employee,
  payroll,
  actorId,
  session,
}) => {
  const originalJournals = await getPayrollPaymentJournals({
    userId,
    payroll,
    session,
  });
  const historyByJournalId = new Map(
    (payroll.paymentHistory || [])
      .filter((entry) => entry.journalEntryId)
      .map((entry) => [String(entry.journalEntryId), entry]),
  );
  const paymentJournalEntryIds = [];
  const paymentHistory = [];
  const accountIds = [];
  let paidAmount = 0;
  let lastPaymentAccount = null;

  for (const original of originalJournals) {
    const paymentLine = (original.lines || []).find((line) => line.type === "credit");
    const amount = getSalaryPaymentAmount(original);
    if (!paymentLine?.account || amount <= 0) continue;

    const paymentAccount = await validatePaymentAccount({
      userId,
      moduleScope,
      paymentAccountId: paymentLine.account,
      session,
    });
    const oldHistory = historyByJournalId.get(String(original._id));
    const journal = await createSalaryPaymentJournal({
      userId,
      moduleScope,
      employee,
      payroll,
      paymentAccount,
      date: oldHistory?.paymentDate || original.date,
      time: oldHistory?.paymentTime || original.time,
      amount,
      description: original.description,
      session,
    });

    paymentJournalEntryIds.push(journal._id);
    accountIds.push(...collectAccountIdsFromJournal(journal));
    paidAmount = roundMoney(paidAmount + amount);
    lastPaymentAccount = paymentAccount;
    paymentHistory.push({
      amount,
      paymentAccountId: paymentAccount._id,
      paymentType: getPaymentTypeFromAccount(paymentAccount),
      paymentDate: oldHistory?.paymentDate || original.date,
      paymentTime: oldHistory?.paymentTime || original.time || "",
      receivedBy: oldHistory?.receivedBy || "self",
      receiverName: oldHistory?.receiverName || "",
      receiverPhone: oldHistory?.receiverPhone || "",
      note: oldHistory?.note || "",
      journalEntryId: journal._id,
      paidAt: oldHistory?.paidAt || original.createdAt || new Date(),
      paidBy: oldHistory?.paidBy || actorId || userId,
    });
  }

  return {
    accountIds,
    paidAmount,
    paymentHistory,
    paymentJournalEntryIds,
    paymentAccountId: lastPaymentAccount?._id || null,
    paymentType: lastPaymentAccount
      ? getPaymentTypeFromAccount(lastPaymentAccount)
      : "",
  };
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
    if (!recovery.advanceLoanId) continue;

    const amount = roundMoney(recovery.amount);
    const scheduledAmount = roundMoney(recovery.scheduledAmount);
    const normalizedRecovery = {
      advanceLoanId: recovery.advanceLoanId,
      kind: recovery.kind === "loan" ? "loan" : "advance",
      amount,
      scheduledAmount,
      cycleKey: recovery.cycleKey || payroll.cycleKey || payroll.periodKey || "",
      frequency: recovery.frequency || "",
      isSkipped: recovery.isSkipped === true || amount <= 0,
      isManualOverride: recovery.isManualOverride === true || recovery.isSkipped === true,
      description: recovery.description || "Recovered from salary",
    };

    if (amount <= 0) {
      normalizedRecoveries.push(normalizedRecovery);
      continue;
    }

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

    const alreadyApplied = (advanceLoan.recoveryHistory || []).some(
      (entry) => String(entry.payrollId || "") === String(payroll._id),
    );

    if (alreadyApplied) {
      normalizedRecoveries.push({
        ...normalizedRecovery,
        advanceLoanId: advanceLoan._id,
        kind: advanceLoan.kind,
      });
      continue;
    }

    if (amount > roundMoney(advanceLoan.outstandingAmount)) {
      throw createHttpError("Recovery amount is greater than outstanding amount.", 400);
    }

    advanceLoan.recoveredAmount = roundMoney(
      Number(advanceLoan.recoveredAmount || 0) + amount,
    );
    advanceLoan.outstandingAmount = roundMoney(
      Number(advanceLoan.outstandingAmount || 0) - amount,
    );
    advanceLoan.status = advanceLoan.outstandingAmount <= 0 ? "closed" : "active";
    advanceLoan.recoveryHistory.push({
      amount,
      scheduledAmount,
      date: payroll.salaryDate,
      time: payroll.salaryTime || "",
      payrollId: payroll._id,
      journalEntryId,
      cycleKey: normalizedRecovery.cycleKey,
      frequency: normalizedRecovery.frequency,
      isSkipped: false,
      isManualOverride: normalizedRecovery.isManualOverride,
      description: normalizedRecovery.description,
    });

    await advanceLoan.save(session ? { session } : undefined);

    normalizedRecoveries.push({
      advanceLoanId: advanceLoan._id,
      kind: advanceLoan.kind,
      amount,
      scheduledAmount,
      cycleKey: normalizedRecovery.cycleKey,
      frequency: normalizedRecovery.frequency,
      isSkipped: false,
      isManualOverride: normalizedRecovery.isManualOverride,
      description: normalizedRecovery.description,
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

    const amount = roundMoney(recovery.amount);
    advanceLoan.recoveredAmount = roundMoney(
      Math.max(0, Number(advanceLoan.recoveredAmount || 0) - amount),
    );
    advanceLoan.outstandingAmount = roundMoney(
      Number(advanceLoan.outstandingAmount || 0) + amount,
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

const normalizeMasterLedgerStatusFilter = (value = "active") => {
  const status = String(value || "active").trim().toLowerCase();

  return ["inactive", "hidden"].includes(status) ? "inactive" : "active";
};

const normalizeMasterLedgerPositionFilter = (value = "all") => {
  const position = String(value || "all").trim().toLowerCase();

  return ["all", "payable", "recoverable", "settled"].includes(position)
    ? position
    : "all";
};

const getEmployeeUnitLabel = (employee = {}) => {
  if (employee.unitName) return employee.unitName;
  if (employee.unitNo) return `Unit ${employee.unitNo}`;

  return "";
};

const buildEmployeeLedgerSummaryRow = ({
  employee,
  balanceSummary = {},
  financeSummary = {},
}) => {
  const balance = roundMoney(balanceSummary.balance || 0);
  const payable = balance > 0 ? balance : 0;
  const recoverable = balance < 0 ? roundMoney(Math.abs(balance)) : 0;
  const netPosition = payable || recoverable;
  const positionType = payable > 0
    ? "payable"
    : recoverable > 0
      ? "recoverable"
      : "settled";

  return {
    employeeId: employee._id,
    employeeNo: employee.employeeNo || "",
    name: employee.name || "",
    phone: employee.phone || "",
    designation: employee.designationName || "",
    unit: getEmployeeUnitLabel(employee),
    unitNo: Number(employee.unitNo || 0),
    department: employee.departmentName || "",
    status: employee.status || "active",
    isDeleted: Boolean(employee.isDeleted),
    payable: roundMoney(payable),
    recoverable: roundMoney(recoverable),
    loanOutstanding: roundMoney(financeSummary.loanOutstanding || 0),
    kharchaOutstanding: roundMoney(financeSummary.kharchaOutstanding || 0),
    netPosition: roundMoney(netPosition),
    accountBalance: balance,
    positionType,
  };
};

const summarizeEmployeeLedgerRows = (rows = []) =>
  rows.reduce(
    (summary, row) => ({
      totalEmployees: summary.totalEmployees + 1,
      totalPayable: roundMoney(summary.totalPayable + Number(row.payable || 0)),
      totalRecoverable: roundMoney(
        summary.totalRecoverable + Number(row.recoverable || 0),
      ),
      totalLoan: roundMoney(
        summary.totalLoan + Number(row.loanOutstanding || 0),
      ),
      totalKharcha: roundMoney(
        summary.totalKharcha + Number(row.kharchaOutstanding || 0),
      ),
      netPosition: roundMoney(
        summary.totalPayable +
          Number(row.payable || 0) -
          (summary.totalRecoverable + Number(row.recoverable || 0)),
      ),
    }),
    {
      totalEmployees: 0,
      totalPayable: 0,
      totalRecoverable: 0,
      totalLoan: 0,
      totalKharcha: 0,
      netPosition: 0,
    },
  );

const getEmployeeLedgersSummary = async ({
  userId,
  moduleScope,
  search = "",
  status = "active",
  position = "all",
}) => {
  const normalizedScope = normalizeEmployeeModuleScope(moduleScope);

  if (normalizedScope !== MODULE_SCOPES.WEAVING) {
    throw createHttpError(
      "Employee ledger summary is only available for Weaving.",
      404,
    );
  }

  const statusFilter = normalizeMasterLedgerStatusFilter(status);
  const positionFilter = normalizeMasterLedgerPositionFilter(position);
  const query = {
    userId,
    moduleScope: MODULE_SCOPES.WEAVING,
    $and: [],
  };

  if (statusFilter === "active") {
    query.$and.push({ isDeleted: { $ne: true }, status: "active" });
  } else {
    query.$and.push({
      $or: [
        { isDeleted: true },
        { isDeleted: { $ne: true }, status: "inactive" },
      ],
    });
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const safeSearch = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$and.push({
      $or: [
        { name: { $regex: safeSearch, $options: "i" } },
        { employeeNo: { $regex: safeSearch, $options: "i" } },
        { phone: { $regex: safeSearch, $options: "i" } },
        { designationName: { $regex: safeSearch, $options: "i" } },
        { unitName: { $regex: safeSearch, $options: "i" } },
        { departmentName: { $regex: safeSearch, $options: "i" } },
      ],
    });
  }

  const employees = await Employee.find(query)
    .select(
      "_id account employeeNo name phone designationName unitNo unitName departmentName status isDeleted listOrder",
    )
    .lean();
  const employeeIds = employees.map((employee) => employee._id);
  const [balanceMap, financeSummary] = await Promise.all([
    buildEmployeeBalanceMap({
      userId,
      moduleScope: MODULE_SCOPES.WEAVING,
      employees,
    }),
    employeeIds.length
      ? EmployeeAdvanceLoan.aggregate([
          {
            $match: {
              userId: new mongoose.Types.ObjectId(userId),
              moduleScope: MODULE_SCOPES.WEAVING,
              employeeId: { $in: employeeIds },
              isDeleted: false,
              status: "active",
              outstandingAmount: { $gt: 0 },
            },
          },
          {
            $group: {
              _id: {
                employeeId: "$employeeId",
                kind: "$kind",
              },
              outstanding: { $sum: "$outstandingAmount" },
            },
          },
        ])
      : [],
  ]);
  const financeMap = new Map();

  financeSummary.forEach((item) => {
    const employeeId = String(item._id.employeeId);
    const current = financeMap.get(employeeId) || {
      loanOutstanding: 0,
      kharchaOutstanding: 0,
    };

    if (item._id.kind === "loan") {
      current.loanOutstanding = roundMoney(item.outstanding);
    } else if (item._id.kind === "advance") {
      current.kharchaOutstanding = roundMoney(item.outstanding);
    }

    financeMap.set(employeeId, current);
  });

  const rows = employees
    .map((employee) =>
      buildEmployeeLedgerSummaryRow({
        employee,
        balanceSummary: balanceMap.get(String(employee._id)),
        financeSummary: financeMap.get(String(employee._id)),
      }),
    )
    .filter((row) =>
      positionFilter === "all" ? true : row.positionType === positionFilter,
    )
    .sort((left, right) => {
      const leftHasBalance =
        left.payable > 0 ||
        left.recoverable > 0 ||
        left.loanOutstanding > 0 ||
        left.kharchaOutstanding > 0;
      const rightHasBalance =
        right.payable > 0 ||
        right.recoverable > 0 ||
        right.loanOutstanding > 0 ||
        right.kharchaOutstanding > 0;

      if (leftHasBalance !== rightHasBalance) {
        return leftHasBalance ? -1 : 1;
      }

      if (left.isDeleted !== right.isDeleted) {
        return left.isDeleted ? 1 : -1;
      }

      if (left.unitNo !== right.unitNo) {
        return left.unitNo - right.unitNo;
      }

      return String(left.name || "").localeCompare(String(right.name || ""));
    });

  return {
    summary: summarizeEmployeeLedgerRows(rows),
    employees: rows,
    filters: {
      search: trimmedSearch,
      status: statusFilter,
      position: positionFilter,
    },
  };
};

const getEmployeeTransactionType = (journal, moduleScope) => {
  const origins = getOriginsForScope(moduleScope);
  const origin = journal.originModule || "";

  if (journal.isReversal || journal.sourceType === "reversal") return "reversal";
  if (origin === origins.SALARY) return "salary_due";
  if (origin === origins.SALARY_PAYMENT) return "salary_paid";
  if (origin === origins.LOAN) return "loan_given";
  if (origin === origins.ADVANCE) return "advance_given";
  if (origin === origins.LOAN_RECOVERY) return "loan_recovery";
  if (origin === origins.ADVANCE_RECOVERY) return "advance_recovery";
  if (origin === origins.ADJUSTMENT) return "adjustment";

  return journal.sourceType || "manual";
};

const getWeavingLedgerRecoveryRows = async ({
  userId,
  employee,
  startDate,
  endDate,
}) => {
  const payrolls = await EmployeePayroll.find({
    userId,
    moduleScope: MODULE_SCOPES.WEAVING,
    employeeId: employee._id,
    isDeleted: false,
    status: { $in: ["posted", "finalized", "partially_paid", "paid"] },
    ...buildBusinessDateRange({ startDate, endDate, field: "salaryDate" }),
  })
    .select("periodKey cycleKey salaryDate salaryTime recoveryApplications journalEntryId")
    .lean();

  return payrolls.flatMap((payroll) =>
    (payroll.recoveryApplications || [])
      .filter((recovery) => roundMoney(recovery.amount) > 0)
      .map((recovery) => ({
        _id: `${payroll._id}:${recovery.advanceLoanId}`,
        date: payroll.salaryDate,
        formattedDate: formatBusinessDate(payroll.salaryDate),
        time: payroll.salaryTime || "",
        description: recovery.description || "Recovered from salary",
        originModule:
          recovery.kind === "loan"
            ? getOriginsForScope(MODULE_SCOPES.WEAVING).LOAN_RECOVERY
            : getOriginsForScope(MODULE_SCOPES.WEAVING).ADVANCE_RECOVERY,
        sourceType: "salary_recovery",
        transactionType:
          recovery.kind === "loan" ? "loan_recovery" : "advance_recovery",
        billNo: payroll.periodKey || payroll.cycleKey || "",
        debit: 0,
        credit: 0,
        amount: roundMoney(recovery.amount),
        scheduledAmount: roundMoney(recovery.scheduledAmount),
        balance: 0,
        position: "",
        informational: true,
        referenceId: recovery.advanceLoanId || null,
        referenceModel: "EmployeeAdvanceLoan",
        payrollId: payroll._id,
        cycleKey: recovery.cycleKey || payroll.cycleKey || payroll.periodKey || "",
      })),
  );
};

const getWeavingLedgerSummary = async ({
  userId,
  employee,
  startDate,
  endDate,
  payableBalance,
  recoverableBalance,
}) => {
  const payrolls = await EmployeePayroll.find({
    userId,
    moduleScope: MODULE_SCOPES.WEAVING,
    employeeId: employee._id,
    isDeleted: false,
    status: { $ne: "void" },
    ...buildBusinessDateRange({ startDate, endDate, field: "salaryDate" }),
  })
    .select(
      "totalAdditions totalDeductions recoveryAmount netSalary paidAmount remainingDue",
    )
    .lean();
  const financeEntries = await EmployeeAdvanceLoan.find({
    userId,
    moduleScope: MODULE_SCOPES.WEAVING,
    employeeId: employee._id,
    isDeleted: false,
    status: { $ne: "void" },
  })
    .select("kind amount recoveredAmount outstandingAmount")
    .lean();
  const summary = payrolls.reduce(
    (totals, payroll) => {
      const recoveryAmount = roundMoney(payroll.recoveryAmount);

      totals.salaryEarned = roundMoney(
        totals.salaryEarned + Number(payroll.netSalary || 0) + recoveryAmount,
      );
      totals.salaryExtras = roundMoney(
        totals.salaryExtras + Number(payroll.totalAdditions || 0),
      );
      totals.salaryDeductions = roundMoney(
        totals.salaryDeductions +
          Math.max(0, Number(payroll.totalDeductions || 0) - recoveryAmount),
      );
      totals.salaryPaid = roundMoney(totals.salaryPaid + Number(payroll.paidAmount || 0));
      totals.salaryBalance = roundMoney(
        totals.salaryBalance + Number(payroll.remainingDue || 0),
      );

      return totals;
    },
    {
      salaryEarned: 0,
      salaryExtras: 0,
      salaryDeductions: 0,
      salaryPaid: 0,
      salaryBalance: 0,
    },
  );

  financeEntries.forEach((entry) => {
    const prefix = entry.kind === "loan" ? "loan" : "advance";
    summary[`${prefix}Given`] = roundMoney(
      Number(summary[`${prefix}Given`] || 0) + Number(entry.amount || 0),
    );
    summary[`${prefix}Recovered`] = roundMoney(
      Number(summary[`${prefix}Recovered`] || 0) + Number(entry.recoveredAmount || 0),
    );
    summary[`${prefix}Remaining`] = roundMoney(
      Number(summary[`${prefix}Remaining`] || 0) + Number(entry.outstandingAmount || 0),
    );
  });

  return {
    ...summary,
    loanGiven: roundMoney(summary.loanGiven || 0),
    loanRecovered: roundMoney(summary.loanRecovered || 0),
    loanRemaining: roundMoney(summary.loanRemaining || 0),
    advanceGiven: roundMoney(summary.advanceGiven || 0),
    advanceRecovered: roundMoney(summary.advanceRecovered || 0),
    advanceRemaining: roundMoney(summary.advanceRemaining || 0),
    openingBalance: roundMoney(employee.openingBalance?.amount || 0),
    openingBalanceType: employee.openingBalance?.type || "",
    companyPayable: roundMoney(payableBalance),
    employeeReceivable: roundMoney(recoverableBalance),
  };
};

const getEmployeeLedger = async ({
  userId,
  moduleScope,
  employeeId,
  startDate,
  endDate,
}) => {
  const employee = await Employee.findOne({
    _id: toObjectId(employeeId, "employee"),
    userId,
    moduleScope,
  });

  if (!employee) {
    throw createHttpError("Employee not found", 404);
  }

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
        transactionType: getEmployeeTransactionType(journal, moduleScope),
        billNo: journal.billNo || "",
        referenceId: journal.referenceId || journal.invoiceId || null,
        referenceModel: journal.originModule === getOriginsForScope(moduleScope).LOAN ||
          journal.originModule === getOriginsForScope(moduleScope).ADVANCE
          ? "EmployeeAdvanceLoan"
          : journal.originModule === getOriginsForScope(moduleScope).SALARY ||
            journal.originModule === getOriginsForScope(moduleScope).SALARY_PAYMENT
            ? "EmployeePayroll"
            : "",
        debit,
        credit,
        balance: runningBalance,
        position: runningBalance >= 0 ? "payable" : "recoverable",
        informational: false,
      });
    });
  });

  if (moduleScope === MODULE_SCOPES.WEAVING) {
    const recoveryRows = await getWeavingLedgerRecoveryRows({
      userId,
      employee,
      startDate,
      endDate,
    });
    rows.push(...recoveryRows);
    rows.sort((left, right) => {
      const dateCompare =
        getDateKeyFromValue(left.date).localeCompare(getDateKeyFromValue(right.date));
      if (dateCompare !== 0) return dateCompare;

      const timeCompare = String(left.time || "").localeCompare(String(right.time || ""));
      if (timeCompare !== 0) return timeCompare;

      return left.informational === right.informational
        ? 0
        : left.informational
          ? 1
          : -1;
    });
    runningBalance = 0;
    totalDebit = 0;
    totalCredit = 0;
    rows.forEach((row) => {
      if (!row.informational) {
        totalDebit = roundMoney(totalDebit + Number(row.debit || 0));
        totalCredit = roundMoney(totalCredit + Number(row.credit || 0));
        runningBalance = roundMoney(runningBalance + Number(row.credit || 0) - Number(row.debit || 0));
      }
      row.balance = runningBalance;
      row.position = runningBalance >= 0 ? "payable" : "recoverable";
    });
  }

  const payableBalance = runningBalance > 0 ? roundMoney(runningBalance) : 0;
  const recoverableBalance =
    runningBalance < 0 ? roundMoney(Math.abs(runningBalance)) : 0;
  const weavingSummary =
    moduleScope === MODULE_SCOPES.WEAVING
      ? await getWeavingLedgerSummary({
          userId,
          employee,
          startDate,
          endDate,
          payableBalance,
          recoverableBalance,
        })
      : null;

  return {
    employee: employee.toObject(),
    rows,
    totals: {
      debit: roundMoney(totalDebit),
      credit: roundMoney(totalCredit),
      closingBalance: roundMoney(runningBalance),
      payableBalance,
      recoverableBalance,
      ...(weavingSummary ? { weaving: weavingSummary } : {}),
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
  getEmployeeLedgersSummary,
  getEmployeeLedger,
  getModuleScopeFromRequest,
  getOriginsForScope,
  getOriginValuesForScope,
  getPaymentTypeFromAccount,
  getActivePayrollPaymentState,
  recreatePayrollPaymentJournals,
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
  _test: {
    buildEmployeeLedgerSummaryRow,
    summarizeEmployeeLedgerRows,
  },
};
