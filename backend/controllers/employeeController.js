const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const EmployeeAdvanceLoan = require("../models/EmployeeAdvanceLoan");
const EmployeeDesignation = require("../models/EmployeeDesignation");
const EmployeePayroll = require("../models/EmployeePayroll");
const WeavingDepartment = require("../models/WeavingDepartment");
const WeavingShift = require("../models/WeavingShift");
const WeavingUnit = require("../models/WeavingUnit");
const JournalEntry = require("../models/JournalEntry");
const { logActivity } = require("../utils/activityLogger");
const { generatePdfFromHtml } = require("../services/pdfService");
const { clearUserDashboardCache } = require("../services/dashboardCacheService");
const {
  clearTravelReportCache,
} = require("../services/travel/travelReportCacheService");
const {
  appendEmployeeBalances,
  calculatePayrollTotals,
  collectAccountIdsFromJournal,
  createAdvanceLoanJournal,
  createHttpError,
  createRecoveryJournal,
  createSalaryJournal,
  createSalaryPaymentJournal,
  ensureEmployeeAccount,
  applyPayrollRecoveries,
  getEmployeeFinancialSummary,
  getEmployeeLedgersSummary,
  getEmployeeLedger,
  getOriginValuesForScope,
  getModuleScopeFromRequest,
  getPaymentTypeFromAccount,
  getActivePayrollPaymentState,
  getSessionQuery,
  parseEntryDateTime,
  recalculateTouchedAccounts,
  recreatePayrollPaymentJournals,
  reverseJournals,
  reversePayrollRecoveries,
  roundMoney,
  syncEmployeeAccountName,
  validateEmployee,
  validatePaymentAccount,
} = require("../services/employee/employeeAccountingService");
const {
  earlyCloseWeavingPayrollCycle,
  finalizeWeavingPayroll,
  finalizeWeavingPayrollCycle,
  generateWeavingPayrollCycle,
  getWeavingPayrollById,
  getWeavingPayrollCycle,
  getWeavingPayrollSummary,
  payWeavingPayroll,
  restoreWeavingPayroll,
  resumeWeavingPayrollCycle,
  updateWeavingPayroll,
  voidWeavingPayroll,
} = require("../services/weaving/weavingPayrollService");

const DEFAULT_DESIGNATIONS = [
  "Manager",
  "Accountant",
  "Sales Executive",
  "Travel Consultant",
  "Visa Officer",
  "Ticketing Officer",
  "Driver",
  "Office Assistant",
];

const DEFAULT_WEAVING_DEPARTMENTS = [
  "Weaving",
  "Folding",
  "Electrical",
  "Mechanical / Maintenance",
  "Store",
  "Godown",
  "Beam / Loading",
  "Security",
  "Administration",
  "Cleaning / General Labour",
];

const DEFAULT_WEAVING_DESIGNATIONS = [
  "Master",
  "Foreman",
  "Mechanic",
  "Cleaner",
  "Weaver",
  "Electrician",
  "Electrician Helper",
  "Security Guard",
  "Helper",
  "Oil Man",
  "Winder",
  "Carpenter",
  "Beam Loader",
  "Beam Knotting Worker",
];

const DEFAULT_WEAVING_SHIFTS = ["General Shift", "Night Shift"];
const WEAVING_SCOPE = "weaving";
const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];
const SALARY_CYCLE_PATTERN = /^(\d{4})-(\d{2})-H([12])$/i;

const getUserId = (req) => req.user?.id || req.userId;

const sendError = (res, error, fallback = "Request failed") => {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    message: error.message || fallback,
  });
};

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const normalizeText = (value = "") => String(value || "").trim();

const normalizeStatus = (value = "active") =>
  value === "inactive" ? "inactive" : "active";

const isWeavingScope = (moduleScope) => moduleScope === WEAVING_SCOPE;

const escapeRegex = (value = "") =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeGender = (value = "") => {
  const gender = normalizeText(value).toLowerCase();

  return ["male", "female", "other"].includes(gender) ? gender : "";
};

const normalizeUnitNo = (value) => {
  const number = Number.parseInt(value, 10);

  if (!Number.isFinite(number) || number <= 0) {
    throw createHttpError("Unit Number is required", 400);
  }

  return number;
};

const normalizeListOrder = (value) => {
  const number = Number.parseInt(value, 10);

  return Number.isFinite(number) && number > 0 ? number : 0;
};

const normalizeCnic = (value = "") => {
  const text = normalizeText(value);
  if (!text) return "";

  const digits = text.replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }

  return text;
};

const assertValidCnic = (cnic) => {
  if (!cnic) return;

  if (!/^\d{5}-\d{7}-\d$/.test(cnic)) {
    throw createHttpError("CNIC format should be 35202-1234567-1", 400);
  }
};

const pad2 = (value) => String(value).padStart(2, "0");

const deriveSalaryCycleTarget = (cycleKey = "") => {
  const match = normalizeText(cycleKey).match(SALARY_CYCLE_PATTERN);

  if (!match) {
    throw createHttpError("Salary Cycle is required", 400);
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const half = match[3];

  if (month < 1 || month > 12) {
    throw createHttpError("Salary Cycle is invalid", 400);
  }

  const payYear = half === "1" || month < 12 ? year : year + 1;
  const payMonth = half === "1" ? month : month === 12 ? 1 : month + 1;
  const payDay = half === "1" ? "22" : "07";
  const payDateKey = `${payYear}-${pad2(payMonth)}-${payDay}`;

  return {
    targetCycleKey: `${year}-${pad2(month)}-H${half}`,
    targetPayDate: new Date(`${payDateKey}T00:00:00.000Z`),
  };
};

const getCycleHalfFromKey = (cycleKey = "") =>
  normalizeText(cycleKey).endsWith("H2") ? "H2" : "H1";

const normalizeRecoveryFrequency = (kind, value = "") => {
  const frequency = normalizeText(value).toLowerCase();

  if (kind === "loan") {
    if (["every_payroll_cycle", "monthly"].includes(frequency)) {
      return frequency;
    }

    throw createHttpError("Loan recovery frequency is required", 400);
  }

  return frequency === "one_time" ? "one_time" : "carry_forward";
};

const buildWeavingRecoveryPlan = ({ kind, payload = {} }) => {
  const source = payload.recoveryPlan || {};

  if (kind === "loan") {
    const installmentAmount = roundMoney(
      source.installmentAmount ?? payload.installmentAmount,
    );

    if (installmentAmount <= 0) {
      throw createHttpError("Installment Amount must be greater than zero", 400);
    }

    const firstCycle = deriveSalaryCycleTarget(
      source.firstCycleKey ?? payload.firstCycleKey ?? payload.targetCycleKey,
    );
    const frequency = normalizeRecoveryFrequency(
      kind,
      source.frequency ?? payload.recoveryFrequency ?? payload.frequency,
    );

    return {
      frequency,
      installmentAmount,
      firstCycleKey: firstCycle.targetCycleKey,
      targetCycleKey: "",
      anchorHalf: getCycleHalfFromKey(firstCycle.targetCycleKey),
    };
  }

  const target = deriveSalaryCycleTarget(
    source.targetCycleKey ?? payload.targetCycleKey ?? payload.firstCycleKey,
  );

  return {
    frequency: normalizeRecoveryFrequency(
      kind,
      source.frequency ?? payload.recoveryFrequency ?? payload.frequency,
    ),
    installmentAmount: 0,
    firstCycleKey: "",
    targetCycleKey: target.targetCycleKey,
    anchorHalf: getCycleHalfFromKey(target.targetCycleKey),
  };
};

const normalizeWeavingSalaryType = (value = "") =>
  normalizeText(value).toLowerCase() === "daily" ? "daily" : "monthly";

const normalizeDutyHours = (value) => {
  if (value === undefined || value === null || value === "") return 0;

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || number > 24) {
    throw createHttpError("Duty Hours must be between 0 and 24", 400);
  }

  return number;
};

const normalizeWeeklyOffDays = (value) => {
  const source = parseArrayField(value);
  const seen = new Set();

  return source.reduce((days, day) => {
    const normalized = normalizeText(day).toLowerCase();

    if (WEEKDAY_KEYS.includes(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      days.push(normalized);
    }

    return days;
  }, []);
};

const normalizePaidLeaveAllowance = (value) => {
  if (value === undefined || value === null || value === "") return 0;

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || !Number.isInteger(number)) {
    throw createHttpError("Paid Leave Allowance must be a whole number", 400);
  }

  return number;
};

const normalizeOtAllowed = (value) => {
  if (value === undefined || value === null || value === "") return true;
  if (typeof value === "boolean") return value;

  return !["false", "0", "no"].includes(normalizeText(value).toLowerCase());
};

const KNOTTING_PAYMENT_METHODS = [
  "monthly",
  "per_beam",
  "per_set",
  "monthly_per_beam",
  "monthly_per_set",
];

const normalizeKnottingPaymentMethod = (value) =>
  KNOTTING_PAYMENT_METHODS.includes(normalizeText(value).toLowerCase())
    ? normalizeText(value).toLowerCase()
    : "monthly";

