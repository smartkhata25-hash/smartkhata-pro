const mongoose = require("mongoose");

const Employee = require("../../models/Employee");
const EmployeeAdvanceLoan = require("../../models/EmployeeAdvanceLoan");
const EmployeePayroll = require("../../models/EmployeePayroll");
const WeavingAttendance = require("../../models/WeavingAttendance");
const WeavingKnottingJob = require("../../models/WeavingKnottingJob");
const {
  applyPayrollRecoveries,
  createHttpError,
  createSalaryJournal,
  createSalaryPaymentJournal,
  collectAccountIdsFromJournal,
  getPaymentTypeFromAccount,
  getActivePayrollPaymentState,
  getSessionQuery,
  parseEntryDateTime,
  recalculateTouchedAccounts,
  recreatePayrollPaymentJournals,
  reverseJournals,
  reversePayrollRecoveries,
  roundMoney,
  validatePaymentAccount,
} = require("../employee/employeeAccountingService");
const {
  getBusinessDateKey,
  getCurrentBusinessDateKey,
  parseBusinessDate,
} = require("../../utils/businessDate");

const WEAVING_SCOPE = "weaving";
const OT_MULTIPLIER = 1;
const CYCLE_KEY_PATTERN = /^(\d{4})-(\d{2})-H([12])$/i;
const SEGMENT_STORAGE_KEY_PATTERN = /^(\d{4}-\d{2}-H[12])(?:-S(\d+))?$/i;
const WEEKDAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const pad2 = (value) => String(value).padStart(2, "0");

const normalizeText = (value = "") => String(value || "").trim();

const idOf = (value) => String(value?._id || value || "");

const getPayrollBaseCycleKey = (payrollOrKey = "") => {
  const source =
    payrollOrKey && typeof payrollOrKey === "object"
      ? payrollOrKey.baseCycleKey || payrollOrKey.cycleKey || payrollOrKey.periodKey
      : payrollOrKey;
  const match = normalizeText(source).match(SEGMENT_STORAGE_KEY_PATTERN);

  return match ? match[1].toUpperCase() : normalizeText(source).toUpperCase();
};

const getPayrollSegmentNo = (payrollOrKey = "") => {
  if (payrollOrKey && typeof payrollOrKey === "object") {
    const explicit = Number.parseInt(payrollOrKey.segmentNo, 10);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
  }

  const source =
    payrollOrKey && typeof payrollOrKey === "object"
      ? payrollOrKey.cycleKey || payrollOrKey.periodKey
      : payrollOrKey;
  const match = normalizeText(source).match(SEGMENT_STORAGE_KEY_PATTERN);
  const parsed = Number.parseInt(match?.[2] || "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
};

const buildSegmentStorageKey = (baseCycleKey, segmentNo = 1) => {
  const normalizedBase = getPayrollBaseCycleKey(baseCycleKey);
  const normalizedSegment = Number.parseInt(segmentNo, 10) || 1;

  return normalizedSegment <= 1
    ? normalizedBase
    : `${normalizedBase}-S${normalizedSegment}`;
};

const hasExplicitSegmentStorageKey = (value = "") => {
  const match = normalizeText(value).match(SEGMENT_STORAGE_KEY_PATTERN);

  return Boolean(match?.[2]);
};

const toObjectId = (value, label = "id") => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw createHttpError(`Invalid ${label}`, 400);
  }

  return new mongoose.Types.ObjectId(String(value));
};

const withTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }

  return result;
};

const dateKeyToParts = (dateKey) => {
  const [year, month, day] = String(dateKey || "").split("-").map(Number);
  return { year, month, day };
};

const buildDateKey = (year, month, day) => `${year}-${pad2(month)}-${pad2(day)}`;

const getMonthLastDay = (year, month) => new Date(Date.UTC(year, month, 0, 12)).getUTCDate();

const getNextMonth = (year, month) =>
  month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };

const dateKeyToNoonMs = (dateKey) => {
  const { year, month, day } = dateKeyToParts(dateKey);
  return Date.UTC(year, month - 1, day, 12);
};

const addDaysToDateKey = (dateKey, days = 0) => {
  const date = new Date(dateKeyToNoonMs(dateKey) + Number(days || 0) * 86400000);
  return buildDateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const listDateKeys = (startKey, endKey) => {
  const dates = [];
  let cursor = startKey;

  while (cursor <= endKey) {
    dates.push(cursor);
    cursor = addDaysToDateKey(cursor, 1);
  }

  return dates;
};

const getWeekdayKey = (dateKey) => {
  const date = new Date(dateKeyToNoonMs(dateKey));
  return WEEKDAY_KEYS[date.getUTCDay()];
};

const getDateKeyFromValue = (value) => {
  if (!value) return "";

  try {
    return getBusinessDateKey(value, { allowEmpty: true });
  } catch (error) {
    return "";
  }
};

const getCurrentCycleKey = (dateValue = new Date()) => {
  const todayKey = getBusinessDateKey(dateValue);
  const { year, month, day } = dateKeyToParts(todayKey);

  return `${year}-${pad2(month)}-${day <= 15 ? "H1" : "H2"}`;
};

const getCycleRuntime = (cycle, todayKey = getCurrentBusinessDateKey()) => {
  const businessTodayKey = getBusinessDateKey(todayKey);

  if (businessTodayKey < cycle.periodStart) {
    return {
      businessTodayKey,
      calculationThroughDate: "",
      isFuture: true,
      isProvisional: false,
      canGenerate: false,
      canFinalize: false,
    };
  }

  const isProvisional = businessTodayKey < cycle.periodEnd;

  return {
    businessTodayKey,
    calculationThroughDate: isProvisional ? businessTodayKey : cycle.periodEnd,
    isFuture: false,
    isProvisional,
    canGenerate: true,
    canFinalize: !isProvisional,
  };
};

const decorateCycle = (cycle, todayKey = getCurrentBusinessDateKey()) => ({
  ...cycle,
  ...getCycleRuntime(cycle, todayKey),
});

const assertCycleCanGenerate = (cycle, todayKey = getCurrentBusinessDateKey()) => {
  const runtime = getCycleRuntime(cycle, todayKey);

  if (!runtime.canGenerate) {
    throw createHttpError("Cycle Not Started. Payroll cannot be generated yet.", 400);
  }

  return runtime;
};

const assertCycleCanFinalize = (cycle, todayKey = getCurrentBusinessDateKey()) => {
  const runtime = getCycleRuntime(cycle, todayKey);

  if (!runtime.canFinalize) {
    throw createHttpError("Cannot Finalize Before Cycle End.", 400);
  }

  return runtime;
};

const validateEarlyCloseEligibility = ({
  cycle,
  payrolls = [],
  reason = "",
  todayKey = getCurrentBusinessDateKey(),
}) => {
  const cleanReason = normalizeText(reason);

  if (!cleanReason) {
    throw createHttpError("Early Close Reason is required.", 400);
  }

  const runtime = getCycleRuntime(cycle, todayKey);

  if (runtime.isFuture) {
    throw createHttpError("Cycle Not Started. Payroll cannot be early closed yet.", 400);
  }

  if (!runtime.isProvisional) {
    throw createHttpError("Cycle has ended. Use normal Finalize.", 400);
  }

  const activePayrolls = payrolls.filter((payroll) => payroll.status !== "void");
  const nonDraftPayrolls = activePayrolls.filter((payroll) => payroll.status !== "draft");

  if (nonDraftPayrolls.length > 0) {
    throw createHttpError("Early Close requires all payroll rows to be Draft.", 400);
  }

  const draftPayrolls = payrolls.filter((payroll) => payroll.status === "draft");

  if (draftPayrolls.length === 0) {
    throw createHttpError("No Draft payrolls found for Early Close.", 400);
  }

  const throughDates = [
    ...new Set(
      draftPayrolls
        .map((payroll) => normalizeText(payroll.calculationThroughDate))
        .filter(Boolean),
    ),
  ];

  if (throughDates.length !== 1) {
    throw createHttpError(
      "Payroll drafts are not synchronized. Recalculate Drafts before Early Close.",
      400,
    );
  }

  const throughDate = throughDates[0];

  if (throughDate < cycle.periodStart || throughDate > cycle.periodEnd) {
    throw createHttpError("Early Close through date is outside this payroll cycle.", 400);
  }

  if (throughDate > runtime.businessTodayKey) {
    throw createHttpError("Early Close through date cannot be in the future.", 400);
  }

  const blockedPayrolls = draftPayrolls.filter(
    (payroll) =>
      payroll.attendanceIncomplete || (payroll.finalizeBlockedReasons || []).length,
  );

  if (blockedPayrolls.length > 0) {
    throw createHttpError(
      `Early Close blocked: ${blockedPayrolls.length} payrolls require attention.`,
      400,
    );
  }

  return {
    draftPayrolls,
    reason: cleanReason,
    runtime,
    throughDate,
  };
};

const resolvePayrollCycle = (cycleKey = "") => {
  const requestedCycleKey = normalizeText(cycleKey) || getCurrentCycleKey();
  const match = requestedCycleKey.match(CYCLE_KEY_PATTERN);

  if (!match) {
    throw createHttpError("Payroll Cycle is invalid", 400);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const half = match[3] === "2" ? "H2" : "H1";

  if (!year || month < 1 || month > 12) {
    throw createHttpError("Payroll Cycle is invalid", 400);
  }

  const nextMonth = getNextMonth(year, month);
  const periodStart = buildDateKey(year, month, half === "H1" ? 1 : 16);
  const periodEnd = buildDateKey(
    year,
    month,
    half === "H1" ? 15 : getMonthLastDay(year, month),
  );
  const dueDate = buildDateKey(
    half === "H1" ? year : nextMonth.year,
    half === "H1" ? month : nextMonth.month,
    half === "H1" ? 22 : 7,
  );

  return {
    key: `${year}-${pad2(month)}-${half}`,
    year,
    month,
    half,
    periodStart,
    periodEnd,
    dueDate,
    monthStart: buildDateKey(year, month, 1),
    monthEnd: buildDateKey(year, month, getMonthLastDay(year, month)),
    halfDays: listDateKeys(periodStart, periodEnd).length,
  };
};

const getCycleOptions = (baseCycleKey = "") => {
  const cycle = resolvePayrollCycle(baseCycleKey);
  let cursorYear = cycle.year;
  let cursorMonth = cycle.month;
  let cursorHalf = cycle.half;
  const options = [];

  for (let index = 0; index < 8; index += 1) {
    options.push(resolvePayrollCycle(`${cursorYear}-${pad2(cursorMonth)}-${cursorHalf}`));

    if (cursorHalf === "H1") {
      cursorHalf = "H2";
    } else {
      const next = getNextMonth(cursorYear, cursorMonth);
      cursorYear = next.year;
      cursorMonth = next.month;
      cursorHalf = "H1";
    }
  }

  return options;
};

const getCycleIndex = (cycleOrKey = "") => {
  const cycle =
    typeof cycleOrKey === "string" ? resolvePayrollCycle(cycleOrKey) : cycleOrKey;

  return Number(cycle.year) * 24 + (Number(cycle.month) - 1) * 2 + (cycle.half === "H2" ? 1 : 0);
};

const resolveRecoveryCycle = (cycleKey = "") => {
  try {
    return resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  } catch (error) {
    return null;
  }
};

const normalizeRecoveryFrequency = (kind, value = "") => {
  const frequency = normalizeText(value).toLowerCase();

  if (kind === "loan") {
    return frequency === "monthly" ? "monthly" : "every_payroll_cycle";
  }

  return frequency === "one_time" ? "one_time" : "carry_forward";
};

const getRecoveryDescription = (entry = {}) =>
  entry.kind === "loan" ? "Loan installment" : "Kharcha / Advance recovery";

const normalizeRecoveryApplication = (entry = {}, fallback = {}) => {
  const amount = roundMoney(entry.amount);
  const scheduledAmount = roundMoney(entry.scheduledAmount ?? fallback.scheduledAmount);
  const isSkipped = entry.isSkipped === true || String(entry.isSkipped) === "true";
  const isManualOverride =
    entry.isManualOverride === true ||
    String(entry.isManualOverride) === "true" ||
    isSkipped;

  return {
    advanceLoanId: entry.advanceLoanId || fallback.advanceLoanId || null,
    kind: entry.kind === "loan" ? "loan" : "advance",
    amount: isSkipped ? 0 : amount,
    scheduledAmount,
    cycleKey: normalizeText(entry.cycleKey || fallback.cycleKey),
    frequency: normalizeText(entry.frequency || fallback.frequency),
    isSkipped,
    isManualOverride,
    description: normalizeText(entry.description || fallback.description),
  };
};

const normalizeRecoveryApplications = (entries = []) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeRecoveryApplication(entry))
    .filter((entry) => entry.advanceLoanId);

const buildRecoveryOverrideMap = (entries = []) =>
  new Map(
    normalizeRecoveryApplications(entries).map((entry) => [
      idOf(entry.advanceLoanId),
      entry,
    ]),
  );

const isFinanceEntryEligibleForCycle = (entry = {}, cycleOrKey = "") => {
  const cycle =
    typeof cycleOrKey === "string" ? resolveRecoveryCycle(cycleOrKey) : cycleOrKey;
  if (!cycle || entry.isDeleted || entry.status === "void") return false;

  const outstandingAmount = roundMoney(entry.outstandingAmount);
  if (outstandingAmount <= 0) return false;

  const kind = entry.kind === "loan" ? "loan" : "advance";
  const plan = entry.recoveryPlan || {};

  if (kind === "loan") {
    const firstCycle = resolveRecoveryCycle(plan.firstCycleKey);
    const installmentAmount = roundMoney(plan.installmentAmount);
    if (!firstCycle || installmentAmount <= 0) return false;
    if (getCycleIndex(cycle) < getCycleIndex(firstCycle)) return false;

    const frequency = normalizeRecoveryFrequency(kind, plan.frequency);
    return frequency === "monthly" ? cycle.half === firstCycle.half : true;
  }

  const targetCycle = resolveRecoveryCycle(plan.targetCycleKey);
  return Boolean(targetCycle) && getCycleIndex(cycle) >= getCycleIndex(targetCycle);
};

const sortFinanceEntries = (entries = []) =>
  [...entries].sort((left, right) => {
    const leftDate = getDateKeyFromValue(left.date) || "";
    const rightDate = getDateKeyFromValue(right.date) || "";
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);

    return idOf(left._id).localeCompare(idOf(right._id));
  });