const normalizeOpeningBalance = (payload = {}) => {
  const source = payload.openingBalance || {};
  const amount = roundMoney(source.amount ?? payload.openingBalanceAmount);

  if (amount < 0) {
    throw createHttpError("Opening Balance amount cannot be negative", 400);
  }

  if (!amount || amount <= 0) {
    return {
      amount: 0,
      type: "",
      deductionIntent: "",
      recordedAt: null,
      targetCycleKey: "",
      targetPayDate: null,
    };
  }

  const type = normalizeText(source.type || payload.openingBalanceType).toLowerCase();
  if (!["payable", "receivable"].includes(type)) {
    throw createHttpError("Opening Balance type is required", 400);
  }

  const requestedDeductionIntent = normalizeText(
    source.deductionIntent || payload.openingBalanceDeductionIntent,
  ).toLowerCase();
  const deductionIntent =
    type === "receivable" && requestedDeductionIntent === "manual_review"
      ? "manual_review"
      : type === "receivable"
        ? "future_salary"
        : "";
  const target =
    deductionIntent === "manual_review"
      ? deriveSalaryCycleTarget(source.targetCycleKey ?? payload.openingBalanceTargetCycleKey)
      : { targetCycleKey: "", targetPayDate: null };

  return {
    amount,
    type,
    deductionIntent,
    recordedAt: new Date(),
    ...target,
  };
};

const getNextEmployeeNo = async ({ userId, moduleScope, session }) => {
  const rows = await getSessionQuery(
    Employee.find({
      userId,
      moduleScope,
      employeeNo: /^EMP-\d+$/i,
    })
      .select("employeeNo")
      .lean(),
    session,
  );

  const maxNumber = rows.reduce((max, employee) => {
    const match = String(employee.employeeNo || "").match(/^EMP-(\d+)$/i);

    return match ? Math.max(max, Number.parseInt(match[1], 10) || 0) : max;
  }, 0);

  return `EMP-${String(maxNumber + 1).padStart(3, "0")}`;
};

const getNextListOrder = async ({ userId, moduleScope, unitId, session }) => {
  if (!unitId) return 1;

  const latest = await getSessionQuery(
    Employee.findOne({
      userId,
      moduleScope,
      unitId,
    })
      .sort({ listOrder: -1 })
      .select("listOrder")
      .lean(),
    session,
  );

  return Number(latest?.listOrder || 0) + 1;
};