const buildRecoveryApplicationsForPayroll = ({
  financeEntries = [],
  cycle,
  availableSalary = 0,
  activeDraftRecoveryIds = new Set(),
  existingApplications = [],
} = {}) => {
  const overrideMap = buildRecoveryOverrideMap(existingApplications);
  let remainingSalary = Math.max(0, roundMoney(availableSalary));
  const applications = [];

  sortFinanceEntries(financeEntries).forEach((entry) => {
    const financeId = idOf(entry._id);
    if (!financeId || activeDraftRecoveryIds.has(financeId)) return;
    if (!isFinanceEntryEligibleForCycle(entry, cycle)) return;

    const kind = entry.kind === "loan" ? "loan" : "advance";
    const plan = entry.recoveryPlan || {};
    const outstandingAmount = roundMoney(entry.outstandingAmount);
    const frequency = normalizeRecoveryFrequency(kind, plan.frequency);
    const scheduledAmount =
      kind === "loan"
        ? roundMoney(Math.min(outstandingAmount, roundMoney(plan.installmentAmount)))
        : outstandingAmount;
    const existing = overrideMap.get(financeId);
    const fallback = {
      advanceLoanId: entry._id,
      kind,
      scheduledAmount,
      cycleKey: cycle.key,
      frequency,
      description: getRecoveryDescription(entry),
    };
    const normalized = existing
      ? normalizeRecoveryApplication(existing, fallback)
      : normalizeRecoveryApplication(
          {
            ...fallback,
            amount: Math.min(scheduledAmount, outstandingAmount, remainingSalary),
          },
          fallback,
        );

    if (normalized.isSkipped) {
      normalized.amount = 0;
    } else if (normalized.isManualOverride) {
      if (normalized.amount > outstandingAmount) {
        throw createHttpError("Recovery amount is greater than outstanding amount.", 400);
      }

      if (normalized.amount > remainingSalary) {
        throw createHttpError("Recovery amount cannot make Net Salary negative.", 400);
      }
    } else {
      normalized.amount = roundMoney(
        Math.min(scheduledAmount, outstandingAmount, remainingSalary),
      );
    }

    remainingSalary = roundMoney(remainingSalary - normalized.amount);
    applications.push(normalized);
  });

  return applications;
};

const normalizeSalaryType = (value = "") =>
  normalizeText(value).toLowerCase() === "daily" ? "daily" : "monthly";

const normalizeWeeklyOffDays = (days = []) => {
  if (!Array.isArray(days)) return [];

  const seen = new Set();

  return days.reduce((result, day) => {
    const normalized = normalizeText(day).toLowerCase();

    if (WEEKDAY_KEYS.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }

    return result;
  }, []);
};

const normalizeManualAdditions = (entries = []) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      type: ["bonus", "commission", "overtime", "other"].includes(entry?.type)
        ? entry.type
        : "other",
      amount: roundMoney(entry?.amount),
      description: normalizeText(entry?.description || entry?.reason),
    }))
    .filter((entry) => {
      if (entry.amount <= 0) return false;

      if (!entry.description) {
        throw createHttpError("Reason is required for every manual earning.", 400);
      }

      return true;
    });

const normalizeManualDeductions = (entries = []) =>
  (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      amount: roundMoney(entry?.amount),
      description: normalizeText(entry?.description || entry?.reason),
    }))
    .filter((entry) => {
      if (entry.amount <= 0) return false;

      if (!entry.description) {
        throw createHttpError("Reason is required for every manual deduction.", 400);
      }

      return true;
    });

const normalizePaymentReceiver = (payload = {}) => {
  const receivedBy = normalizeText(payload.receivedBy).toLowerCase() === "other" ? "other" : "self";
  const receiverName = receivedBy === "other" ? normalizeText(payload.receiverName) : "";
  const receiverPhone = receivedBy === "other" ? normalizeText(payload.receiverPhone) : "";

  if (receivedBy === "other" && !receiverName) {
    throw createHttpError("Receiver Name is required.", 400);
  }

  return {
    receivedBy,
    receiverName,
    receiverPhone,
  };
};

const buildPaymentJournalDescription = ({ employee, payroll, receiver }) => {
  const receiverLabel = receiver.receivedBy === "other" ? receiver.receiverName : "Self";

  return `Salary payment to ${employee.name} (${payroll.periodKey}) - Received by ${receiverLabel}`;
};

const appendPayrollPaymentHistory = ({
  payroll,
  amount,
  paymentAccount,
  paymentType,
  paymentDate,
  paymentTime,
  receiver,
  note = "",
  journalEntryId,
  paidBy,
  paidAt = new Date(),
}) => {
  payroll.paymentHistory = [
    ...(Array.isArray(payroll.paymentHistory) ? payroll.paymentHistory : []),
    {
      amount: roundMoney(amount),
      paymentAccountId: paymentAccount?._id || paymentAccount || null,
      paymentType,
      paymentDate: parseBusinessDate(paymentDate),
      paymentTime: normalizeText(paymentTime),
      receivedBy: receiver.receivedBy,
      receiverName: receiver.receiverName,
      receiverPhone: receiver.receiverPhone,
      note: normalizeText(note),
      journalEntryId,
      paidAt,
      paidBy: paidBy || null,
    },
  ];

  return payroll.paymentHistory;
};

const aggregateAttendanceByEmployeeDate = (attendanceRows = []) => {
  const map = new Map();

  attendanceRows.forEach((row) => {
    const employeeId = idOf(row.employeeId);
    const dateKey = normalizeText(row.attendanceDate);

    if (!employeeId || !dateKey) return;

    const key = `${employeeId}:${dateKey}`;
    const current =
      map.get(key) ||
      {
        employeeId,
        dateKey,
        hasPresent: false,
        hasLeave: false,
        hasAbsent: false,
        otHours: 0,
        doubleDutyCount: 0,
        recordCount: 0,
      };

    current.recordCount += 1;

    if (row.status === "present") {
      current.hasPresent = true;
      current.otHours = roundMoney(current.otHours + Number(row.otHours || 0));

      const dutyType = normalizeText(row.dutyType).toLowerCase();
      if (row.isDoubleDuty || dutyType === "double" || dutyType === "double_replacement") {
        current.doubleDutyCount += 1;
      }
    } else if (row.status === "leave") {
      current.hasLeave = true;
    } else if (row.status === "absent") {
      current.hasAbsent = true;
    }

    map.set(key, current);
  });

  return map;
};

const getAttendanceForDate = (attendanceMap, employeeId, dateKey) =>
  attendanceMap.get(`${employeeId}:${dateKey}`) || null;

const getEmployeeStartKey = (employee = {}) => getDateKeyFromValue(employee.joiningDate);

const getEmployeeEndKey = (employee = {}) =>
  employee.isDeleted && employee.deletedAt ? getDateKeyFromValue(employee.deletedAt) : "";

const collectHistoricalPayrollEmployeeIds = ({
  attendanceRows = [],
  existingPayrolls = [],
  knottingJobs = [],
  segmentStart = "",
  calculationThroughDate = "",
}) => new Set([
  ...attendanceRows
    .filter((row) => {
      const rowDate = getDateKeyFromValue(row.attendanceDate);
      return rowDate >= segmentStart && rowDate <= calculationThroughDate;
    })
    .map((row) => idOf(row.employeeId)),
  ...existingPayrolls.map((payroll) => idOf(payroll.employeeId)),
  ...knottingJobs.map((job) => idOf(job.employeeId)),
].filter(Boolean));

const isEmployeeActiveOnDate = (employee, dateKey) => {
  const startKey = getEmployeeStartKey(employee);
  const endKey = getEmployeeEndKey(employee);

  if (startKey && dateKey < startKey) return false;
  if (endKey && dateKey > endKey) return false;

  return true;
};

const isWeeklyOffDate = (weeklyOffDays, dateKey) =>
  weeklyOffDays.includes(getWeekdayKey(dateKey));

const getPaidLeaveDates = ({
  employee,
  attendanceMap,
  monthDateKeys,
  weeklyOffDays,
}) => {
  const allowance = Math.max(0, Number.parseInt(employee.paidLeaveAllowance || 0, 10) || 0);
  if (!allowance) return new Set();

  const employeeId = idOf(employee._id);
  const leaveDates = monthDateKeys.filter((dateKey) => {
    if (!isEmployeeActiveOnDate(employee, dateKey)) return false;
    if (isWeeklyOffDate(weeklyOffDays, dateKey)) return false;

    const attendance = getAttendanceForDate(attendanceMap, employeeId, dateKey);
    return attendance && !attendance.hasPresent && attendance.hasLeave;
  });

  return new Set(leaveDates.slice(0, allowance));
};

const shouldApplyOpeningBalance = ({
  employee,
  cycleKey,
  openingAlreadyApplied,
  grossBeforeOpening,
}) => {
  const openingBalance = employee.openingBalance || {};
  const amount = roundMoney(openingBalance.amount);

  if (openingAlreadyApplied || amount <= 0 || grossBeforeOpening <= 0) {
    return false;
  }

  if (openingBalance.type === "payable") {
    return true;
  }

  if (openingBalance.type !== "receivable") {
    return false;
  }

  if (openingBalance.deductionIntent === "manual_review") {
    return normalizeText(openingBalance.targetCycleKey) === cycleKey;
  }

  return true;
};

const calculateEmployeePayroll = ({
  employee,
  cycle,
  attendanceMap,
  periodDateKeys,
  monthDateKeys,
  manualAdditions = [],
  manualDeductions = [],
  openingAlreadyApplied = false,
}) => {
  const employeeId = idOf(employee._id);
  const salaryType = normalizeSalaryType(employee.salaryType);
  const salaryRate = roundMoney(employee.baseSalary);
  const knottingPaymentMethod = employee.knottingPaymentMethod || "monthly";
  const pieceOnlyKnotting = ["per_beam", "per_set"].includes(knottingPaymentMethod);
  const dutyHours = Number(employee.dutyHours || 0);
  const weeklyOffDays = normalizeWeeklyOffDays(employee.weeklyOffDays);
  const otAllowed = employee.otAllowed !== false;
  const paidLeaveDates = getPaidLeaveDates({
    employee,
    attendanceMap,
    monthDateKeys,
    weeklyOffDays,
  });
  const normalizedAdditions = normalizeManualAdditions(manualAdditions);
  const normalizedDeductions = normalizeManualDeductions(manualDeductions);

  const totals = {
    halfDays: cycle.halfDays,
    eligibleDays: 0,
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    paidLeaveDays: 0,
    unpaidLeaveDays: 0,
    weeklyOffDaysInPeriod: 0,
    offDayWorkedDays: 0,
    otHours: 0,
    doubleDutyCount: 0,
    missingAttendanceDates: [],
    finalizeBlockedReasons: [],
  };

  periodDateKeys.forEach((dateKey) => {
    if (!isEmployeeActiveOnDate(employee, dateKey)) return;

    totals.eligibleDays += 1;

    const weeklyOff = isWeeklyOffDate(weeklyOffDays, dateKey);
    if (weeklyOff) totals.weeklyOffDaysInPeriod += 1;

    const attendance = getAttendanceForDate(attendanceMap, employeeId, dateKey);

    if (!attendance) {
      if (!weeklyOff) {
        totals.missingAttendanceDates.push(dateKey);
      }
      return;
    }

    if (attendance.hasPresent) {
      totals.presentDays += 1;
      totals.otHours = roundMoney(totals.otHours + Number(attendance.otHours || 0));
      totals.doubleDutyCount += Number(attendance.doubleDutyCount || 0);

      if (weeklyOff) {
        totals.offDayWorkedDays += 1;
      }
      return;
    }

    if (weeklyOff) return;

    if (attendance.hasLeave) {
      totals.leaveDays += 1;

      if (paidLeaveDates.has(dateKey)) {
        totals.paidLeaveDays += 1;
      } else {
        totals.unpaidLeaveDays += 1;
      }
      return;
    }

    if (attendance.hasAbsent) {
      totals.absentDays += 1;
    }
  });

  const manualAdditionAmount = roundMoney(
    normalizedAdditions.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const manualDeductionAmount = roundMoney(
    normalizedDeductions.reduce((sum, entry) => sum + entry.amount, 0),
  );
  const monthlyDayRate = roundMoney(salaryRate / 30);
  const dailyRate = salaryRate;
  const rateForDay = salaryType === "daily" ? dailyRate : monthlyDayRate;
  const fullHalfSalary = roundMoney(salaryRate / 2);
  const baseSalaryAmount = pieceOnlyKnotting
    ? 0
    : salaryType === "monthly"
      ? roundMoney(
          totals.eligibleDays >= cycle.halfDays
            ? fullHalfSalary
            : (totals.eligibleDays / cycle.halfDays) * fullHalfSalary,
        )
      : roundMoney((totals.presentDays + totals.paidLeaveDays) * dailyRate);
  const proratedBaseSalary =
    salaryType === "monthly" && totals.eligibleDays < cycle.halfDays ? baseSalaryAmount : 0;
  const absentDeductionAmount =
    !pieceOnlyKnotting && salaryType === "monthly" ? roundMoney(totals.absentDays * monthlyDayRate) : 0;
  const unpaidLeaveDeductionAmount =
    !pieceOnlyKnotting && salaryType === "monthly" ? roundMoney(totals.unpaidLeaveDays * monthlyDayRate) : 0;
  const offDayWorkedAmount = pieceOnlyKnotting ? 0 : roundMoney(totals.offDayWorkedDays * rateForDay);
  const doubleDutyAmount = pieceOnlyKnotting ? 0 : roundMoney(totals.doubleDutyCount * rateForDay);

  let otAmount = 0;
  if (!pieceOnlyKnotting && totals.otHours > 0 && otAllowed) {
    if (dutyHours > 0) {
      otAmount = roundMoney(totals.otHours * (rateForDay / dutyHours) * OT_MULTIPLIER);
    } else {
      totals.finalizeBlockedReasons.push("Duty Hours missing for overtime calculation");
    }
  }

  const openingBalance = employee.openingBalance || {};
  const openingSourceAmount = roundMoney(openingBalance.amount);
  const grossBeforeOpening = roundMoney(
    baseSalaryAmount + offDayWorkedAmount + doubleDutyAmount + otAmount + manualAdditionAmount,
  );
  const deductionsBeforeOpening = roundMoney(
    absentDeductionAmount + unpaidLeaveDeductionAmount + manualDeductionAmount,
  );
  const openingApplies = shouldApplyOpeningBalance({
    employee,
    cycleKey: cycle.key,
    openingAlreadyApplied,
    grossBeforeOpening,
  });
  const openingPayableAmount =
    openingApplies && openingBalance.type === "payable" ? openingSourceAmount : 0;
  const availableForRecovery = Math.max(
    0,
    roundMoney(grossBeforeOpening + openingPayableAmount - deductionsBeforeOpening),
  );
  const openingReceivableAmount =
    openingApplies && openingBalance.type === "receivable"
      ? roundMoney(Math.min(openingSourceAmount, availableForRecovery))
      : 0;
  const totalAdditions = roundMoney(
    offDayWorkedAmount +
      doubleDutyAmount +
      otAmount +
      manualAdditionAmount +
      openingPayableAmount,
  );
  const grossSalary = roundMoney(baseSalaryAmount + totalAdditions);
  const totalDeductions = roundMoney(
    absentDeductionAmount +
      unpaidLeaveDeductionAmount +
      manualDeductionAmount +
      openingReceivableAmount,
  );
  const netSalary = Math.max(0, roundMoney(grossSalary - totalDeductions));
  const attendanceIncomplete = totals.missingAttendanceDates.length > 0;

  if (attendanceIncomplete && !pieceOnlyKnotting) {
    totals.finalizeBlockedReasons.push("Attendance Incomplete");
  }

  return {
    cycleKey: cycle.key,
    calculationThroughDate: periodDateKeys[periodDateKeys.length - 1] || "",
    salaryTypeSnapshot: salaryType,
    knottingPaymentMethodSnapshot: knottingPaymentMethod,
    salaryRateSnapshot: salaryRate,
    dutyHoursSnapshot: dutyHours,
    weeklyOffDaysSnapshot: weeklyOffDays,
    paidLeaveAllowanceSnapshot: Number.parseInt(employee.paidLeaveAllowance || 0, 10) || 0,
    otAllowedSnapshot: otAllowed,
    ...totals,
    attendanceIncomplete,
    baseSalaryAmount,
    proratedBaseSalary,
    absentDeductionAmount,
    unpaidLeaveDeductionAmount,
    offDayWorkedAmount,
    otAmount,
    doubleDutyAmount,
    manualAdditions: normalizedAdditions,
    manualDeductions: normalizedDeductions,
    manualAdditionAmount,
    manualDeductionAmount,
    openingBalanceRecovery: {
      applied: openingApplies && (openingPayableAmount > 0 || openingReceivableAmount > 0),
      amount: roundMoney(openingPayableAmount || openingReceivableAmount),
      sourceAmount: openingSourceAmount,
      balanceType: openingBalance.type || "",
      deductionIntent: openingBalance.deductionIntent || "",
      targetCycleKey: openingBalance.targetCycleKey || "",
      targetPayDate: openingBalance.targetPayDate || null,
      description:
        openingBalance.type === "payable"
          ? "Opening balance payable added to salary"
          : openingBalance.type === "receivable"
            ? "Opening balance receivable recovered from salary"
            : "",
    },
    totalAdditions,
    totalDeductions,
    recoveryAmount: 0,
    grossSalary,
    netSalary,
    remainingDue: netSalary,
  };
};

const applyCalculationToPayroll = ({
  payroll,
  employee,
  cycle,
  segment = {},
  calculation,
  recoveryApplications = [],
}) => {
  const normalizedRecoveries = normalizeRecoveryApplications(recoveryApplications);
  const recoveryAmount = roundMoney(
    normalizedRecoveries.reduce((sum, entry) => sum + roundMoney(entry.amount), 0),
  );
  const netSalary = Math.max(0, roundMoney(calculation.netSalary - recoveryAmount));
  const segmentNo = Number.parseInt(segment.segmentNo, 10) || 1;
  const storageKey = segment.storageKey || buildSegmentStorageKey(cycle.key, segmentNo);
  const segmentStart = segment.segmentStart || cycle.periodStart;
  const segmentEnd = segment.segmentEnd || cycle.periodEnd;

  payroll.userId = employee.userId;
  payroll.moduleScope = WEAVING_SCOPE;
  payroll.employeeId = employee._id;
  payroll.periodKey = storageKey;
  payroll.cycleKey = storageKey;
  payroll.baseCycleKey = cycle.key;
  payroll.segmentNo = segmentNo;
  payroll.periodStart = cycle.periodStart;
  payroll.periodEnd = cycle.periodEnd;
  payroll.segmentStart = segmentStart;
  payroll.segmentEnd = segmentEnd;
  payroll.calculationThroughDate = calculation.calculationThroughDate || cycle.periodEnd;
  payroll.dueDate = parseBusinessDate(cycle.dueDate);
  payroll.salaryDate = payroll.dueDate;
  payroll.salaryTime = payroll.salaryTime || "";
  payroll.baseSalary = calculation.baseSalaryAmount;
  payroll.salaryTypeSnapshot = calculation.salaryTypeSnapshot;
  payroll.salaryRateSnapshot = calculation.salaryRateSnapshot;
  payroll.knottingPaymentMethodSnapshot = calculation.knottingPaymentMethodSnapshot;
  payroll.knottingEarnings = calculation.knottingEarnings || 0;
  payroll.knottingJobIds = calculation.knottingJobIds || [];
  payroll.dutyHoursSnapshot = calculation.dutyHoursSnapshot;
  payroll.weeklyOffDaysSnapshot = calculation.weeklyOffDaysSnapshot;
  payroll.paidLeaveAllowanceSnapshot = calculation.paidLeaveAllowanceSnapshot;
  payroll.otAllowedSnapshot = calculation.otAllowedSnapshot;
  payroll.halfDays = calculation.halfDays;
  payroll.eligibleDays = calculation.eligibleDays;
  payroll.presentDays = calculation.presentDays;
  payroll.absentDays = calculation.absentDays;
  payroll.leaveDays = calculation.leaveDays;
  payroll.paidLeaveDays = calculation.paidLeaveDays;
  payroll.unpaidLeaveDays = calculation.unpaidLeaveDays;
  payroll.weeklyOffDaysInPeriod = calculation.weeklyOffDaysInPeriod;
  payroll.offDayWorkedDays = calculation.offDayWorkedDays;
  payroll.offDayWorkedAmount = calculation.offDayWorkedAmount;
  payroll.otHours = calculation.otHours;
  payroll.otAmount = calculation.otAmount;
  payroll.doubleDutyCount = calculation.doubleDutyCount;
  payroll.doubleDutyAmount = calculation.doubleDutyAmount;
  payroll.proratedBaseSalary = calculation.proratedBaseSalary;
  payroll.absentDeductionAmount = calculation.absentDeductionAmount;
  payroll.unpaidLeaveDeductionAmount = calculation.unpaidLeaveDeductionAmount;
  payroll.manualAdditionAmount = calculation.manualAdditionAmount;
  payroll.manualDeductionAmount = calculation.manualDeductionAmount;
  payroll.missingAttendanceDates = calculation.missingAttendanceDates;
  payroll.attendanceIncomplete = calculation.attendanceIncomplete;
  payroll.finalizeBlockedReasons = calculation.finalizeBlockedReasons;
  payroll.openingBalanceRecovery = calculation.openingBalanceRecovery;
  payroll.additions = calculation.manualAdditions;
  payroll.deductions = calculation.manualDeductions;
  payroll.recoveryApplications = normalizedRecoveries;
  payroll.totalAdditions = calculation.totalAdditions;
  payroll.totalDeductions = roundMoney(calculation.totalDeductions + recoveryAmount);
  payroll.recoveryAmount = recoveryAmount;
  payroll.grossSalary = calculation.grossSalary;
  payroll.netSalary = netSalary;
  payroll.paidAmount = 0;
  payroll.remainingDue = netSalary;
  payroll.paymentAccountId = null;
  payroll.paymentType = "";
  payroll.status = "draft";
};

const getOpeningAppliedMap = async ({ userId, session }) => {
  const payrolls = await getSessionQuery(
    EmployeePayroll.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
      status: { $ne: "void" },
      "openingBalanceRecovery.applied": true,
    })
      .select("_id employeeId")
      .lean(),
    session,
  );
  const map = new Map();

  payrolls.forEach((payroll) => {
    map.set(idOf(payroll.employeeId), idOf(payroll._id));
  });

  return map;
};