const assertUniqueEmployeeIdentity = async ({
  userId,
  moduleScope,
  employeeId,
  employeeNo,
  cnic,
  session,
}) => {
  const notCurrent = employeeId
    ? { _id: { $ne: new mongoose.Types.ObjectId(employeeId) } }
    : {};

  if (employeeNo) {
    const duplicateEmployeeNo = await getSessionQuery(
      Employee.findOne({
        userId,
        moduleScope,
        employeeNo,
        ...notCurrent,
      }).select("_id"),
      session,
    );

    if (duplicateEmployeeNo) {
      throw createHttpError("Employee Number already exists", 409);
    }
  }

  if (cnic) {
    const duplicateCnic = await getSessionQuery(
      Employee.findOne({
        userId,
        moduleScope,
        cnic,
        ...notCurrent,
      }).select("_id"),
      session,
    );

    if (duplicateCnic) {
      throw createHttpError("CNIC already exists for another employee", 409);
    }
  }
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

const clearModuleCaches = (userId, moduleScope) => {
  if (moduleScope === "travel") {
    clearTravelReportCache(userId);
  }

  if (moduleScope === "trading") {
    clearUserDashboardCache(userId);
  }
};

const ensureDefaultWeavingRecords = async ({ Model, userId, names }) => {
  await Promise.all(
    names.map((name) =>
      Model.findOneAndUpdate(
        {
          userId,
          moduleScope: WEAVING_SCOPE,
          normalizedName: name.toLowerCase(),
          isDeleted: false,
        },
        {
          $setOnInsert: {
            userId,
            moduleScope: WEAVING_SCOPE,
            name,
            normalizedName: name.toLowerCase(),
            isActive: true,
          },
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true,
        },
      ),
    ),
  );
};

const ensureDefaultWeavingMasters = async (userId) => {
  await Promise.all([
    ensureDefaultWeavingRecords({
      Model: WeavingDepartment,
      userId,
      names: DEFAULT_WEAVING_DEPARTMENTS,
    }),
    ensureDefaultWeavingRecords({
      Model: WeavingShift,
      userId,
      names: DEFAULT_WEAVING_SHIFTS,
    }),
  ]);
};

const buildNameMasterPayload = (payload = {}, label = "Name") => {
  const name = normalizeText(payload.name);

  if (!name) {
    throw createHttpError(`${label} is required`, 400);
  }

  return {
    name,
    normalizedName: name.toLowerCase(),
    isActive: payload.isActive !== false,
  };
};

const normalizeShiftTime = (value = "") => {
  const time = normalizeText(value);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : "";
};

const buildShiftPayload = (payload = {}) => ({
  ...buildNameMasterPayload(payload, "Shift"),
  startTime: normalizeShiftTime(payload.startTime),
  endTime: normalizeShiftTime(payload.endTime),
});

const getWeavingMaster = async ({ Model, userId, id, label, session }) => {
  if (!id) {
    throw createHttpError(`${label} is required`, 400);
  }

  const record = await getSessionQuery(
    Model.findOne({
      _id: id,
      userId,
      moduleScope: WEAVING_SCOPE,
      isDeleted: false,
    }),
    session,
  );

  if (!record) {
    throw createHttpError(`${label} not found`, 404);
  }

  return record;
};

const assertWeavingEmployeeScope = (moduleScope) => {
  if (!isWeavingScope(moduleScope)) {
    throw createHttpError(
      "Weaving employee master data is not available here",
      404,
    );
  }
};

const buildUnitPayload = (payload = {}) => ({
  unitNo: normalizeUnitNo(payload.unitNo),
  name: normalizeText(payload.name),
  isActive: payload.isActive !== false,
});

const assertMasterNotAssigned = async ({ userId, field, value, label }) => {
  const assignedCount = await Employee.countDocuments({
    userId,
    moduleScope: WEAVING_SCOPE,
    [field]: value,
  });

  if (assignedCount > 0) {
    throw createHttpError(`${label} is assigned to existing employees`, 409);
  }
};

const buildDesignationPayload = (payload = {}) => {
  const name = normalizeText(payload.name);

  if (!name) {
    throw createHttpError("Designation name is required", 400);
  }

  return {
    name,
    normalizedName: name.toLowerCase(),
  };
};

const ensureDefaultDesignations = async ({ userId, moduleScope }) => {
  if (isWeavingScope(moduleScope)) {
    await ensureDefaultWeavingRecords({
      Model: EmployeeDesignation,
      userId,
      names: DEFAULT_WEAVING_DESIGNATIONS,
    });
    return;
  }

  const existingCount = await EmployeeDesignation.countDocuments({
    userId,
    moduleScope,
    isDeleted: false,
  });

  if (existingCount > 0) return;

  await EmployeeDesignation.insertMany(
    DEFAULT_DESIGNATIONS.map((name) => ({
      userId,
      moduleScope,
      name,
      normalizedName: name.toLowerCase(),
    })),
    { ordered: false },
  ).catch((error) => {
    if (error?.code !== 11000) {
      throw error;
    }
  });
};

const getDesignation = async ({
  userId,
  moduleScope,
  designationId,
  session,
}) => {
  if (!designationId) return null;

  const designation = await getSessionQuery(
    EmployeeDesignation.findOne({
      _id: designationId,
      userId,
      moduleScope,
      isDeleted: false,
    }),
    session,
  );

  if (!designation) {
    throw createHttpError("Designation not found", 404);
  }

  return designation;
};

const buildEmployeePayload = async ({
  userId,
  moduleScope,
  payload = {},
  session,
  employeeId = null,
}) => {
  const name = normalizeText(payload.name);

  if (!name) {
    throw createHttpError("Employee name is required", 400);
  }

  const designation = await getDesignation({
    userId,
    moduleScope,
    designationId: payload.designationId,
    session,
  });

  const basePayload = {
    name,
    phone: normalizeText(payload.phone),
    cnic: normalizeText(payload.cnic),
    address: normalizeText(payload.address),
    designationId: designation?._id || null,
    designationName:
      normalizeText(payload.designationName) || designation?.name || "",
    joiningDate: payload.joiningDate || null,
    salaryType: payload.salaryType === "daily" ? "daily" : "monthly",
    baseSalary: roundMoney(payload.baseSalary),
    notes: normalizeText(payload.notes),
    status: normalizeStatus(payload.status),
  };

  if (!isWeavingScope(moduleScope)) {
    return basePayload;
  }

  const fatherName = normalizeText(payload.fatherName);
  const phone = normalizeText(payload.phone);
  const cnic = normalizeCnic(payload.cnic);
  assertValidCnic(cnic);

  if (!fatherName) {
    throw createHttpError("Father Name is required", 400);
  }

  if (!phone) {
    throw createHttpError("Phone is required", 400);
  }

  const [unit, department, shift] = await Promise.all([
    getWeavingMaster({
      Model: WeavingUnit,
      userId,
      id: payload.unitId,
      label: "Unit",
      session,
    }),
    getWeavingMaster({
      Model: WeavingDepartment,
      userId,
      id: payload.departmentId,
      label: "Department",
      session,
    }),
    getWeavingMaster({
      Model: WeavingShift,
      userId,
      id: payload.shiftId,
      label: "Shift",
      session,
    }),
  ]);

  const employeeNo =
    normalizeText(payload.employeeNo) ||
    (await getNextEmployeeNo({ userId, moduleScope, session }));
  const listOrder =
    normalizeListOrder(payload.listOrder) ||
    (await getNextListOrder({
      userId,
      moduleScope,
      unitId: unit._id,
      session,
    }));

  await assertUniqueEmployeeIdentity({
    userId,
    moduleScope,
    employeeId,
    employeeNo,
    cnic,
    session,
  });

  const weavingSalaryType = normalizeWeavingSalaryType(payload.salaryType);
  const isKnottingWorker =
    (normalizeText(payload.designationName) || designation?.name || "") ===
    "Beam Knotting Worker";
  const knottingPaymentMethod = isKnottingWorker
    ? normalizeKnottingPaymentMethod(payload.knottingPaymentMethod)
    : "monthly";
  const pieceOnlyKnotting = ["per_beam", "per_set"].includes(
    knottingPaymentMethod,
  );

  return {
    ...basePayload,
    employeeNo,
    listOrder,
    fatherName,
    phone,
    gender: normalizeGender(payload.gender),
    cnic,
    emergencyContact: normalizeText(payload.emergencyContact),
    unitId: unit._id,
    unitNo: unit.unitNo,
    unitName: unit.name || `Unit ${unit.unitNo}`,
    departmentId: department._id,
    departmentName: department.name,
    designationId: designation?._id || null,
    designationName:
      normalizeText(payload.designationName) || designation?.name || "",
    shiftId: shift._id,
    shiftName: shift.name,
    joiningDate: payload.joiningDate || new Date(),
    salaryType: weavingSalaryType,
    baseSalary: pieceOnlyKnotting ? 0 : roundMoney(payload.baseSalary),
    knottingPaymentMethod,
    dutyHours: normalizeDutyHours(payload.dutyHours),
    weeklyOffDays: normalizeWeeklyOffDays(payload.weeklyOffDays),
    paidLeaveAllowance: normalizePaidLeaveAllowance(payload.paidLeaveAllowance),
    otAllowed: normalizeOtAllowed(payload.otAllowed),
    openingBalance: normalizeOpeningBalance(payload),
  };
};

const serializePayrollPayload = (payload = {}) => ({
  ...payload,
  additions: parseArrayField(payload.additions),
  deductions: parseArrayField(payload.deductions),
  recoveryApplications: parseArrayField(payload.recoveryApplications),
});

const resolvePayrollPeriod = (payload = {}) => {
  const periodKey = normalizeText(payload.periodKey);
  if (/^\d{4}-\d{2}$/.test(periodKey)) return periodKey;

  const { businessDate } = parseEntryDateTime({
    date: payload.salaryDate || new Date(),
    time: payload.salaryTime || payload.time,
    label: "payroll date",
  });

  return businessDate.slice(0, 7);
};

const buildDocumentHtml = ({
  title,
  subtitle = "",
  rows = [],
  summary = [],
}) => {
  const summaryHtml = summary
    .filter((item) => item && item.label)
    .map(
      (item) =>
        `<div><strong>${item.label}</strong><span>${item.value ?? ""}</span></div>`,
    )
    .join("");

  const rowsHtml = rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .subtitle { color: #6b7280; margin-bottom: 18px; }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin-bottom: 18px; }
    .summary div { border-bottom: 1px solid #e5e7eb; padding: 6px 0; display: flex; justify-content: space-between; gap: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
  ${summaryHtml ? `<div class="summary">${summaryHtml}</div>` : ""}
  ${
    rows.length
      ? `<table><tbody>${rowsHtml}</tbody></table>`
      : "<p>No entries found.</p>"
  }
</body>
</html>`;
};

const sendPdf = async (res, html, filename) => {
  const pdfBuffer = await generatePdfFromHtml(html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=${filename}`,
    "Content-Length": pdfBuffer.length,
  });

  return res.send(pdfBuffer);
};

const getPaymentJournalIds = (payroll) =>
  [payroll.journalEntryId, ...(payroll.paymentJournalEntryIds || [])].filter(
    Boolean,
  );

const normalizeRecordState = (value = "active") =>
  normalizeText(value).toLowerCase() === "inactive" ? "inactive" : "active";

const getEmployeeRecordStateFilter = (value) =>
  normalizeRecordState(value) === "inactive"
    ? {
        $or: [
          { isDeleted: true },
          { isDeleted: { $ne: true }, status: "inactive" },
        ],
      }
    : { isDeleted: { $ne: true }, status: "active" };

const getPayrollRecordStateFilter = (value) =>
  normalizeRecordState(value) === "inactive"
    ? { $or: [{ isDeleted: true }, { status: "void" }] }
    : { isDeleted: { $ne: true }, status: { $ne: "void" } };

const deriveRestoredPayrollStatus = (payroll, paidAmount) => {
  if (
    roundMoney(paidAmount) > 0 &&
    roundMoney(paidAmount) >= roundMoney(payroll.netSalary)
  ) return "paid";
  if (roundMoney(paidAmount) > 0) return "partially_paid";

  return ["posted", "finalized"].includes(payroll.statusBeforeVoid)
    ? payroll.statusBeforeVoid
    : isWeavingScope(payroll.moduleScope)
      ? "finalized"
      : "posted";
};

const applyPayrollAccounting = async ({
  userId,
  moduleScope,
  payroll,
  payload,
  session,
}) => {
  const employee = await validateEmployee({
    userId,
    employeeId: payroll.employeeId,
    moduleScope,
    session,
  });
  await ensureEmployeeAccount({ userId, moduleScope, employee, session });

  const totals = calculatePayrollTotals(payload);
  const { businessDate, businessTime } = parseEntryDateTime({
    date: payload.salaryDate || new Date(),
    time: payload.salaryTime || payload.time || "",
    label: "payroll date",
  });
  const salaryJournal = await createSalaryJournal({
    userId,
    moduleScope,
    employee,
    payroll,
    date: businessDate,
    time: businessTime,
    amount: totals.salaryExpenseAmount,
    session,
  });

  const paidAmount = roundMoney(
    payload.paidAmount || payload.payNowAmount || 0,
  );
  if (paidAmount > totals.netSalary) {
    throw createHttpError("Paid amount cannot exceed net salary.", 400);
  }

  let paymentJournal = null;
  let paymentAccount = null;

  if (paidAmount > 0) {
    paymentAccount = await validatePaymentAccount({
      userId,
      moduleScope,
      paymentAccountId: payload.paymentAccountId,
      session,
    });
    paymentJournal = await createSalaryPaymentJournal({
      userId,
      moduleScope,
      employee,
      payroll,
      paymentAccount,
      date: payload.paymentDate || businessDate,
      time: payload.paymentTime || businessTime,
      amount: paidAmount,
      session,
    });
  }

  const appliedRecoveries = await applyPayrollRecoveries({
    userId,
    moduleScope,
    employee,
    payroll,
    recoveries: totals.recoveryApplications,
    journalEntryId: salaryJournal?._id || null,
    session,
  });

  payroll.salaryDate = businessDate;
  payroll.salaryTime = businessTime;
  payroll.baseSalary = totals.baseSalary;
  payroll.additions = totals.additions;
  payroll.deductions = totals.deductions;
  payroll.recoveryApplications = appliedRecoveries;
  payroll.totalAdditions = totals.totalAdditions;
  payroll.totalDeductions = totals.totalDeductions;
  payroll.recoveryAmount = totals.recoveryAmount;
  payroll.grossSalary = totals.grossSalary;
  payroll.netSalary = totals.netSalary;
  payroll.paidAmount = paidAmount;
  payroll.remainingDue = roundMoney(totals.netSalary - paidAmount);
  payroll.paymentAccountId = paymentAccount?._id || null;
  payroll.paymentType = paymentAccount
    ? getPaymentTypeFromAccount(paymentAccount)
    : "";
  payroll.journalEntryId = salaryJournal?._id || null;
  payroll.paymentJournalEntryIds = paymentJournal ? [paymentJournal._id] : [];
  payroll.paymentHistory = paymentJournal
    ? [
        {
          amount: paidAmount,
          paymentAccountId: paymentAccount._id,
          paymentType: getPaymentTypeFromAccount(paymentAccount),
          paymentDate: payload.paymentDate || businessDate,
          paymentTime: payload.paymentTime || businessTime,
          receivedBy: payload.receivedBy === "other" ? "other" : "self",
          receiverName: normalizeText(payload.receiverName),
          receiverPhone: normalizeText(payload.receiverPhone),
          note: normalizeText(payload.note),
          journalEntryId: paymentJournal._id,
          paidBy: userId,
        },
      ]
    : [];
  payroll.status = payroll.remainingDue <= 0 ? "paid" : "posted";

  await payroll.save(session ? { session } : undefined);

  return [
    ...(salaryJournal ? collectAccountIdsFromJournal(salaryJournal) : []),
    ...(paymentJournal ? collectAccountIdsFromJournal(paymentJournal) : []),
  ];
};

exports.getDesignations = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    await ensureDefaultDesignations({ userId, moduleScope });

    const designations = await EmployeeDesignation.find({
      userId,
      moduleScope,
      isDeleted: false,
    }).sort({ name: 1 });

    return res.json({ data: designations });
  } catch (error) {
    return sendError(res, error, "Failed to load employee designations");
  }
};