const buildBaseCyclePayrollQuery = (baseCycleKey) => ({
  $or: [
    { baseCycleKey },
    {
      baseCycleKey: { $in: ["", null] },
      cycleKey: baseCycleKey,
    },
    {
      baseCycleKey: { $in: ["", null] },
      periodKey: baseCycleKey,
    },
  ],
});

const getPayrollStorageKey = (payroll = {}) =>
  buildSegmentStorageKey(getPayrollBaseCycleKey(payroll), getPayrollSegmentNo(payroll));

const getSegmentEndFromPayroll = (payroll = {}) =>
  normalizeText(payroll.earlyCloseThroughDate) ||
  normalizeText(payroll.calculationThroughDate) ||
  normalizeText(payroll.segmentEnd) ||
  normalizeText(payroll.periodEnd);

const minDateKey = (...dateKeys) =>
  dateKeys.filter(Boolean).sort((left, right) => left.localeCompare(right))[0] || "";

const maxDateKey = (...dateKeys) =>
  dateKeys.filter(Boolean).sort((left, right) => right.localeCompare(left))[0] || "";

const buildSegmentMeta = ({ cycle, segmentNo = 1, payrolls = [], todayKey }) => {
  const storageKey = buildSegmentStorageKey(cycle.key, segmentNo);
  const segmentStart =
    payrolls.find((payroll) => payroll.segmentStart)?.segmentStart ||
    payrolls.find((payroll) => payroll.periodStart)?.periodStart ||
    cycle.periodStart;
  const segmentEnd =
    payrolls.find((payroll) => payroll.segmentEnd)?.segmentEnd || cycle.periodEnd;
  const calculationThroughDate = maxDateKey(
    ...payrolls.map((payroll) => normalizeText(payroll.calculationThroughDate)),
  );
  const earlyClosed = payrolls.length > 0 && payrolls.every((payroll) => payroll.earlyClosed);
  const earlyCloseThroughDate = earlyClosed
    ? maxDateKey(...payrolls.map((payroll) => normalizeText(payroll.earlyCloseThroughDate)))
    : "";
  const earlyCloseReason =
    payrolls.find((payroll) => payroll.earlyCloseReason)?.earlyCloseReason || "";
  const hasDraft = payrolls.some((payroll) => payroll.status === "draft");
  const effectiveEnd =
    earlyCloseThroughDate || calculationThroughDate || segmentEnd || cycle.periodEnd;

  return {
    baseCycleKey: cycle.key,
    storageKey,
    segmentNo,
    segmentStart,
    segmentEnd,
    periodStart: segmentStart,
    periodEnd: earlyClosed && earlyCloseThroughDate ? earlyCloseThroughDate : segmentEnd,
    originalPeriodStart: cycle.periodStart,
    originalPeriodEnd: cycle.periodEnd,
    calculationThroughDate,
    effectiveEnd,
    earlyClosed,
    earlyCloseThroughDate,
    earlyCloseReason,
    payrollCount: payrolls.length,
    hasDraft,
    isActive: hasDraft,
    displayStatus: earlyClosed ? "early_closed" : hasDraft ? "draft" : "finalized",
    isFuture: todayKey ? segmentStart > todayKey : false,
  };
};

const buildSegmentList = ({ cycle, payrolls = [], todayKey }) => {
  const bySegment = new Map();

  payrolls.forEach((payroll) => {
    const segmentNo = getPayrollSegmentNo(payroll);
    const current = bySegment.get(segmentNo) || [];
    current.push(payroll);
    bySegment.set(segmentNo, current);
  });

  if (bySegment.size === 0) {
    bySegment.set(1, []);
  }

  return [...bySegment.entries()]
    .sort(([left], [right]) => left - right)
    .map(([segmentNo, rows]) =>
      buildSegmentMeta({
        cycle,
        segmentNo,
        payrolls: rows,
        todayKey,
      }),
    );
};

const selectSegment = ({ segments = [], requestedSegmentNo }) => {
  const requested = Number.parseInt(requestedSegmentNo, 10);
  if (Number.isFinite(requested) && requested > 0) {
    return (
      segments.find((segment) => segment.segmentNo === requested) ||
      segments[segments.length - 1]
    );
  }

  return (
    [...segments].reverse().find((segment) => segment.hasDraft) ||
    segments[segments.length - 1]
  );
};

const buildResumeState = ({ cycle, segments = [], todayKey }) => {
  const latest = segments[segments.length - 1];
  const businessTodayKey = getBusinessDateKey(todayKey || getCurrentBusinessDateKey());

  if (!latest || !latest.earlyClosed || latest.effectiveEnd >= cycle.periodEnd) {
    return {
      canResume: false,
    };
  }

  const resumeFromMin = addDaysToDateKey(latest.effectiveEnd, 1);
  const maxResumeDate =
    businessTodayKey > cycle.periodEnd ? cycle.periodEnd : minDateKey(businessTodayKey, cycle.periodEnd);
  const canResume = resumeFromMin <= maxResumeDate;

  return {
    canResume,
    lastSegmentNo: latest.segmentNo,
    lastClosingThroughDate: latest.effectiveEnd,
    resumeFromMin,
    resumeFromDefault: canResume ? resumeFromMin : "",
    calculateThroughDefault: canResume ? maxResumeDate : "",
    maxResumeDate,
    nextSegmentNo: latest.segmentNo + 1,
  };
};

const getActiveDraftRecoveryFinanceIds = async ({ userId, cycle, session }) => {
  const currentCycleIndex = getCycleIndex(cycle);
  const payrolls = await getSessionQuery(
    EmployeePayroll.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
      status: "draft",
      "recoveryApplications.advanceLoanId": { $ne: null },
    })
      .select("cycleKey periodKey recoveryApplications")
      .lean(),
    session,
  );
  const financeIds = new Set();

  payrolls.forEach((payroll) => {
    const payrollCycle = resolveRecoveryCycle(payroll.cycleKey || payroll.periodKey);
    if (!payrollCycle || getCycleIndex(payrollCycle) >= currentCycleIndex) return;

    (payroll.recoveryApplications || []).forEach((recovery) => {
      if (
        recovery.advanceLoanId &&
        !recovery.isSkipped &&
        roundMoney(recovery.amount) > 0
      ) {
        financeIds.add(idOf(recovery.advanceLoanId));
      }
    });
  });

  return financeIds;
};

const loadFinanceRecoveriesForEmployee = async ({
  userId,
  employee,
  cycle,
  payroll,
  availableSalary,
  activeDraftRecoveryIds,
  baseCycleRecoveryIds = new Set(),
  session,
}) => {
  const financeEntries = await getSessionQuery(
    EmployeeAdvanceLoan.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      employeeId: employee._id,
      isDeleted: false,
      status: "active",
      outstandingAmount: { $gt: 0 },
    }).lean(),
    session,
  );

  return buildRecoveryApplicationsForPayroll({
    financeEntries,
    cycle,
    availableSalary,
    activeDraftRecoveryIds: new Set([
      ...activeDraftRecoveryIds,
      ...baseCycleRecoveryIds,
    ]),
    existingApplications: payroll?.recoveryApplications || [],
  });
};

const buildPayrollContext = async ({
  userId,
  cycleKey,
  segmentNo,
  segmentStart,
  calculationThroughDate,
  session,
}) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  const runtime = assertCycleCanGenerate(cycle);
  const normalizedSegmentNo =
    Number.parseInt(segmentNo, 10) || getPayrollSegmentNo(cycleKey) || 1;
  const storageKey = buildSegmentStorageKey(cycle.key, normalizedSegmentNo);
  const selectedSegmentStart = normalizeText(segmentStart) || cycle.periodStart;
  const maxThroughDate =
    runtime.calculationThroughDate > cycle.periodEnd
      ? cycle.periodEnd
      : runtime.calculationThroughDate;
  const selectedCalculationThroughDate =
    normalizeText(calculationThroughDate) || maxThroughDate;

  if (
    selectedSegmentStart < cycle.periodStart ||
    selectedSegmentStart > cycle.periodEnd ||
    selectedCalculationThroughDate < selectedSegmentStart ||
    selectedCalculationThroughDate > cycle.periodEnd ||
    selectedCalculationThroughDate > maxThroughDate
  ) {
    throw createHttpError("Payroll segment period is invalid.", 400);
  }

  const monthDateKeys = listDateKeys(cycle.monthStart, cycle.monthEnd);
  const periodDateKeys = listDateKeys(
    selectedSegmentStart,
    selectedCalculationThroughDate,
  );
  const attendanceRows = await getSessionQuery(
    WeavingAttendance.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      attendanceDate: {
        $gte: cycle.monthStart,
        $lte: selectedCalculationThroughDate,
      },
    }).lean(),
    session,
  );
  const existingPayrolls = await getSessionQuery(
    EmployeePayroll.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
      $or: [{ cycleKey: storageKey }, { periodKey: storageKey }],
    }),
    session,
  );
  const baseCyclePayrolls = await getSessionQuery(
    EmployeePayroll.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
      ...buildBaseCyclePayrollQuery(cycle.key),
    })
      .select("employeeId cycleKey periodKey baseCycleKey segmentNo recoveryApplications")
      .lean(),
    session,
  );
  const baseCycleRecoveryIdsByEmployee = new Map();

  const knottingJobs = await getSessionQuery(
    WeavingKnottingJob.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      status: "approved",
      workDate: { $gte: selectedSegmentStart, $lte: selectedCalculationThroughDate },
    }).select("employeeId amount"),
    session,
  );
  const attendanceEmployeeIds = [
    ...new Set(attendanceRows.map((row) => idOf(row.employeeId)).filter(Boolean)),
  ];
  const attendanceObjectIds = attendanceEmployeeIds
    .filter((employeeId) => mongoose.Types.ObjectId.isValid(employeeId))
    .map((employeeId) => new mongoose.Types.ObjectId(employeeId));
  const historicalEmployeeIds = collectHistoricalPayrollEmployeeIds({
    attendanceRows,
    existingPayrolls,
    knottingJobs,
    segmentStart: selectedSegmentStart,
    calculationThroughDate: selectedCalculationThroughDate,
  });
  const historicalObjectIds = [...historicalEmployeeIds]
    .filter((employeeId) => mongoose.Types.ObjectId.isValid(employeeId))
    .map((employeeId) => new mongoose.Types.ObjectId(employeeId));
  const employees = await getSessionQuery(
    Employee.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      $or: [
        {
          isDeleted: { $ne: true },
          status: "active",
          $or: [
            { joiningDate: null },
            { joiningDate: { $lte: parseBusinessDate(selectedCalculationThroughDate) } },
            { _id: { $in: attendanceObjectIds } },
          ],
        },
        { _id: { $in: historicalObjectIds } },
      ],
    })
      .sort({ unitNo: 1, listOrder: 1, name: 1 })
      .lean(),
    session,
  );
  const knottingEarningsByEmployee = new Map();
  knottingJobs.forEach((job) => {
    const employeeId = idOf(job.employeeId);
    const current = knottingEarningsByEmployee.get(employeeId) || { amount: 0, jobIds: [] };
    current.amount = roundMoney(current.amount + roundMoney(job.amount));
    current.jobIds.push(job._id);
    knottingEarningsByEmployee.set(employeeId, current);
  });

  baseCyclePayrolls.forEach((payroll) => {
    if (getPayrollStorageKey(payroll) === storageKey) return;

    const employeeId = idOf(payroll.employeeId);
    const current = baseCycleRecoveryIdsByEmployee.get(employeeId) || new Set();
    (payroll.recoveryApplications || []).forEach((recovery) => {
      if (recovery.advanceLoanId) {
        current.add(idOf(recovery.advanceLoanId));
      }
    });
    baseCycleRecoveryIdsByEmployee.set(employeeId, current);
  });

  return {
    cycle,
    runtime,
    segment: {
      baseCycleKey: cycle.key,
      storageKey,
      segmentNo: normalizedSegmentNo,
      segmentStart: selectedSegmentStart,
      segmentEnd: cycle.periodEnd,
      calculationThroughDate: selectedCalculationThroughDate,
    },
    monthDateKeys,
    periodDateKeys,
    attendanceMap: aggregateAttendanceByEmployeeDate(attendanceRows),
    employees,
    existingPayrolls,
    baseCyclePayrolls,
    baseCycleRecoveryIdsByEmployee,
    knottingEarningsByEmployee,
    openingAppliedMap: await getOpeningAppliedMap({ userId, session }),
    activeDraftRecoveryIds: await getActiveDraftRecoveryFinanceIds({
      userId,
      cycle,
      session,
    }),
  };
};

const getLockedStatuses = () => ["posted", "finalized", "partially_paid", "paid"];

const isLockedPayroll = (payroll) => getLockedStatuses().includes(payroll.status);

const calculateForEmployee = ({ employee, payroll, context }) => {
  const employeeId = idOf(employee._id);
  const appliedPayrollId = context.openingAppliedMap.get(employeeId);
  const openingAlreadyApplied =
    Boolean(appliedPayrollId) && idOf(payroll?._id) !== appliedPayrollId;

  const calculation = calculateEmployeePayroll({
    employee,
    cycle: context.cycle,
    attendanceMap: context.attendanceMap,
    periodDateKeys: context.periodDateKeys,
    monthDateKeys: context.monthDateKeys,
    manualAdditions: payroll?.additions || [],
    manualDeductions: payroll?.deductions || [],
    openingAlreadyApplied,
  });
  const knotting = context.knottingEarningsByEmployee.get(employeeId) || { amount: 0, jobIds: [] };
  return { ...calculation, knottingEarnings: knotting.amount, knottingJobIds: knotting.jobIds };
};

const loadPayrollsForBaseCycle = async ({ userId, cycleKey, recordState = "active" }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  const stateFilter = normalizeText(recordState).toLowerCase() === "inactive"
    ? { $or: [{ isDeleted: true }, { status: "void" }] }
    : { isDeleted: { $ne: true }, status: { $ne: "void" } };

  return EmployeePayroll.find({
    userId,
    moduleScope: WEAVING_SCOPE,
    $and: [stateFilter, buildBaseCyclePayrollQuery(cycle.key)],
  })
    .populate("employeeId", "name employeeNo phone unitNo unitName departmentName designationName")
    .populate("paymentAccountId", "name code category")
    .populate("paymentHistory.paymentAccountId", "name code category")
    .sort({ segmentNo: 1, "employeeId.unitNo": 1, "employeeId.listOrder": 1, createdAt: 1 });
};

const derivePayrollDisplayStatus = (payroll, todayKey = getCurrentBusinessDateKey()) => {
  const remainingDue = roundMoney(payroll.remainingDue);

  if (payroll.status === "void") return "void";
  if (payroll.status === "draft") return "draft";
  if (remainingDue <= 0 || payroll.status === "paid") return "paid";

  const dueKey = getDateKeyFromValue(payroll.dueDate || payroll.salaryDate);

  if (dueKey && dueKey < todayKey) return "overdue";
  if (roundMoney(payroll.paidAmount) > 0 || payroll.status === "partially_paid") {
    return "partially_paid";
  }

  return "due";
};

const serializePayroll = (payroll, todayKey = getCurrentBusinessDateKey()) => {
  const obj = payroll?.toObject ? payroll.toObject() : { ...payroll };
  const employee = obj.employeeId && typeof obj.employeeId === "object" ? obj.employeeId : null;
  const baseCycleKey = getPayrollBaseCycleKey(obj);
  const segmentNo = getPayrollSegmentNo(obj);
  const storageKey = buildSegmentStorageKey(baseCycleKey, segmentNo);

  return {
    ...obj,
    baseCycleKey,
    segmentNo,
    storageKey,
    segmentStart: obj.segmentStart || obj.periodStart || "",
    segmentEnd: obj.segmentEnd || obj.periodEnd || "",
    employee,
    paymentHistory: Array.isArray(obj.paymentHistory) ? obj.paymentHistory : [],
    displayStatus: derivePayrollDisplayStatus(obj, todayKey),
  };
};

const buildPayrollSummary = (payrolls = []) =>
  payrolls.reduce(
    (summary, payroll) => {
      summary.employees += 1;
      summary.netPayroll = roundMoney(summary.netPayroll + Number(payroll.netSalary || 0));
      summary.paid = roundMoney(summary.paid + Number(payroll.paidAmount || 0));
      summary.remaining = roundMoney(summary.remaining + Number(payroll.remainingDue || 0));
      if (payroll.displayStatus === "overdue") summary.overdue += 1;
      return summary;
    },
    {
      employees: 0,
      netPayroll: 0,
      paid: 0,
      remaining: 0,
      overdue: 0,
    },
  );

const getCycleEarlyCloseMeta = (payrolls = []) => {
  const earlyClosedRows = payrolls.filter((payroll) => payroll.earlyClosed);

  if (earlyClosedRows.length === 0 || earlyClosedRows.length !== payrolls.length) {
    return {};
  }

  const throughDate =
    earlyClosedRows.find((payroll) => payroll.earlyCloseThroughDate)
      ?.earlyCloseThroughDate || "";
  const reason =
    earlyClosedRows.find((payroll) => payroll.earlyCloseReason)?.earlyCloseReason ||
    "";
  const closedAt =
    earlyClosedRows.find((payroll) => payroll.earlyClosedAt)?.earlyClosedAt || null;

  return {
    earlyClosed: true,
    earlyCloseThroughDate: throughDate,
    earlyCloseReason: reason,
    earlyClosedAt: closedAt,
  };
};

const getWeavingPayrollCycle = async ({
  userId,
  cycleKey,
  segmentNo,
  recordState = "active",
}) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  const todayKey = getCurrentBusinessDateKey();
  const decoratedCycle = decorateCycle(cycle, todayKey);
  const allPayrolls = (await loadPayrollsForBaseCycle({
    userId,
    cycleKey: cycle.key,
    recordState,
  })).map(
    (payroll) => serializePayroll(payroll, todayKey),
  );
  const segments = buildSegmentList({
    cycle,
    payrolls: allPayrolls,
    todayKey,
  });
  const selectedSegment = selectSegment({
    segments,
    requestedSegmentNo:
      segmentNo || (hasExplicitSegmentStorageKey(cycleKey) ? getPayrollSegmentNo(cycleKey) : ""),
  });
  const payrolls = allPayrolls.filter(
    (payroll) => getPayrollSegmentNo(payroll) === selectedSegment.segmentNo,
  );
  const resume = buildResumeState({ cycle, segments, todayKey });

  return {
    cycle: {
      ...decoratedCycle,
      periodStart: selectedSegment.periodStart,
      periodEnd: selectedSegment.periodEnd,
      originalPeriodStart: cycle.periodStart,
      originalPeriodEnd: cycle.periodEnd,
      baseCycleKey: cycle.key,
      storageKey: selectedSegment.storageKey,
      segmentNo: selectedSegment.segmentNo,
      segmentStart: selectedSegment.segmentStart,
      segmentEnd: selectedSegment.segmentEnd,
      segmentStatus: selectedSegment.displayStatus,
      calculationThroughDate:
        selectedSegment.calculationThroughDate || decoratedCycle.calculationThroughDate,
      ...getCycleEarlyCloseMeta(payrolls),
    },
    baseCycle: decoratedCycle,
    cycles: getCycleOptions(cycle.key).map((item) => decorateCycle(item, todayKey)),
    segments,
    selectedSegment,
    resume,
    recordState: normalizeText(recordState).toLowerCase() === "inactive"
      ? "inactive"
      : "active",
    payrolls,
    summary: buildPayrollSummary(payrolls),
  };
};