exports.createDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = buildDesignationPayload(req.body);

    const designation = await EmployeeDesignation.create({
      ...payload,
      userId,
      moduleScope,
    });

    await logActivity({
      req,
      action: "create",
      module: "employees",
      moduleScope,
      entityType: "EmployeeDesignation",
      entityId: designation._id,
      title: designation.name,
    });

    return res.status(201).json({ data: designation });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Designation already exists" });
    }

    return sendError(res, error, "Failed to create employee designation");
  }
};

exports.updateDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = buildDesignationPayload(req.body);

    const designation = await EmployeeDesignation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          ...payload,
          isActive: req.body.isActive !== false,
        },
      },
      { new: true },
    );

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ data: designation });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Designation already exists" });
    }

    return sendError(res, error, "Failed to update employee designation");
  }
};

exports.deleteDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (isWeavingScope(moduleScope)) {
      await assertMasterNotAssigned({
        userId,
        field: "designationId",
        value: req.params.id,
        label: "Designation",
      });
    }

    const designation = await EmployeeDesignation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
        },
      },
      { new: true },
    );

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ message: "Designation deleted", data: designation });
  } catch (error) {
    return sendError(res, error, "Failed to delete employee designation");
  }
};

exports.getEmployeeFormMeta = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    await Promise.all([
      ensureDefaultWeavingMasters(userId),
      ensureDefaultDesignations({ userId, moduleScope }),
    ]);

    let unitForOrder = null;
    if (req.query.unitId) {
      unitForOrder = await getWeavingMaster({
        Model: WeavingUnit,
        userId,
        id: req.query.unitId,
        label: "Unit",
      });
    }

    const [
      units,
      departments,
      designations,
      shifts,
      nextEmployeeNo,
      nextListOrder,
    ] = await Promise.all([
      WeavingUnit.find({
        userId,
        moduleScope,
        isDeleted: false,
      }).sort({ unitNo: 1, name: 1 }),
      WeavingDepartment.find({
        userId,
        moduleScope,
        isDeleted: false,
      }).sort({ name: 1 }),
      EmployeeDesignation.find({
        userId,
        moduleScope,
        isDeleted: false,
      }).sort({ name: 1 }),
      WeavingShift.find({
        userId,
        moduleScope,
        isDeleted: false,
      }).sort({ name: 1 }),
      getNextEmployeeNo({ userId, moduleScope }),
      getNextListOrder({
        userId,
        moduleScope,
        unitId: unitForOrder?._id || null,
      }),
    ]);

    return res.json({
      data: {
        units,
        departments,
        designations,
        shifts,
        nextEmployeeNo,
        nextListOrder,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load employee form data");
  }
};

exports.getUnits = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const units = await WeavingUnit.find({
      userId,
      moduleScope,
      isDeleted: false,
    }).sort({ unitNo: 1, name: 1 });

    return res.json({ data: units });
  } catch (error) {
    return sendError(res, error, "Failed to load weaving units");
  }
};

exports.createUnit = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const unit = await WeavingUnit.create({
      ...buildUnitPayload(req.body),
      userId,
      moduleScope,
    });

    return res.status(201).json({ data: unit });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Unit Number already exists" });
    }

    return sendError(res, error, "Failed to create weaving unit");
  }
};

exports.updateUnit = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const unit = await WeavingUnit.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      { $set: buildUnitPayload(req.body) },
      { new: true },
    );

    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    await Employee.updateMany(
      {
        userId,
        moduleScope,
        unitId: unit._id,
      },
      {
        $set: {
          unitNo: unit.unitNo,
          unitName: unit.name || `Unit ${unit.unitNo}`,
        },
      },
    );

    return res.json({ data: unit });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Unit Number already exists" });
    }

    return sendError(res, error, "Failed to update weaving unit");
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    await assertMasterNotAssigned({
      userId,
      field: "unitId",
      value: req.params.id,
      label: "Unit",
    });

    const unit = await WeavingUnit.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
        },
      },
      { new: true },
    );

    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    return res.json({ message: "Unit deleted", data: unit });
  } catch (error) {
    return sendError(res, error, "Failed to delete weaving unit");
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);
    await ensureDefaultWeavingMasters(userId);

    const departments = await WeavingDepartment.find({
      userId,
      moduleScope,
      isDeleted: false,
    }).sort({ name: 1 });

    return res.json({ data: departments });
  } catch (error) {
    return sendError(res, error, "Failed to load weaving departments");
  }
};

exports.createDepartment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const department = await WeavingDepartment.create({
      ...buildNameMasterPayload(req.body, "Department"),
      userId,
      moduleScope,
    });

    return res.status(201).json({ data: department });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Department already exists" });
    }

    return sendError(res, error, "Failed to create weaving department");
  }
};

exports.updateDepartment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const department = await WeavingDepartment.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      { $set: buildNameMasterPayload(req.body, "Department") },
      { new: true },
    );

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    await Employee.updateMany(
      {
        userId,
        moduleScope,
        departmentId: department._id,
      },
      { $set: { departmentName: department.name } },
    );

    return res.json({ data: department });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Department already exists" });
    }

    return sendError(res, error, "Failed to update weaving department");
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    await assertMasterNotAssigned({
      userId,
      field: "departmentId",
      value: req.params.id,
      label: "Department",
    });

    const department = await WeavingDepartment.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
        },
      },
      { new: true },
    );

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    return res.json({ message: "Department deleted", data: department });
  } catch (error) {
    return sendError(res, error, "Failed to delete weaving department");
  }
};

exports.getShifts = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);
    await ensureDefaultWeavingMasters(userId);

    const shifts = await WeavingShift.find({
      userId,
      moduleScope,
      isDeleted: false,
    }).sort({ name: 1 });

    return res.json({ data: shifts });
  } catch (error) {
    return sendError(res, error, "Failed to load weaving shifts");
  }
};

exports.createShift = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const shift = await WeavingShift.create({
      ...buildShiftPayload(req.body),
      userId,
      moduleScope,
    });

    return res.status(201).json({ data: shift });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Shift already exists" });
    }

    return sendError(res, error, "Failed to create weaving shift");
  }
};

exports.updateShift = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    const shift = await WeavingShift.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      { $set: buildShiftPayload(req.body) },
      { new: true },
    );

    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    await Employee.updateMany(
      {
        userId,
        moduleScope,
        shiftId: shift._id,
      },
      { $set: { shiftName: shift.name } },
    );

    return res.json({ data: shift });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Shift already exists" });
    }

    return sendError(res, error, "Failed to update weaving shift");
  }
};

exports.deleteShift = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    assertWeavingEmployeeScope(moduleScope);

    await assertMasterNotAssigned({
      userId,
      field: "shiftId",
      value: req.params.id,
      label: "Shift",
    });

    const shift = await WeavingShift.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
        },
      },
      { new: true },
    );

    if (!shift) {
      return res.status(404).json({ message: "Shift not found" });
    }

    return res.json({ message: "Shift deleted", data: shift });
  } catch (error) {
    return sendError(res, error, "Failed to delete weaving shift");
  }
};