const generateWeavingPayrollCycle = async ({ userId, cycleKey, segmentNo }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  assertCycleCanGenerate(cycle);
  const selectedSegmentNo = Number.parseInt(segmentNo, 10) || getPayrollSegmentNo(cycleKey);

  await withTransaction(async (session) => {
    const context = await buildPayrollContext({
      userId,
      cycleKey: cycle.key,
      segmentNo: selectedSegmentNo,
      session,
    });

    if (context.existingPayrolls.some((payroll) => payroll.earlyClosed)) {
      throw createHttpError("Early-closed payroll cannot be recalculated.", 400);
    }

    const existingByEmployee = new Map(
      context.existingPayrolls.map((payroll) => [idOf(payroll.employeeId), payroll]),
    );

    for (const employee of context.employees) {
      const existingPayroll = existingByEmployee.get(idOf(employee._id));
      if (existingPayroll && isLockedPayroll(existingPayroll)) continue;

      const payroll =
        existingPayroll ||
        new EmployeePayroll({
          userId,
          moduleScope: WEAVING_SCOPE,
          employeeId: employee._id,
          periodKey: context.segment.storageKey,
          cycleKey: context.segment.storageKey,
          baseCycleKey: cycle.key,
          segmentNo: context.segment.segmentNo,
          segmentStart: context.segment.segmentStart,
          segmentEnd: context.segment.segmentEnd,
          salaryDate: parseBusinessDate(cycle.dueDate),
          dueDate: parseBusinessDate(cycle.dueDate),
          status: "draft",
        });
      const calculation = calculateForEmployee({ employee, payroll, context });
      const recoveryApplications = await loadFinanceRecoveriesForEmployee({
        userId,
        employee,
        cycle: context.cycle,
        payroll,
        availableSalary: calculation.netSalary,
        activeDraftRecoveryIds: context.activeDraftRecoveryIds,
        baseCycleRecoveryIds:
          context.baseCycleRecoveryIdsByEmployee.get(idOf(employee._id)) || new Set(),
        session,
      });

      applyCalculationToPayroll({
        payroll,
        employee,
        cycle: context.cycle,
        segment: context.segment,
        calculation,
        recoveryApplications,
      });
      await payroll.save({ session });
    }
  });

  return getWeavingPayrollCycle({
    userId,
    cycleKey: cycle.key,
    segmentNo: selectedSegmentNo,
  });
};

const loadSingleDraftContext = async ({ userId, payroll, session }) => {
  const context = await buildPayrollContext({
    userId,
    cycleKey: getPayrollBaseCycleKey(payroll),
    segmentNo: getPayrollSegmentNo(payroll),
    segmentStart: payroll.segmentStart || payroll.periodStart,
    calculationThroughDate: payroll.calculationThroughDate,
    session,
  });
  let employee = context.employees.find(
    (item) => idOf(item._id) === idOf(payroll.employeeId),
  );

  if (!employee) {
    employee = await getSessionQuery(
      Employee.findOne({
        _id: payroll.employeeId,
        userId,
        moduleScope: WEAVING_SCOPE,
      }).lean(),
      session,
    );
  }

  if (!employee) {
    throw createHttpError("Employee not found", 404);
  }

  return { context, employee };
};

const getWeavingPayrollById = async ({ userId, payrollId, includeInactive = false }) => {
  const payroll = await EmployeePayroll.findOne({
    _id: toObjectId(payrollId, "payroll"),
    userId,
    moduleScope: WEAVING_SCOPE,
    ...(includeInactive
      ? {}
      : { isDeleted: { $ne: true }, status: { $ne: "void" } }),
  })
    .populate("employeeId", "name employeeNo phone unitNo unitName departmentName designationName")
    .populate("paymentAccountId", "name code category")
    .populate("paymentHistory.paymentAccountId", "name code category");

  if (!payroll) {
    throw createHttpError("Payroll not found", 404);
  }

  return serializePayroll(payroll);
};

const updateWeavingPayroll = async ({ userId, payrollId, payload = {} }) => {
  let cycleKey = "";
  let segmentNo = 1;
  let touchedAccountIds = [];

  await withTransaction(async (session) => {
    const payroll = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: toObjectId(payrollId, "payroll"),
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
      }),
      session,
    );

    if (!payroll) {
      throw createHttpError("Payroll not found", 404);
    }

    if (payroll.status === "draft") {
      payroll.additions = normalizeManualAdditions(payload.additions);
      payroll.deductions = normalizeManualDeductions(payload.deductions);
      if (Object.prototype.hasOwnProperty.call(payload, "recoveryApplications")) {
        payroll.recoveryApplications = normalizeRecoveryApplications(payload.recoveryApplications);
      }
      payroll.notes = normalizeText(payload.notes ?? payroll.notes);

      const { context, employee } = await loadSingleDraftContext({ userId, payroll, session });
      const calculation = calculateForEmployee({ employee, payroll, context });
      const recoveryApplications = await loadFinanceRecoveriesForEmployee({
        userId,
        employee,
        cycle: context.cycle,
        payroll,
        availableSalary: calculation.netSalary,
        activeDraftRecoveryIds: context.activeDraftRecoveryIds,
        baseCycleRecoveryIds:
          context.baseCycleRecoveryIdsByEmployee.get(idOf(employee._id)) || new Set(),
        session,
      });

      applyCalculationToPayroll({
        payroll,
        employee,
        cycle: context.cycle,
        segment: context.segment,
        calculation,
        recoveryApplications,
      });
      payroll.notes = normalizeText(payload.notes ?? payroll.notes);
      await payroll.save({ session });
      cycleKey = context.cycle.key;
      segmentNo = context.segment.segmentNo;
      return;
    }

    if (!["posted", "finalized", "partially_paid", "paid"].includes(payroll.status)) {
      throw createHttpError("Inactive payroll cannot be adjusted.", 400);
    }

    const employee = await getSessionQuery(
      Employee.findOne({
        _id: payroll.employeeId,
        userId,
        moduleScope: WEAVING_SCOPE,
      }),
      session,
    );
    if (!employee) throw createHttpError("Employee not found", 404);

    const additions = normalizeManualAdditions(payload.additions);
    const deductions = normalizeManualDeductions(payload.deductions);
    const recoveries = Object.prototype.hasOwnProperty.call(payload, "recoveryApplications")
      ? normalizeRecoveryApplications(payload.recoveryApplications)
      : normalizeRecoveryApplications(payroll.recoveryApplications);
    const manualAdditionAmount = roundMoney(
      additions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    );
    const manualDeductionAmount = roundMoney(
      deductions.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    );
    const recoveryAmount = roundMoney(
      recoveries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0),
    );
    const fixedGross = roundMoney(
      Number(payroll.grossSalary || 0) - Number(payroll.manualAdditionAmount || 0),
    );
    const fixedAdditions = roundMoney(
      Number(payroll.totalAdditions || 0) - Number(payroll.manualAdditionAmount || 0),
    );
    const fixedDeductions = roundMoney(
      Number(payroll.totalDeductions || 0) -
        Number(payroll.manualDeductionAmount || 0) -
        Number(payroll.recoveryAmount || 0),
    );
    const grossSalary = roundMoney(fixedGross + manualAdditionAmount);
    const totalDeductions = roundMoney(
      fixedDeductions + manualDeductionAmount + recoveryAmount,
    );
    const netSalary = roundMoney(grossSalary - totalDeductions);
    if (netSalary < 0) {
      throw createHttpError("Payroll amounts cannot result in a negative salary.", 400);
    }

    const paymentState = await getActivePayrollPaymentState({
      userId,
      payroll,
      session,
    });
    if (paymentState.paidAmount > netSalary) {
      throw createHttpError(
        "Paid amount exceeds the corrected salary. Adjust/recover the payment first.",
        400,
      );
    }

    const reversalResult = await reverseJournals({
      journalIds: [payroll.journalEntryId],
      userId,
      date: getCurrentBusinessDateKey(),
      time: "",
      session,
    });
    touchedAccountIds.push(...reversalResult.accountIds);
    payroll.reversalJournalEntryIds = [
      ...(payroll.reversalJournalEntryIds || []),
      ...reversalResult.reversalIds,
    ];
    payroll.supersededJournalEntryIds = [
      ...(payroll.supersededJournalEntryIds || []),
      ...(payroll.journalEntryId ? [payroll.journalEntryId] : []),
    ];
    await reversePayrollRecoveries({ payroll, session });

    const salaryJournal = await createSalaryJournal({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      date: payroll.salaryDate,
      time: payroll.salaryTime,
      amount: roundMoney(netSalary + recoveryAmount),
      session,
    });
    const appliedRecoveries = await applyPayrollRecoveries({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      recoveries,
      journalEntryId: salaryJournal?._id || null,
      session,
    });
    if (salaryJournal) {
      touchedAccountIds.push(...collectAccountIdsFromJournal(salaryJournal));
    }

    payroll.additions = additions;
    payroll.deductions = deductions;
    payroll.recoveryApplications = appliedRecoveries;
    payroll.manualAdditionAmount = manualAdditionAmount;
    payroll.manualDeductionAmount = manualDeductionAmount;
    payroll.totalAdditions = roundMoney(fixedAdditions + manualAdditionAmount);
    payroll.totalDeductions = totalDeductions;
    payroll.recoveryAmount = recoveryAmount;
    payroll.grossSalary = grossSalary;
    payroll.netSalary = netSalary;
    payroll.paidAmount = paymentState.paidAmount;
    payroll.remainingDue = roundMoney(netSalary - paymentState.paidAmount);
    payroll.journalEntryId = salaryJournal?._id || null;
    payroll.status = paymentState.paidAmount > 0
      ? payroll.remainingDue <= 0
        ? "paid"
        : "partially_paid"
      : "finalized";
    payroll.notes = normalizeText(payload.notes ?? payroll.notes);
    await payroll.save({ session });
    cycleKey = getPayrollBaseCycleKey(payroll);
    segmentNo = getPayrollSegmentNo(payroll);
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return getWeavingPayrollCycle({ userId, cycleKey, segmentNo });
};

const finalizePayrollDocument = async ({
  userId,
  payroll,
  actorId,
  session,
  allowEarlyClose = false,
  earlyCloseMeta = null,
}) => {
  if (payroll.status !== "draft") {
    throw createHttpError("Only Draft payroll can be finalized.", 400);
  }

  if (!allowEarlyClose) {
    assertCycleCanFinalize(resolvePayrollCycle(getPayrollBaseCycleKey(payroll)));
  }

  if (payroll.attendanceIncomplete || payroll.finalizeBlockedReasons?.length) {
    throw createHttpError("Attendance Incomplete. Finalize is blocked.", 400);
  }

  const employee = await getSessionQuery(
    Employee.findOne({
      _id: payroll.employeeId,
      userId,
      moduleScope: WEAVING_SCOPE,
    }),
    session,
  );

  if (!employee) {
    throw createHttpError("Employee not found", 404);
  }

  const { businessDate, businessTime } = parseEntryDateTime({
    date: payroll.dueDate || payroll.salaryDate,
    time: payroll.salaryTime || "",
    label: "payroll date",
  });
  const journal = await createSalaryJournal({
    userId,
    moduleScope: WEAVING_SCOPE,
    employee,
    payroll,
    date: businessDate,
    time: businessTime,
    amount: roundMoney(Number(payroll.netSalary || 0) + Number(payroll.recoveryAmount || 0)),
    session,
  });
  const appliedRecoveries = await applyPayrollRecoveries({
    userId,
    moduleScope: WEAVING_SCOPE,
    employee,
    payroll,
    recoveries: payroll.recoveryApplications || [],
    journalEntryId: journal?._id || null,
    session,
  });

  payroll.salaryDate = parseBusinessDate(businessDate);
  payroll.salaryTime = businessTime;
  payroll.journalEntryId = journal?._id || null;
  payroll.recoveryApplications = appliedRecoveries;
  payroll.paidAmount = 0;
  payroll.remainingDue = roundMoney(payroll.netSalary);
  payroll.status = payroll.remainingDue <= 0 ? "paid" : "finalized";
  payroll.finalizedAt = new Date();
  payroll.finalizedBy = actorId || userId;

  if (earlyCloseMeta) {
    payroll.earlyClosed = true;
    payroll.earlyCloseThroughDate = earlyCloseMeta.throughDate;
    payroll.earlyCloseReason = earlyCloseMeta.reason;
    payroll.earlyClosedAt = earlyCloseMeta.closedAt || payroll.finalizedAt;
    payroll.earlyClosedBy = earlyCloseMeta.closedBy || actorId || userId;
  }

  await payroll.save({ session });

  return journal ? collectAccountIdsFromJournal(journal) : [];
};

const finalizeWeavingPayroll = async ({ userId, payrollId, actorId }) => {
  let touchedAccountIds = [];
  let cycleKey = "";
  let segmentNo = 1;

  await withTransaction(async (session) => {
    const payroll = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: toObjectId(payrollId, "payroll"),
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
      }),
      session,
    );

    if (!payroll) {
      throw createHttpError("Payroll not found", 404);
    }

    cycleKey = getPayrollBaseCycleKey(payroll);
    segmentNo = getPayrollSegmentNo(payroll);
    touchedAccountIds = await finalizePayrollDocument({
      userId,
      payroll,
      actorId,
      session,
    });
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return getWeavingPayrollCycle({
    userId,
    cycleKey,
    segmentNo,
  });
};

const finalizeWeavingPayrollCycle = async ({ userId, cycleKey, segmentNo, actorId }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  assertCycleCanFinalize(cycle);
  const selectedSegmentNo = Number.parseInt(segmentNo, 10) || getPayrollSegmentNo(cycleKey);
  const storageKey = buildSegmentStorageKey(cycle.key, selectedSegmentNo);
  const result = {
    finalizedCount: 0,
    skippedCount: 0,
    netAmount: 0,
  };
  let touchedAccountIds = [];

  await withTransaction(async (session) => {
    const payrolls = await getSessionQuery(
      EmployeePayroll.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        $or: [{ cycleKey: storageKey }, { periodKey: storageKey }],
      }),
      session,
    );

    for (const payroll of payrolls) {
      if (payroll.status !== "draft") {
        result.skippedCount += 1;
        continue;
      }

      if (payroll.attendanceIncomplete || payroll.finalizeBlockedReasons?.length) {
        result.skippedCount += 1;
        continue;
      }

      const accountIds = await finalizePayrollDocument({
        userId,
        payroll,
        actorId,
        session,
      });
      touchedAccountIds.push(...accountIds);
      result.finalizedCount += 1;
      result.netAmount = roundMoney(result.netAmount + Number(payroll.netSalary || 0));
    }
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return {
    ...result,
    ...(await getWeavingPayrollCycle({
      userId,
      cycleKey: cycle.key,
      segmentNo: selectedSegmentNo,
    })),
  };
};

const earlyCloseWeavingPayrollCycle = async ({ userId, cycleKey, segmentNo, reason, actorId }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  const selectedSegmentNo = Number.parseInt(segmentNo, 10) || getPayrollSegmentNo(cycleKey);
  const storageKey = buildSegmentStorageKey(cycle.key, selectedSegmentNo);
  const result = {
    finalizedCount: 0,
    netAmount: 0,
    earlyCloseThroughDate: "",
  };
  let touchedAccountIds = [];
  let earlyCloseMeta = null;

  await withTransaction(async (session) => {
    const payrolls = await getSessionQuery(
      EmployeePayroll.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        $or: [{ cycleKey: storageKey }, { periodKey: storageKey }],
      }),
      session,
    );
    const eligibility = validateEarlyCloseEligibility({
      cycle,
      payrolls,
      reason,
    });
    earlyCloseMeta = {
      throughDate: eligibility.throughDate,
      reason: eligibility.reason,
      closedAt: new Date(),
      closedBy: actorId || userId,
    };

    for (const payroll of eligibility.draftPayrolls) {
      const accountIds = await finalizePayrollDocument({
        userId,
        payroll,
        actorId,
        session,
        allowEarlyClose: true,
        earlyCloseMeta,
      });

      touchedAccountIds.push(...accountIds);
      result.finalizedCount += 1;
      result.netAmount = roundMoney(result.netAmount + Number(payroll.netSalary || 0));
    }

    result.earlyCloseThroughDate = earlyCloseMeta.throughDate;
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return {
    ...result,
    ...(await getWeavingPayrollCycle({
      userId,
      cycleKey: cycle.key,
      segmentNo: selectedSegmentNo,
    })),
  };
};

const assertNoLaterFinalizedPayroll = async ({ userId, cycle, session }) => {
  const rows = await getSessionQuery(
    EmployeePayroll.find({
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
      status: { $in: ["posted", "finalized", "partially_paid", "paid"] },
    })
      .select("cycleKey periodKey baseCycleKey")
      .lean(),
    session,
  );
  const currentIndex = getCycleIndex(cycle);
  const hasLaterFinalized = rows.some((payroll) => {
    const baseCycleKey = getPayrollBaseCycleKey(payroll);
    const payrollCycle = resolveRecoveryCycle(baseCycleKey);

    return payrollCycle && getCycleIndex(payrollCycle) > currentIndex;
  });

  if (hasLaterFinalized) {
    throw createHttpError(
      "A later payroll cycle is already finalized. Resolve the previous cycle before resuming it.",
      409,
    );
  }
};

const resumeWeavingPayrollCycle = async ({
  userId,
  cycleKey,
  resumeFrom,
  calculateThrough,
  note = "",
  actorId,
}) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  let selectedSegmentNo = 1;
  let createdCount = 0;

  await withTransaction(async (session) => {
    const basePayrolls = await getSessionQuery(
      EmployeePayroll.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        ...buildBaseCyclePayrollQuery(cycle.key),
      }),
      session,
    );
    const todayKey = getCurrentBusinessDateKey();
    const segments = buildSegmentList({
      cycle,
      payrolls: basePayrolls,
      todayKey,
    });
    const activeDraft = segments.find((segment) => segment.hasDraft);

    if (activeDraft && activeDraft.segmentNo > 1) {
      selectedSegmentNo = activeDraft.segmentNo;
      return;
    }

    const resumeState = buildResumeState({ cycle, segments, todayKey });
    const latest = segments[segments.length - 1];

    if (!resumeState.canResume || !latest?.earlyClosed) {
      throw createHttpError("Payroll cannot be resumed from the current closing.", 400);
    }

    if (!normalizeText(resumeFrom)) {
      throw createHttpError("Resume From is required.", 400);
    }

    const cleanResumeFrom = getBusinessDateKey(resumeFrom);
    const maxThroughDate = resumeState.maxResumeDate;
    const cleanCalculateThrough = calculateThrough
      ? getBusinessDateKey(calculateThrough)
      : maxThroughDate;

    if (
      cleanResumeFrom <= latest.effectiveEnd ||
      cleanResumeFrom < cycle.periodStart ||
      cleanResumeFrom > cycle.periodEnd
    ) {
      throw createHttpError("Resume From must be after the previous closing and inside the original cycle.", 400);
    }

    if (cleanResumeFrom > maxThroughDate || cleanCalculateThrough > maxThroughDate) {
      throw createHttpError("Resume From cannot be in the future or beyond the original cycle.", 400);
    }

    if (cleanCalculateThrough < cleanResumeFrom) {
      throw createHttpError("Calculate Through must be on or after Resume From.", 400);
    }

    await assertNoLaterFinalizedPayroll({ userId, cycle, session });

    selectedSegmentNo = resumeState.nextSegmentNo;
    const context = await buildPayrollContext({
      userId,
      cycleKey: cycle.key,
      segmentNo: selectedSegmentNo,
      segmentStart: cleanResumeFrom,
      calculationThroughDate: cleanCalculateThrough,
      session,
    });
    const existingByEmployee = new Map(
      context.existingPayrolls.map((payroll) => [idOf(payroll.employeeId), payroll]),
    );

    for (const employee of context.employees) {
      const existingPayroll = existingByEmployee.get(idOf(employee._id));
      if (existingPayroll && isLockedPayroll(existingPayroll)) continue;

      const payroll =
        existingPayroll ||
        new EmployeePayroll({
          userId,
          moduleScope: WEAVING_SCOPE,
          employeeId: employee._id,
          periodKey: context.segment.storageKey,
          cycleKey: context.segment.storageKey,
          baseCycleKey: cycle.key,
          segmentNo: selectedSegmentNo,
          segmentStart: cleanResumeFrom,
          segmentEnd: cycle.periodEnd,
          resumedAt: new Date(),
          resumedBy: actorId || userId,
          resumeNote: normalizeText(note),
          salaryDate: parseBusinessDate(cycle.dueDate),
          dueDate: parseBusinessDate(cycle.dueDate),
          status: "draft",
        });
      const calculation = calculateForEmployee({ employee, payroll, context });
      const recoveryApplications = await loadFinanceRecoveriesForEmployee({
        userId,
        employee,
        cycle: context.cycle,
        payroll,
        availableSalary: calculation.netSalary,
        activeDraftRecoveryIds: context.activeDraftRecoveryIds,
        baseCycleRecoveryIds:
          context.baseCycleRecoveryIdsByEmployee.get(idOf(employee._id)) || new Set(),
        session,
      });

      applyCalculationToPayroll({
        payroll,
        employee,
        cycle: context.cycle,
        segment: context.segment,
        calculation,
        recoveryApplications,
      });
      payroll.resumedAt = payroll.resumedAt || new Date();
      payroll.resumedBy = payroll.resumedBy || actorId || userId;
      payroll.resumeNote = normalizeText(note || payroll.resumeNote);
      await payroll.save({ session });
      createdCount += existingPayroll ? 0 : 1;
    }
  });

  return {
    resumedCount: createdCount,
    ...(await getWeavingPayrollCycle({
      userId,
      cycleKey: cycle.key,
      segmentNo: selectedSegmentNo,
    })),
  };
};