exports.getEmployees = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const search = normalizeText(req.query.search);
    const status = normalizeText(req.query.status);
    const recordState = status === "hidden" ? "inactive" : status;
    const query = {
      userId,
      moduleScope,
      $and: [getEmployeeRecordStateFilter(recordState)],
    };

    if (isWeavingScope(moduleScope)) {
      ["unitId", "departmentId", "designationId", "shiftId"].forEach(
        (field) => {
          if (req.query[field]) {
            query[field] = req.query[field];
          }
        },
      );
    }

    if (search) {
      const safeSearch = escapeRegex(search);
      query.$and.push({
        $or: [
          { name: { $regex: safeSearch, $options: "i" } },
          { fatherName: { $regex: safeSearch, $options: "i" } },
          { employeeNo: { $regex: safeSearch, $options: "i" } },
          { phone: { $regex: safeSearch, $options: "i" } },
          { cnic: { $regex: safeSearch, $options: "i" } },
          { designationName: { $regex: safeSearch, $options: "i" } },
          { departmentName: { $regex: safeSearch, $options: "i" } },
          { shiftName: { $regex: safeSearch, $options: "i" } },
        ],
      });
    }

    const employees = await Employee.find(query)
      .populate("designationId", "name")
      .populate("unitId", "unitNo name")
      .populate("departmentId", "name")
      .populate("shiftId", "name")
      .populate("account", "name code balance moduleScope")
      .sort(
        isWeavingScope(moduleScope)
          ? { unitNo: 1, listOrder: 1, name: 1 }
          : { name: 1 },
      );
    const employeesWithBalances = isWeavingScope(moduleScope)
      ? employees.map((employee) =>
          typeof employee.toObject === "function"
            ? employee.toObject()
            : employee,
        )
      : await appendEmployeeBalances({
          userId,
          moduleScope,
          employees,
        });

    return res.json({ data: employeesWithBalances });
  } catch (error) {
    return sendError(res, error, "Failed to load employees");
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const includeInactive =
      ["hidden", "inactive"].includes(req.query.status) ||
      String(req.query.includeHidden) === "true" ||
      String(req.query.includeInactive) === "true";
    const employee = await Employee.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      ...(includeInactive ? {} : getEmployeeRecordStateFilter("active")),
    })
      .populate("designationId", "name")
      .populate("unitId", "unitNo name")
      .populate("departmentId", "name")
      .populate("shiftId", "name")
      .populate("account", "name code balance moduleScope");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const [employeeWithBalance] = isWeavingScope(moduleScope)
      ? [
          typeof employee.toObject === "function"
            ? employee.toObject()
            : employee,
        ]
      : await appendEmployeeBalances({
          userId,
          moduleScope,
          employees: [employee],
        });

    return res.json({ data: employeeWithBalance });
  } catch (error) {
    return sendError(res, error, "Failed to load employee");
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let createdEmployee;

    await withTransaction(async (session) => {
      const payload = await buildEmployeePayload({
        userId,
        moduleScope,
        payload: req.body,
        session,
      });

      createdEmployee = new Employee({
        ...payload,
        userId,
        moduleScope,
        linkedUserId: req.body.linkedUserId || null,
      });

      await createdEmployee.save({ session });
      await ensureEmployeeAccount({
        userId,
        moduleScope,
        employee: createdEmployee,
        session,
      });
    });

    await logActivity({
      req,
      action: "create",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: createdEmployee._id,
      title: createdEmployee.name,
    });
    clearModuleCaches(userId, moduleScope);

    return res.status(201).json({ data: createdEmployee });
  } catch (error) {
    return sendError(res, error, "Failed to create employee");
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let updatedEmployee;

    await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: req.params.id,
        moduleScope,
        session,
      });
      const payload = await buildEmployeePayload({
        userId,
        moduleScope,
        payload: req.body,
        session,
        employeeId: employee._id,
      });

      Object.assign(employee, payload);
      updatedEmployee = await employee.save({ session });
      await syncEmployeeAccountName({ employee: updatedEmployee, session });
    });

    await logActivity({
      req,
      action: "update",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: updatedEmployee._id,
      title: updatedEmployee.name,
    });
    clearModuleCaches(userId, moduleScope);

    return res.json({ data: updatedEmployee });
  } catch (error) {
    return sendError(res, error, "Failed to update employee");
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const employee = await Employee.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          status: "inactive",
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
          deleteReason: normalizeText(req.body.reason),
        },
      },
      { new: true },
    );

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await logActivity({
      req,
      action: "delete",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: employee._id,
      title: employee.name,
    });
    clearModuleCaches(userId, moduleScope);

    return res.json({ message: "Employee archived", data: employee });
  } catch (error) {
    return sendError(res, error, "Failed to delete employee");
  }
};

exports.restoreEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let restoredEmployee;

    await withTransaction(async (session) => {
      const employee = await getSessionQuery(
        Employee.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          ...getEmployeeRecordStateFilter("inactive"),
        }),
        session,
      );

      if (!employee) {
        throw createHttpError("Employee not found", 404);
      }

      if (isWeavingScope(moduleScope)) {
        await assertUniqueEmployeeIdentity({
          userId,
          moduleScope,
          employeeId: employee._id,
          employeeNo: employee.employeeNo,
          cnic: employee.cnic,
          session,
        });
      }

      employee.isDeleted = false;
      employee.status = "active";
      employee.deletedAt = null;
      employee.deletedBy = null;
      employee.deleteReason = "";
      restoredEmployee = await employee.save({ session });
      await ensureEmployeeAccount({
        userId,
        moduleScope,
        employee: restoredEmployee,
        session,
      });
    });

    await logActivity({
      req,
      action: "restore",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: restoredEmployee._id,
      title: restoredEmployee.name,
    });
    clearModuleCaches(userId, moduleScope);

    return res.json({ message: "Employee restored", data: restoredEmployee });
  } catch (error) {
    return sendError(res, error, "Failed to restore employee");
  }
};

exports.getEmployeeSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const summary = await getEmployeeFinancialSummary({ userId, moduleScope });

    return res.json({ data: summary });
  } catch (error) {
    return sendError(res, error, "Failed to load employee summary");
  }
};

exports.getEmployeeLedgersSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const summary = await getEmployeeLedgersSummary({
      userId,
      moduleScope,
      search: req.query.search,
      status: req.query.status,
      position: req.query.position,
    });

    return res.json({ data: summary });
  } catch (error) {
    return sendError(res, error, "Failed to load employee ledgers");
  }
};

exports.getPayrolls = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await getWeavingPayrollCycle({
        userId,
        cycleKey: req.query.cycleKey || req.query.periodKey,
        segmentNo: req.query.segmentNo,
        recordState: req.query.recordState,
      });

      return res.json({ data: payrollCycle });
    }

    const query = {
      userId,
      moduleScope,
      ...getPayrollRecordStateFilter(req.query.recordState),
    };

    if (req.query.periodKey) query.periodKey = req.query.periodKey;
    if (req.query.status) query.status = req.query.status;
    if (req.query.employeeId) query.employeeId = req.query.employeeId;

    const payrolls = await EmployeePayroll.find(query)
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category")
      .sort({ salaryDate: -1, createdAt: -1 });

    return res.json({ data: payrolls });
  } catch (error) {
    return sendError(res, error, "Failed to load payrolls");
  }
};

exports.getPayrollSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (isWeavingScope(moduleScope)) {
      const summary = await getWeavingPayrollSummary({
        userId,
        cycleKey: req.query.cycleKey || req.query.periodKey,
        segmentNo: req.query.segmentNo,
      });

      return res.json({ data: summary });
    }

    const summary = await getEmployeeFinancialSummary({ userId, moduleScope });
    return res.json({ data: summary });
  } catch (error) {
    return sendError(res, error, "Failed to load payroll summary");
  }
};

exports.createPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = serializePayrollPayload(req.body);

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await generateWeavingPayrollCycle({
        userId,
        cycleKey: payload.cycleKey || payload.periodKey,
        segmentNo: payload.segmentNo,
      });

      await logActivity({
        req,
        action: "generate",
        module: "employees.payroll",
        moduleScope,
        entityType: "EmployeePayroll",
        title: `Weaving Payroll ${payrollCycle.cycle.key}`,
      });

      clearModuleCaches(userId, moduleScope);
      return res.status(201).json({ data: payrollCycle });
    }

    const periodKey = resolvePayrollPeriod(payload);
    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: payload.employeeId,
        moduleScope,
        session,
      });
      const { businessDate, businessTime } = parseEntryDateTime({
        date: payload.salaryDate || new Date(),
        time: payload.salaryTime || payload.time || "",
        label: "payroll date",
      });

      payroll = new EmployeePayroll({
        userId,
        moduleScope,
        employeeId: employee._id,
        periodKey,
        salaryDate: businessDate,
        salaryTime: businessTime,
        notes: normalizeText(payload.notes),
      });
      await payroll.save({ session });

      touchedAccountIds = await applyPayrollAccounting({
        userId,
        moduleScope,
        payroll,
        payload,
        session,
      });

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "create",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${periodKey}`,
      metadata: { employeeId: result.employeeId },
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Payroll already exists for this employee and period.",
      });
    }

    return sendError(res, error, "Failed to create payroll");
  }
};

exports.updatePayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = serializePayrollPayload(req.body);

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await updateWeavingPayroll({
        userId,
        payrollId: req.params.id,
        payload,
      });
      const updatedPayroll = (payrollCycle.payrolls || []).find(
        (payroll) => String(payroll._id) === String(req.params.id),
      );

      await logActivity({
        req,
        action: "update",
        module: "employees.payroll",
        moduleScope,
        entityType: "EmployeePayroll",
        entityId: req.params.id,
        title: "Weaving Salary Corrected",
        metadata: {
          payrollId: req.params.id,
          employeeId: updatedPayroll?.employeeId?._id || updatedPayroll?.employeeId || null,
          amount: updatedPayroll?.netSalary,
          cycleKey: updatedPayroll?.cycleKey || updatedPayroll?.periodKey || "",
        },
      });

      clearModuleCaches(userId, moduleScope);
      return res.json({ data: payrollCycle });
    }

    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $ne: "void" },
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      const requestedEmployeeId = payload.employeeId
        ? String(payload.employeeId)
        : String(payroll.employeeId);
      const requestedPeriodKey = normalizeText(payload.periodKey) || payroll.periodKey;
      if (
        requestedEmployeeId !== String(payroll.employeeId) ||
        requestedPeriodKey !== payroll.periodKey
      ) {
        throw createHttpError(
          "Employee and payroll period cannot be changed after payroll creation.",
          400,
        );
      }

      const employee = await getSessionQuery(
        Employee.findOne({
          _id: payroll.employeeId,
          userId,
          moduleScope,
        }),
        session,
      );
      if (!employee) throw createHttpError("Employee not found", 404);

      const totals = calculatePayrollTotals(payload);
      const paymentState = await getActivePayrollPaymentState({
        userId,
        payroll,
        session,
      });
      if (paymentState.paidAmount > totals.netSalary) {
        throw createHttpError(
          "Paid amount exceeds the corrected salary. Adjust/recover the payment first.",
          400,
        );
      }

      const reversalResult = await reverseJournals({
        journalIds: [payroll.journalEntryId],
        userId,
        date: new Date(),
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

      const { businessDate, businessTime } = parseEntryDateTime({
        date: payload.salaryDate || payroll.salaryDate,
        time: payload.salaryTime || payroll.salaryTime,
        label: "payroll date",
      });
      const salaryJournal = await createSalaryJournal({
        userId,
        moduleScope,
        employee,
        payroll,
        date: businessDate,
        time: businessTime,
        amount: totals.salaryExpenseAmount,
        session,
      });
      const appliedRecoveries = await applyPayrollRecoveries({
        userId,
        moduleScope,
        employee,
        payroll,
        recoveries: totals.recoveryApplications,
        journalEntryId: salaryJournal?._id || null,
        session,
      });

      payroll.salaryDate = businessDate;
      payroll.salaryTime = businessTime;
      payroll.baseSalary = totals.baseSalary;
      payroll.additions = totals.additions;
      payroll.deductions = totals.deductions;
      payroll.recoveryApplications = appliedRecoveries;
      payroll.totalAdditions = totals.totalAdditions;
      payroll.totalDeductions = totals.totalDeductions;
      payroll.recoveryAmount = totals.recoveryAmount;
      payroll.grossSalary = totals.grossSalary;
      payroll.netSalary = totals.netSalary;
      payroll.paidAmount = paymentState.paidAmount;
      payroll.remainingDue = roundMoney(totals.netSalary - paymentState.paidAmount);
      payroll.journalEntryId = salaryJournal?._id || null;
      payroll.status = deriveRestoredPayrollStatus(payroll, paymentState.paidAmount);
      payroll.notes = normalizeText(payload.notes ?? payroll.notes);
      await payroll.save({ session });

      if (salaryJournal) {
        touchedAccountIds.push(...collectAccountIdsFromJournal(salaryJournal));
      }

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "update",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${result.periodKey} corrected`,
      metadata: {
        payrollId: result._id,
        employeeId: result.employeeId,
        amount: result.netSalary,
        periodKey: result.periodKey,
      },
    });

    return res.json({ data: result });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Payroll already exists for this employee and period.",
      });
    }

    return sendError(res, error, "Failed to update payroll");
  }
};

exports.finalizePayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (!isWeavingScope(moduleScope)) {
      return res
        .status(404)
        .json({ message: "Payroll finalization is only available for Weaving." });
    }

    const payrollCycle = await finalizeWeavingPayroll({
      userId,
      payrollId: req.params.id,
      actorId: req.actorId || userId,
    });

    await logActivity({
      req,
      action: "finalize",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: req.params.id,
      title: "Weaving Payroll Finalized",
    });

    clearModuleCaches(userId, moduleScope);
    return res.json({ data: payrollCycle });
  } catch (error) {
    return sendError(res, error, "Failed to finalize payroll");
  }
};

exports.finalizePayrollCycle = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (!isWeavingScope(moduleScope)) {
      return res
        .status(404)
        .json({ message: "Payroll finalization is only available for Weaving." });
    }

    const payrollCycle = await finalizeWeavingPayrollCycle({
      userId,
      cycleKey: req.body.cycleKey || req.body.periodKey || req.query.cycleKey,
      segmentNo: req.body.segmentNo || req.query.segmentNo,
      actorId: req.actorId || userId,
    });

    await logActivity({
      req,
      action: "finalize",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      title: `Weaving Payroll ${payrollCycle.cycle.key} Finalized`,
    });

    clearModuleCaches(userId, moduleScope);
    return res.json({ data: payrollCycle });
  } catch (error) {
    return sendError(res, error, "Failed to finalize payroll cycle");
  }
};

exports.earlyClosePayrollCycle = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (!isWeavingScope(moduleScope)) {
      return res
        .status(404)
        .json({ message: "Payroll Early Close is only available for Weaving." });
    }

    const payrollCycle = await earlyCloseWeavingPayrollCycle({
      userId,
      cycleKey: req.body.cycleKey || req.body.periodKey || req.query.cycleKey,
      segmentNo: req.body.segmentNo || req.query.segmentNo,
      reason: req.body.reason,
      actorId: req.actorId || userId,
    });

    await logActivity({
      req,
      action: "early_close",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      title: `Weaving Payroll ${payrollCycle.cycle.key} Early Closed`,
      metadata: {
        throughDate: payrollCycle.earlyCloseThroughDate,
      },
    });

    clearModuleCaches(userId, moduleScope);
    return res.json({ data: payrollCycle });
  } catch (error) {
    return sendError(res, error, "Failed to early close payroll cycle");
  }
};

exports.resumePayrollCycle = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (!isWeavingScope(moduleScope)) {
      return res
        .status(404)
        .json({ message: "Payroll Resume is only available for Weaving." });
    }

    const payrollCycle = await resumeWeavingPayrollCycle({
      userId,
      cycleKey: req.body.cycleKey || req.body.periodKey || req.query.cycleKey,
      resumeFrom: req.body.resumeFrom,
      calculateThrough: req.body.calculateThrough,
      note: req.body.note,
      actorId: req.actorId || userId,
    });

    await logActivity({
      req,
      action: "resume",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      title: `Weaving Payroll ${payrollCycle.cycle.baseCycleKey} Segment ${payrollCycle.cycle.segmentNo} Resumed`,
      metadata: {
        segmentNo: payrollCycle.cycle.segmentNo,
        resumeFrom: payrollCycle.cycle.segmentStart,
      },
    });

    clearModuleCaches(userId, moduleScope);
    return res.json({ data: payrollCycle });
  } catch (error) {
    return sendError(res, error, "Failed to resume payroll cycle");
  }
};

exports.payPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await payWeavingPayroll({
        userId,
        payrollId: req.params.id,
        payload: req.body,
        actorId: req.actorId || userId,
      });

      clearModuleCaches(userId, moduleScope);
      const paidPayroll = (payrollCycle.payrolls || []).find(
        (payroll) => String(payroll._id) === String(req.params.id),
      );
      await logActivity({
        req,
        action: "pay",
        module: "employees.payroll",
        moduleScope,
        entityType: "EmployeePayroll",
        entityId: req.params.id,
        title: "Weaving Salary Payment",
        metadata: {
          payrollId: req.params.id,
          employeeId: paidPayroll?.employeeId?._id || paidPayroll?.employeeId || null,
          amount: roundMoney(req.body.amount),
          paymentAccountId: req.body.paymentAccountId || null,
          cycleKey: paidPayroll?.cycleKey || paidPayroll?.periodKey || "",
        },
      });
      return res.json({ data: payrollCycle });
    }

    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $in: ["posted", "partially_paid", "paid"] },
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      const amount = roundMoney(req.body.amount);
      if (amount <= 0 || amount > roundMoney(payroll.remainingDue)) {
        throw createHttpError("Invalid salary payment amount.", 400);
      }

      const employee = await validateEmployee({
        userId,
        employeeId: payroll.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const journal = await createSalaryPaymentJournal({
        userId,
        moduleScope,
        employee,
        payroll,
        paymentAccount,
        date: req.body.paymentDate || payroll.salaryDate,
        time: req.body.paymentTime || req.body.time || payroll.salaryTime,
        amount,
        session,
      });

      payroll.paymentJournalEntryIds = [
        ...(payroll.paymentJournalEntryIds || []),
        journal._id,
      ];
      payroll.paymentAccountId = paymentAccount._id;
      payroll.paymentType = getPaymentTypeFromAccount(paymentAccount);
      payroll.paidAmount = roundMoney(Number(payroll.paidAmount || 0) + amount);
      payroll.remainingDue = roundMoney(
        Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0),
      );
      payroll.status = payroll.remainingDue <= 0 ? "paid" : "partially_paid";
      payroll.paymentHistory.push({
        amount,
        paymentAccountId: paymentAccount._id,
        paymentType: getPaymentTypeFromAccount(paymentAccount),
        paymentDate: req.body.paymentDate || payroll.salaryDate,
        paymentTime: req.body.paymentTime || req.body.time || payroll.salaryTime,
        receivedBy: req.body.receivedBy === "other" ? "other" : "self",
        receiverName: normalizeText(req.body.receiverName),
        receiverPhone: normalizeText(req.body.receiverPhone),
        note: normalizeText(req.body.note),
        journalEntryId: journal._id,
        paidBy: req.actorId || userId,
      });
      await payroll.save({ session });

      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "pay",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${result.periodKey} Payment`,
      metadata: {
        payrollId: result._id,
        employeeId: result.employeeId,
        amount: roundMoney(req.body.amount),
        paymentAccountId: req.body.paymentAccountId || null,
        periodKey: result.periodKey,
      },
    });

    return res.json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to pay payroll");
  }
};

exports.voidPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await voidWeavingPayroll({
        userId,
        payrollId: req.params.id,
        payload: req.body,
        actorId: req.actorId || userId,
      });

      clearModuleCaches(userId, moduleScope);
      await logActivity({
        req,
        action: "void",
        module: "employees.payroll",
        moduleScope,
        entityType: "EmployeePayroll",
        entityId: req.params.id,
        title: "Weaving Payroll Voided",
      });
      return res.json({ message: "Payroll voided", data: payrollCycle });
    }

    let touchedAccountIds = [];
    let payroll;

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      await reversePayrollRecoveries({ payroll, session });
      const reversalResult = await reverseJournals({
        journalIds: getPaymentJournalIds(payroll),
        userId,
        date: new Date(),
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
        ...getPaymentJournalIds(payroll),
      ];
      payroll.status = "void";
      payroll.isDeleted = true;
      payroll.voidedAt = new Date();
      payroll.voidedBy = req.actorId || userId;
      payroll.voidReason = normalizeText(req.body.reason);
      await payroll.save({ session });

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "void",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${result.periodKey} Voided`,
    });

    return res.json({ message: "Payroll voided", data: result });
  } catch (error) {
    return sendError(res, error, "Failed to void payroll");
  }
};