const payWeavingPayroll = async ({ userId, payrollId, payload = {}, actorId }) => {
  let touchedAccountIds = [];
  let cycleKey = "";
  let segmentNo = 1;

  await withTransaction(async (session) => {
    const payroll = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: toObjectId(payrollId, "payroll"),
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        status: { $in: ["posted", "finalized", "partially_paid", "paid"] },
      }),
      session,
    );

    if (!payroll) {
      throw createHttpError("Payroll not found", 404);
    }

    const amount = roundMoney(payload.amount);
    const remainingDue = roundMoney(payroll.remainingDue);
    const receiver = normalizePaymentReceiver(payload);
    const { businessDate, businessTime } = parseEntryDateTime({
      date: payload.paymentDate || getCurrentBusinessDateKey(),
      time: payload.paymentTime || "",
      label: "salary payment date",
    });

    if (amount <= 0 || amount > remainingDue) {
      throw createHttpError("Pay Amount cannot exceed Remaining Due.", 400);
    }

    const employee = await getSessionQuery(
      Employee.findOne({
        _id: payroll.employeeId,
        userId,
        moduleScope: WEAVING_SCOPE,
      }),
      session,
    );

    if (!employee) {
      throw createHttpError("Employee not found", 404);
    }

    const paymentAccount = await validatePaymentAccount({
      userId,
      moduleScope: WEAVING_SCOPE,
      paymentAccountId: payload.paymentAccountId,
      session,
    });
    const journal = await createSalaryPaymentJournal({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      paymentAccount,
      date: businessDate,
      time: businessTime,
      amount,
      description: buildPaymentJournalDescription({ employee, payroll, receiver }),
      session,
    });

    payroll.paymentJournalEntryIds = [
      ...(payroll.paymentJournalEntryIds || []),
      journal._id,
    ];
    payroll.paymentAccountId = paymentAccount._id;
    payroll.paymentType = getPaymentTypeFromAccount(paymentAccount);
    payroll.paidAmount = roundMoney(Number(payroll.paidAmount || 0) + amount);
    payroll.remainingDue = roundMoney(Number(payroll.netSalary || 0) - payroll.paidAmount);
    payroll.status = payroll.remainingDue <= 0 ? "paid" : "partially_paid";
    appendPayrollPaymentHistory({
      payroll,
      amount,
      paymentAccount,
      paymentType: payroll.paymentType,
      paymentDate: businessDate,
      paymentTime: businessTime,
      receiver,
      note: payload.note || payload.description || "",
      journalEntryId: journal._id,
      paidBy: actorId || userId,
    });
    await payroll.save({ session });

    cycleKey = getPayrollBaseCycleKey(payroll);
    segmentNo = getPayrollSegmentNo(payroll);
    touchedAccountIds = collectAccountIdsFromJournal(journal);
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return getWeavingPayrollCycle({ userId, cycleKey, segmentNo });
};

const voidWeavingPayroll = async ({ userId, payrollId, payload = {}, actorId }) => {
  let touchedAccountIds = [];
  let cycleKey = "";
  let segmentNo = 1;

  await withTransaction(async (session) => {
    const payroll = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: toObjectId(payrollId, "payroll"),
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
      }),
      session,
    );

    if (!payroll) {
      throw createHttpError("Payroll not found", 404);
    }

    cycleKey = getPayrollBaseCycleKey(payroll);
    segmentNo = getPayrollSegmentNo(payroll);

    await reversePayrollRecoveries({ payroll, session });
    const journalIds = [
      payroll.journalEntryId,
      ...(payroll.paymentJournalEntryIds || []),
    ].filter(Boolean);
    const reversalResult = await reverseJournals({
      journalIds,
      userId,
      date: getCurrentBusinessDateKey(),
      time: "",
      session,
    });

    touchedAccountIds = reversalResult.accountIds;
    payroll.reversalJournalEntryIds = [
      ...(payroll.reversalJournalEntryIds || []),
      ...reversalResult.reversalIds,
    ];
    payroll.statusBeforeVoid = payroll.status;
    payroll.supersededJournalEntryIds = [
      ...(payroll.supersededJournalEntryIds || []),
      ...journalIds,
    ];
    payroll.status = "void";
    payroll.isDeleted = true;
    payroll.voidedAt = new Date();
    payroll.voidedBy = actorId || userId;
    payroll.voidReason = normalizeText(payload.reason);
    await payroll.save({ session });
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return getWeavingPayrollCycle({ userId, cycleKey, segmentNo });
};

const restoreWeavingPayroll = async ({ userId, payrollId, actorId }) => {
  let touchedAccountIds = [];
  let cycleKey = "";
  let segmentNo = 1;

  await withTransaction(async (session) => {
    const payroll = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: toObjectId(payrollId, "payroll"),
        userId,
        moduleScope: WEAVING_SCOPE,
        $or: [{ isDeleted: true }, { status: "void" }],
      }),
      session,
    );
    if (!payroll) throw createHttpError("Inactive payroll not found", 404);

    const conflict = await getSessionQuery(
      EmployeePayroll.findOne({
        _id: { $ne: payroll._id },
        userId,
        moduleScope: WEAVING_SCOPE,
        employeeId: payroll.employeeId,
        $or: [
          { cycleKey: payroll.cycleKey },
          { periodKey: payroll.periodKey },
        ],
        isDeleted: { $ne: true },
        status: { $ne: "void" },
      }).select("_id"),
      session,
    );
    if (conflict) {
      throw createHttpError(
        "An active payroll already exists for this employee and cycle segment.",
        409,
      );
    }

    const employee = await getSessionQuery(
      Employee.findOne({
        _id: payroll.employeeId,
        userId,
        moduleScope: WEAVING_SCOPE,
      }),
      session,
    );
    if (!employee) throw createHttpError("Employee not found", 404);

    const oldJournalIds = [
      payroll.journalEntryId,
      ...(payroll.paymentJournalEntryIds || []),
    ].filter(Boolean);
    const salaryJournal = await createSalaryJournal({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      date: payroll.salaryDate,
      time: payroll.salaryTime,
      amount: roundMoney(
        Number(payroll.netSalary || 0) + Number(payroll.recoveryAmount || 0),
      ),
      session,
    });
    const restoredRecoveries = await applyPayrollRecoveries({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      recoveries: payroll.recoveryApplications || [],
      journalEntryId: salaryJournal?._id || null,
      session,
    });
    const restoredPayments = await recreatePayrollPaymentJournals({
      userId,
      moduleScope: WEAVING_SCOPE,
      employee,
      payroll,
      actorId,
      session,
    });

    if (salaryJournal) {
      touchedAccountIds.push(...collectAccountIdsFromJournal(salaryJournal));
    }
    touchedAccountIds.push(...restoredPayments.accountIds);
    payroll.supersededJournalEntryIds = [
      ...(payroll.supersededJournalEntryIds || []),
      ...oldJournalIds,
    ];
    payroll.journalEntryId = salaryJournal?._id || null;
    payroll.paymentJournalEntryIds = restoredPayments.paymentJournalEntryIds;
    payroll.paymentHistory = restoredPayments.paymentHistory;
    payroll.paymentAccountId = restoredPayments.paymentAccountId;
    payroll.paymentType = restoredPayments.paymentType;
    payroll.recoveryApplications = restoredRecoveries;
    payroll.paidAmount = restoredPayments.paidAmount;
    payroll.remainingDue = roundMoney(
      Number(payroll.netSalary || 0) - restoredPayments.paidAmount,
    );
    payroll.status = restoredPayments.paidAmount > 0
      ? payroll.remainingDue <= 0
        ? "paid"
        : "partially_paid"
      : ["posted", "finalized"].includes(payroll.statusBeforeVoid)
        ? payroll.statusBeforeVoid
        : "finalized";
    payroll.isDeleted = false;
    payroll.voidedAt = null;
    payroll.voidedBy = null;
    payroll.voidReason = "";
    await payroll.save({ session });
    cycleKey = getPayrollBaseCycleKey(payroll);
    segmentNo = getPayrollSegmentNo(payroll);
  });

  await recalculateTouchedAccounts(touchedAccountIds);
  return getWeavingPayrollCycle({ userId, cycleKey, segmentNo });
};

const getWeavingPayrollSummary = async ({ userId, cycleKey = "", segmentNo }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey || getCurrentCycleKey()));
  const cyclePayload = await getWeavingPayrollCycle({
    userId,
    cycleKey: cycle.key,
    segmentNo,
  });
  const todayKey = getCurrentBusinessDateKey();
  const storageKey = cyclePayload.cycle.storageKey || buildSegmentStorageKey(cycle.key, segmentNo || 1);
  const overdueCount = await EmployeePayroll.countDocuments({
    userId,
    moduleScope: WEAVING_SCOPE,
    isDeleted: false,
    $or: [{ cycleKey: storageKey }, { periodKey: storageKey }],
    status: { $in: ["posted", "finalized", "partially_paid"] },
    remainingDue: { $gt: 0 },
    dueDate: { $lt: parseBusinessDate(todayKey) },
  });

  return {
    cycle: cyclePayload.cycle,
    netPayroll: cyclePayload.summary.netPayroll,
    paid: cyclePayload.summary.paid,
    remaining: cyclePayload.summary.remaining,
    overdue: overdueCount,
  };
};

module.exports = {
  calculateEmployeePayroll,
  buildSegmentStorageKey,
  derivePayrollDisplayStatus,
  earlyCloseWeavingPayrollCycle,
  generateWeavingPayrollCycle,
  getCycleOptions,
  getCycleRuntime,
  getCurrentCycleKey,
  getPayrollBaseCycleKey,
  getPayrollSegmentNo,
  getWeavingPayrollById,
  getWeavingPayrollCycle,
  getWeavingPayrollSummary,
  finalizeWeavingPayroll,
  finalizeWeavingPayrollCycle,
  payWeavingPayroll,
  restoreWeavingPayroll,
  resumeWeavingPayrollCycle,
  resolvePayrollCycle,
  updateWeavingPayroll,
  voidWeavingPayroll,
  _test: {
    aggregateAttendanceByEmployeeDate,
    appendPayrollPaymentHistory,
    assertCycleCanFinalize,
    assertCycleCanGenerate,
    buildRecoveryApplicationsForPayroll,
    calculateEmployeePayroll,
    derivePayrollDisplayStatus,
    buildSegmentStorageKey,
    getPayrollBaseCycleKey,
    getPayrollSegmentNo,
    getCycleIndex,
    getCycleRuntime,
    isFinanceEntryEligibleForCycle,
    collectHistoricalPayrollEmployeeIds,
    listDateKeys,
    normalizePaymentReceiver,
    normalizeRecoveryApplications,
    resolvePayrollCycle,
    serializePayroll,
    validateEarlyCloseEligibility,
  },
};