exports.restorePayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const actorId = req.actorId || userId;

    if (isWeavingScope(moduleScope)) {
      const payrollCycle = await restoreWeavingPayroll({
        userId,
        payrollId: req.params.id,
        actorId,
      });
      clearModuleCaches(userId, moduleScope);
      await logActivity({
        req,
        action: "restore",
        module: "employees.payroll",
        moduleScope,
        entityType: "EmployeePayroll",
        entityId: req.params.id,
        title: "Weaving Payroll Restored",
      });
      return res.json({ message: "Payroll restored", data: payrollCycle });
    }

    let touchedAccountIds = [];
    const restored = await withTransaction(async (session) => {
      const payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          $or: [{ isDeleted: true }, { status: "void" }],
        }),
        session,
      );
      if (!payroll) throw createHttpError("Inactive payroll not found", 404);

      const conflict = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: { $ne: payroll._id },
          userId,
          moduleScope,
          employeeId: payroll.employeeId,
          periodKey: payroll.periodKey,
          isDeleted: { $ne: true },
          status: { $ne: "void" },
        }).select("_id"),
        session,
      );
      if (conflict) {
        throw createHttpError(
          "An active payroll already exists for this employee and period.",
          409,
        );
      }

      const employee = await getSessionQuery(
        Employee.findOne({ _id: payroll.employeeId, userId, moduleScope }),
        session,
      );
      if (!employee) throw createHttpError("Employee not found", 404);

      const oldJournalIds = getPaymentJournalIds(payroll);
      const salaryJournal = await createSalaryJournal({
        userId,
        moduleScope,
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
        moduleScope,
        employee,
        payroll,
        recoveries: payroll.recoveryApplications || [],
        journalEntryId: salaryJournal?._id || null,
        session,
      });
      const restoredPayments = await recreatePayrollPaymentJournals({
        userId,
        moduleScope,
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
      payroll.status = deriveRestoredPayrollStatus(
        payroll,
        restoredPayments.paidAmount,
      );
      payroll.isDeleted = false;
      payroll.voidedAt = null;
      payroll.voidedBy = null;
      payroll.voidReason = "";
      await payroll.save({ session });
      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "restore",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: restored._id,
      title: `Payroll ${restored.periodKey} Restored`,
    });

    return res.json({ message: "Payroll restored", data: restored });
  } catch (error) {
    if (error?.code === 11000) {
      error.statusCode = 409;
      error.message = "An active replacement payroll already exists.";
    }
    return sendError(res, error, "Failed to restore payroll");
  }
};

exports.getPayrollById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const includeInactive = String(req.query.includeInactive) === "true";

    if (isWeavingScope(moduleScope)) {
      const payroll = await getWeavingPayrollById({
        userId,
        payrollId: req.params.id,
        includeInactive,
      });

      return res.json({ data: payroll });
    }

    const payroll = await EmployeePayroll.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      ...(includeInactive ? {} : getPayrollRecordStateFilter("active")),
    })
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category");

    if (!payroll) {
      return res.status(404).json({ message: "Payroll not found" });
    }

    return res.json({ data: payroll });
  } catch (error) {
    return sendError(res, error, "Failed to load payroll");
  }
};

exports.getAdvanceLoans = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const query = {
      userId,
      moduleScope,
      isDeleted: false,
    };

    if (req.query.employeeId) query.employeeId = req.query.employeeId;
    if (req.query.kind)
      query.kind = req.query.kind === "loan" ? "loan" : "advance";
    if (req.query.status) query.status = req.query.status;

    const entries = await EmployeeAdvanceLoan.find(query)
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category")
      .sort({ date: -1, createdAt: -1 });

    return res.json({ data: entries });
  } catch (error) {
    return sendError(res, error, "Failed to load employee advances/loans");
  }
};

exports.createAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: req.body.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const amount = roundMoney(req.body.amount);

      if (amount <= 0) {
        throw createHttpError("Amount must be greater than zero.", 400);
      }

      const kind = req.body.kind === "loan" ? "loan" : "advance";
      const recoveryPlan = isWeavingScope(moduleScope)
        ? buildWeavingRecoveryPlan({ kind, payload: req.body })
        : undefined;
      const { businessDate, businessTime } = parseEntryDateTime({
        date: req.body.date || new Date(),
        time: req.body.time || "",
        label: "advance/loan date",
      });
      const advanceLoan = new EmployeeAdvanceLoan({
        userId,
        moduleScope,
        employeeId: employee._id,
        kind,
        amount,
        recoveredAmount: 0,
        outstandingAmount: amount,
        date: businessDate,
        time: businessTime,
        paymentAccountId: paymentAccount._id,
        paymentType: getPaymentTypeFromAccount(paymentAccount),
        description: normalizeText(req.body.description),
        ...(recoveryPlan ? { recoveryPlan } : {}),
        status: "active",
      });

      await advanceLoan.save({ session });
      const journal = await createAdvanceLoanJournal({
        userId,
        moduleScope,
        employee,
        advanceLoan,
        paymentAccount,
        date: businessDate,
        time: businessTime,
        session,
      });

      advanceLoan.journalEntryId = journal._id;
      await advanceLoan.save({ session });
      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.status(201).json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to create employee advance/loan");
  }
};

exports.updateAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    if (!isWeavingScope(moduleScope)) {
      throw createHttpError("Employee finance edit is only available for Weaving.", 404);
    }

    let touchedAccountIds = [];
    const result = await withTransaction(async (session) => {
      const advanceLoan = await getSessionQuery(
        EmployeeAdvanceLoan.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
        }),
        session,
      );

      if (!advanceLoan) {
        throw createHttpError("Advance/loan not found", 404);
      }

      const hasRecoveries =
        roundMoney(advanceLoan.recoveredAmount) > 0 ||
        (advanceLoan.recoveryHistory || []).length > 0;
      const requestedKind =
        req.body.kind === "loan" || req.body.kind === "advance"
          ? req.body.kind
          : advanceLoan.kind;

      if (requestedKind !== advanceLoan.kind) {
        throw createHttpError("Finance Type cannot be changed after creation.", 400);
      }

      if (
        req.body.employeeId &&
        String(req.body.employeeId) !== String(advanceLoan.employeeId)
      ) {
        throw createHttpError("Employee cannot be changed after creation.", 400);
      }

      const hasRecoveryPlanPayload =
        req.body.recoveryPlan ||
        req.body.targetCycleKey ||
        req.body.firstCycleKey ||
        req.body.recoveryFrequency ||
        req.body.frequency ||
        req.body.installmentAmount !== undefined;
      const recoveryPlan = hasRecoveryPlanPayload
        ? buildWeavingRecoveryPlan({
            kind: advanceLoan.kind,
            payload: req.body,
          })
        : advanceLoan.recoveryPlan;

      if (hasRecoveries) {
        if (
          req.body.amount !== undefined &&
          roundMoney(req.body.amount) !== roundMoney(advanceLoan.amount)
        ) {
          throw createHttpError(
            "Original Amount cannot be changed after recovery has started.",
            400,
          );
        }

        if (
          req.body.paymentAccountId &&
          String(req.body.paymentAccountId) !== String(advanceLoan.paymentAccountId)
        ) {
          throw createHttpError(
            "Payment Account cannot be changed after recovery has started.",
            400,
          );
        }

        if (req.body.date || req.body.time) {
          const currentDateTime = parseEntryDateTime({
            date: advanceLoan.date,
            time: advanceLoan.time || "",
            label: "advance/loan date",
          });
          const requestedDateTime = parseEntryDateTime({
            date: req.body.date || advanceLoan.date,
            time: req.body.time ?? advanceLoan.time ?? "",
            label: "advance/loan date",
          });

          if (
            requestedDateTime.businessDate !== currentDateTime.businessDate ||
            requestedDateTime.businessTime !== currentDateTime.businessTime
          ) {
            throw createHttpError(
              "Date and Time cannot be changed after recovery has started.",
              400,
            );
          }
        }

        advanceLoan.description = normalizeText(
          req.body.description ?? advanceLoan.description,
        );
        advanceLoan.recoveryPlan = recoveryPlan;
        await advanceLoan.save({ session });
        return advanceLoan;
      }

      const amount =
        req.body.amount === undefined
          ? roundMoney(advanceLoan.amount)
          : roundMoney(req.body.amount);

      if (amount <= 0) {
        throw createHttpError("Amount must be greater than zero.", 400);
      }

      const { businessDate, businessTime } = parseEntryDateTime({
        date: req.body.date || advanceLoan.date || new Date(),
        time: req.body.time ?? advanceLoan.time ?? "",
        label: "advance/loan date",
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId || advanceLoan.paymentAccountId,
        session,
      });
      const currentDateTime = parseEntryDateTime({
        date: advanceLoan.date,
        time: advanceLoan.time || "",
        label: "advance/loan date",
      });
      const accountingChanged =
        amount !== roundMoney(advanceLoan.amount) ||
        businessDate !== currentDateTime.businessDate ||
        businessTime !== currentDateTime.businessTime ||
        String(paymentAccount._id) !== String(advanceLoan.paymentAccountId);

      if (accountingChanged && advanceLoan.journalEntryId) {
        const reversalResult = await reverseJournals({
          journalIds: [advanceLoan.journalEntryId],
          userId,
          date: new Date(),
          time: "",
          session,
        });
        touchedAccountIds.push(...reversalResult.accountIds);
        advanceLoan.reversalJournalEntryIds = [
          ...(advanceLoan.reversalJournalEntryIds || []),
          ...reversalResult.reversalIds,
        ];
      }

      advanceLoan.amount = amount;
      advanceLoan.outstandingAmount = amount;
      advanceLoan.date = businessDate;
      advanceLoan.time = businessTime;
      advanceLoan.paymentAccountId = paymentAccount._id;
      advanceLoan.paymentType = getPaymentTypeFromAccount(paymentAccount);
      advanceLoan.description = normalizeText(
        req.body.description ?? advanceLoan.description,
      );
      advanceLoan.recoveryPlan = recoveryPlan;
      advanceLoan.status = "active";
      await advanceLoan.save({ session });

      if (accountingChanged) {
        const journal = await createAdvanceLoanJournal({
          userId,
          moduleScope,
          employee: await validateEmployee({
            userId,
            employeeId: advanceLoan.employeeId,
            moduleScope,
            session,
          }),
          advanceLoan,
          paymentAccount,
          date: businessDate,
          time: businessTime,
          session,
        });

        advanceLoan.journalEntryId = journal._id;
        await advanceLoan.save({ session });
        touchedAccountIds.push(...collectAccountIdsFromJournal(journal));
      }

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to update employee advance/loan");
  }
};

exports.recoverAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const advanceLoan = await getSessionQuery(
        EmployeeAdvanceLoan.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $in: ["active", "closed"] },
        }),
        session,
      );

      if (!advanceLoan) {
        throw createHttpError("Advance/loan not found", 404);
      }

      const amount = roundMoney(req.body.amount);
      if (amount <= 0 || amount > roundMoney(advanceLoan.outstandingAmount)) {
        throw createHttpError("Invalid recovery amount.", 400);
      }

      const employee = await validateEmployee({
        userId,
        employeeId: advanceLoan.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const { businessDate, businessTime } = parseEntryDateTime({
        date: req.body.date || new Date(),
        time: req.body.time || "",
        label: "recovery date",
      });
      const journal = await createRecoveryJournal({
        userId,
        moduleScope,
        employee,
        advanceLoan,
        paymentAccount,
        date: businessDate,
        time: businessTime,
        amount,
        session,
      });

      advanceLoan.recoveredAmount = roundMoney(
        Number(advanceLoan.recoveredAmount || 0) + amount,
      );
      advanceLoan.outstandingAmount = roundMoney(
        Number(advanceLoan.outstandingAmount || 0) - amount,
      );
      advanceLoan.status =
        advanceLoan.outstandingAmount <= 0 ? "closed" : "active";
      advanceLoan.recoveryHistory.push({
        amount,
        date: businessDate,
        time: businessTime,
        paymentAccountId: paymentAccount._id,
        journalEntryId: journal._id,
        description: normalizeText(req.body.description),
      });
      await advanceLoan.save({ session });
      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to recover employee advance/loan");
  }
};

exports.voidAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const advanceLoan = await getSessionQuery(
        EmployeeAdvanceLoan.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
        }),
        session,
      );

      if (!advanceLoan) {
        throw createHttpError("Advance/loan not found", 404);
      }

      const hasPayrollRecovery = (advanceLoan.recoveryHistory || []).some(
        (entry) => entry.payrollId,
      );

      if (hasPayrollRecovery) {
        throw createHttpError(
          "Void the payroll recovery before deleting this advance/loan.",
          400,
        );
      }

      const recoveryJournalIds = (advanceLoan.recoveryHistory || [])
        .map((entry) => entry.journalEntryId)
        .filter(Boolean);
      const reversalResult = await reverseJournals({
        journalIds: [advanceLoan.journalEntryId, ...recoveryJournalIds],
        userId,
        date: new Date(),
        time: "",
        session,
      });

      touchedAccountIds = reversalResult.accountIds;
      advanceLoan.reversalJournalEntryIds = [
        ...(advanceLoan.reversalJournalEntryIds || []),
        ...reversalResult.reversalIds,
      ];
      advanceLoan.status = "void";
      advanceLoan.isDeleted = true;
      advanceLoan.voidedAt = new Date();
      advanceLoan.voidedBy = req.actorId || userId;
      advanceLoan.voidReason = normalizeText(req.body.reason);
      await advanceLoan.save({ session });

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ message: "Advance/loan voided", data: result });
  } catch (error) {
    return sendError(res, error, "Failed to void employee advance/loan");
  }
};

exports.getEmployeeLedger = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const ledger = await getEmployeeLedger({
      userId,
      moduleScope,
      employeeId: req.params.id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

    return res.json({ data: ledger });
  } catch (error) {
    return sendError(res, error, "Failed to load employee ledger");
  }
};

exports.printEmployeeLedger = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const ledger = await getEmployeeLedger({
      userId,
      moduleScope,
      employeeId: req.params.id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const html = buildDocumentHtml({
      title: "Employee Ledger",
      subtitle: ledger.employee.name,
      summary: [
        { label: "Debit", value: ledger.totals.debit },
        { label: "Credit", value: ledger.totals.credit },
        { label: "Closing", value: ledger.totals.closingBalance },
      ],
      rows: [
        ["Date", "Description", "Debit", "Credit", "Balance"],
        ...ledger.rows.map((row) => [
          row.formattedDate,
          row.description,
          row.debit,
          row.credit,
          row.balance,
        ]),
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, "Employee-Ledger.pdf");
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print employee ledger");
  }
};

exports.printPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payroll = await EmployeePayroll.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      isDeleted: false,
    })
      .populate("employeeId", "name phone designationName")
      .populate("paymentAccountId", "name code category")
      .lean();

    if (!payroll) {
      return res.status(404).json({ message: "Payroll not found" });
    }

    const html = buildDocumentHtml({
      title: "Salary Slip",
      subtitle: `${payroll.employeeId?.name || "Employee"} - ${payroll.periodKey}`,
      summary: [
        { label: "Base Salary", value: payroll.baseSalary },
        { label: "Additions", value: payroll.totalAdditions },
        { label: "Deductions", value: payroll.totalDeductions },
        { label: "Recoveries", value: payroll.recoveryAmount },
        { label: "Net Salary", value: payroll.netSalary },
        { label: "Paid", value: payroll.paidAmount },
        { label: "Due", value: payroll.remainingDue },
      ],
      rows: [
        ["Type", "Description", "Amount"],
        ...(payroll.additions || []).map((entry) => [
          "Addition",
          entry.description || entry.type,
          entry.amount,
        ]),
        ...(payroll.deductions || []).map((entry) => [
          "Deduction",
          entry.description || "-",
          entry.amount,
        ]),
        ...(payroll.recoveryApplications || []).map((entry) => [
          `${entry.kind} recovery`,
          entry.description || "-",
          entry.amount,
        ]),
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, `Salary-Slip-${payroll.periodKey}.pdf`);
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print payroll");
  }
};

exports.printPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const journal = await JournalEntry.findOne({
      _id: req.params.journalId,
      createdBy: userId,
      isDeleted: false,
      originModule: { $in: getOriginValuesForScope(moduleScope) },
    })
      .populate("employeeId", "name phone designationName")
      .lean();

    if (!journal) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const amount = (journal.lines || []).reduce(
      (max, line) => Math.max(max, Number(line.amount || 0)),
      0,
    );
    const html = buildDocumentHtml({
      title: "Employee Payment Voucher",
      subtitle: journal.employeeId?.name || "Employee",
      summary: [
        { label: "Date", value: formatDateSafe(journal.date) },
        { label: "Amount", value: amount },
        { label: "Description", value: journal.description },
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, "Employee-Payment-Voucher.pdf");
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print employee payment");
  }
};

const formatDateSafe = (value) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch (error) {
    return "";
  }
};
