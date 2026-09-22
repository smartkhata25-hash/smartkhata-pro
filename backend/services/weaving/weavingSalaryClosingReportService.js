const mongoose = require("mongoose");

const EmployeePayroll = require("../../models/EmployeePayroll");
const PrintSetting = require("../../models/PrintSetting");
const User = require("../../models/User");
const WeavingUnit = require("../../models/WeavingUnit");
const {
  buildSegmentStorageKey,
  getCycleRuntime,
  getPayrollBaseCycleKey,
  getPayrollSegmentNo,
  resolvePayrollCycle,
} = require("./weavingPayrollService");

const WEAVING_SCOPE = "weaving";
const SEGMENT_STORAGE_KEY_PATTERN = /^(\d{4}-\d{2}-H[12])(?:-S(\d+))?$/i;
const OFFICIAL_STATUSES = new Set([
  "posted",
  "finalized",
  "partially_paid",
  "paid",
]);

const roundMoney = (value = 0) => Math.round(Number(value || 0) * 100) / 100;

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeText = (value = "") => String(value || "").trim();

const hasExplicitSegmentStorageKey = (value = "") =>
  Boolean(normalizeText(value).match(SEGMENT_STORAGE_KEY_PATTERN)?.[2]);

const formatDate = (value = "") => {
  if (!value) return "";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return date.toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatPeriodLabel = (cycle) => {
  const start = new Date(`${cycle.periodStart}T00:00:00.000Z`);
  const end = new Date(`${cycle.periodEnd}T00:00:00.000Z`);
  const sameDate = cycle.periodStart === cycle.periodEnd;
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();

  if (sameDate) {
    return formatDate(cycle.periodStart);
  }

  const startLabel = start.toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    ...(sameMonth ? {} : { month: "short", year: "numeric" }),
  });
  const endLabel = end.toLocaleDateString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return `${startLabel}-${endLabel}`;
};

const getId = (value) => String(value?._id || value || "");

const isReportPayrollStatusIncluded = (status = "") => status !== "void";

const isOfficialPayrollStatus = (status = "") => OFFICIAL_STATUSES.has(status);

const getEmployeeSnapshot = (payroll = {}) => {
  const employee =
    payroll.employeeId && typeof payroll.employeeId === "object"
      ? payroll.employeeId
      : {};

  return {
    employeeId: getId(employee) || getId(payroll.employeeId),
    employeeNo: employee.employeeNo || "",
    employeeName: employee.name || "Missing Employee",
    unitId: getId(employee.unitId),
    unitNo: Number(employee.unitNo || 0),
    unitName:
      employee.unitName ||
      (employee.unitNo ? `Unit ${employee.unitNo}` : "No Unit"),
    departmentName: employee.departmentName || "",
    designationName: employee.designationName || "",
    listOrder: Number(employee.listOrder || 0),
    isHidden: Boolean(employee.isDeleted),
  };
};

const splitSavedRecoveries = (payroll = {}) => {
  const applications = Array.isArray(payroll.recoveryApplications)
    ? payroll.recoveryApplications
    : [];

  return applications.reduce(
    (totals, recovery) => {
      const amount = roundMoney(recovery?.amount);

      if (recovery?.kind === "loan") {
        totals.loan = roundMoney(totals.loan + amount);
      } else if (recovery?.kind === "advance") {
        totals.kharcha = roundMoney(totals.kharcha + amount);
      }

      return totals;
    },
    { loan: 0, kharcha: 0 },
  );
};

const buildSalaryClosingRow = (payroll = {}) => {
  const employee = getEmployeeSnapshot(payroll);
  const recoveries = splitSavedRecoveries(payroll);
  const financeRecovery = roundMoney(payroll.recoveryAmount);
  const deduction = roundMoney(
    Math.max(0, Number(payroll.totalDeductions || 0) - financeRecovery),
  );
  const paidAmount = roundMoney(payroll.paidAmount);
  const payable = roundMoney(Math.max(0, Number(payroll.remainingDue || 0)));

  return {
    payrollId: getId(payroll),
    employeeId: employee.employeeId,
    employeeNo: employee.employeeNo,
    employeeName: employee.employeeName,
    unitId: employee.unitId,
    unitNo: employee.unitNo,
    unitName: employee.unitName,
    departmentName: employee.departmentName,
    designationName: employee.designationName,
    listOrder: employee.listOrder,
    isHidden: employee.isHidden,
    salary: roundMoney(payroll.baseSalary),
    plus: roundMoney(payroll.totalAdditions),
    deduction,
    loan: recoveries.loan,
    kharcha: recoveries.kharcha,
    netSalary: roundMoney(payroll.netSalary),
    paidAmount,
    payable,
    payrollStatus: payroll.status || "",
    baseCycleKey: getPayrollBaseCycleKey(payroll),
    segmentNo: getPayrollSegmentNo(payroll),
    storageKey: buildSegmentStorageKey(
      getPayrollBaseCycleKey(payroll),
      getPayrollSegmentNo(payroll),
    ),
    segmentStart: normalizeText(payroll.segmentStart || payroll.periodStart),
    segmentEnd: normalizeText(payroll.segmentEnd || payroll.periodEnd),
    earlyClosed: Boolean(payroll.earlyClosed),
    earlyCloseThroughDate: normalizeText(payroll.earlyCloseThroughDate),
    earlyCloseReason: normalizeText(payroll.earlyCloseReason),
  };
};

const emptyTotals = () => ({
  employees: 0,
  salary: 0,
  plus: 0,
  deduction: 0,
  loan: 0,
  kharcha: 0,
  netSalary: 0,
  paid: 0,
  payable: 0,
});

const addRowToTotals = (totals, row) => {
  totals.employees += 1;
  totals.salary = roundMoney(totals.salary + Number(row.salary || 0));
  totals.plus = roundMoney(totals.plus + Number(row.plus || 0));
  totals.deduction = roundMoney(totals.deduction + Number(row.deduction || 0));
  totals.loan = roundMoney(totals.loan + Number(row.loan || 0));
  totals.kharcha = roundMoney(totals.kharcha + Number(row.kharcha || 0));
  totals.netSalary = roundMoney(totals.netSalary + Number(row.netSalary || 0));
  totals.paid = roundMoney(totals.paid + Number(row.paidAmount || 0));
  totals.payable = roundMoney(totals.payable + Number(row.payable || 0));

  return totals;
};

const sortSalaryClosingRows = (left, right) => {
  if (left.unitNo !== right.unitNo) return left.unitNo - right.unitNo;
  if (left.listOrder !== right.listOrder) return left.listOrder - right.listOrder;

  return String(left.employeeName || "").localeCompare(
    String(right.employeeName || ""),
  );
};

const groupSalaryClosingRows = (rows = []) => {
  const groupsByUnit = new Map();

  rows.forEach((row) => {
    const key = row.unitId || `unit-${row.unitNo || 0}-${row.unitName || "none"}`;
    const current = groupsByUnit.get(key) || {
      unitId: row.unitId,
      unitNo: row.unitNo,
      unitName: row.unitName,
      rows: [],
      totals: emptyTotals(),
    };

    current.rows.push(row);
    addRowToTotals(current.totals, row);
    groupsByUnit.set(key, current);
  });

  return [...groupsByUnit.values()].sort((left, right) => {
    if (left.unitNo !== right.unitNo) return left.unitNo - right.unitNo;

    return String(left.unitName || "").localeCompare(String(right.unitName || ""));
  });
};

const buildSalaryClosingReportData = ({
  cycle,
  unitId = "",
  unitName = "All Units",
  rows = [],
  business = {},
  segments = [],
  selectedSegmentNo = 1,
  todayKey,
}) => {
  const sortedRows = [...rows].sort(sortSalaryClosingRows);
  const summary = sortedRows.reduce(addRowToTotals, emptyTotals());
  const draftCount = sortedRows.filter((row) => row.payrollStatus === "draft").length;
  const finalizedCount = sortedRows.filter((row) =>
    isOfficialPayrollStatus(row.payrollStatus),
  ).length;
  const groups = groupSalaryClosingRows(sortedRows);
  const earlyClosedRows = sortedRows.filter((row) => row.earlyClosed);
  const earlyClosed =
    sortedRows.length > 0 && earlyClosedRows.length === sortedRows.length;
  const earlyCloseThroughDate =
    earlyClosedRows.find((row) => row.earlyCloseThroughDate)
      ?.earlyCloseThroughDate || "";
  const earlyCloseReason =
    earlyClosedRows.find((row) => row.earlyCloseReason)?.earlyCloseReason || "";
  const selectedSegment =
    segments.find((segment) => segment.segmentNo === selectedSegmentNo) || {};
  const segmentStart =
    sortedRows.find((row) => row.segmentStart)?.segmentStart ||
    selectedSegment.segmentStart ||
    cycle.periodStart;
  const segmentEnd =
    sortedRows.find((row) => row.segmentEnd)?.segmentEnd ||
    selectedSegment.segmentEnd ||
    cycle.periodEnd;
  const effectiveCycle =
    earlyClosed && earlyCloseThroughDate
      ? {
          ...cycle,
          periodStart: segmentStart,
          periodEnd: earlyCloseThroughDate,
        }
      : {
          ...cycle,
          periodStart: segmentStart,
          periodEnd: segmentEnd,
        };
  const runtime = getCycleRuntime(cycle, todayKey);
  const isFullyFinalized =
    sortedRows.length > 0 && draftCount === 0 && finalizedCount === sortedRows.length;

  return {
    cycle: {
      key: cycle.key,
      periodStart: effectiveCycle.periodStart,
      periodEnd: effectiveCycle.periodEnd,
      originalPeriodStart: cycle.periodStart,
      originalPeriodEnd: cycle.periodEnd,
      dueDate: cycle.dueDate,
      periodLabel: formatPeriodLabel(effectiveCycle),
      originalPeriodLabel: formatPeriodLabel(cycle),
      dueDateLabel: formatDate(cycle.dueDate),
      earlyClosed,
      earlyCloseThroughDate,
      earlyCloseThroughDateLabel: formatDate(earlyCloseThroughDate),
      earlyCloseReason,
      segmentNo: selectedSegmentNo,
      storageKey: buildSegmentStorageKey(cycle.key, selectedSegmentNo),
    },
    segments,
    selection: {
      unitId: unitId || "",
      unitName: unitName || "All Units",
    },
    status: {
      payrollCount: sortedRows.length,
      draftCount,
      finalizedCount,
      canOfficialPrint: isFullyFinalized && (!runtime.isProvisional || earlyClosed),
      provisionalPrintBlocked: isFullyFinalized && runtime.isProvisional && !earlyClosed,
    },
    summary,
    groups,
    rows: sortedRows,
    business,
  };
};

const getBusinessInfo = async (userId) => {
  const [user, printSetting] = await Promise.all([
    User.findById(userId).select("businessName mobile address").lean(),
    PrintSetting.findOne({ userId }).select("sales.header").lean(),
  ]);
  const header = printSetting?.sales?.header || {};

  return {
    name: normalizeText(header.companyName) || normalizeText(user?.businessName) || "Smart Khata",
    address:
      header.showCompanyAddress === false
        ? ""
        : normalizeText(header.address) || normalizeText(user?.address),
    mobile:
      header.showCompanyPhone === false
        ? ""
        : normalizeText(header.phone) || normalizeText(user?.mobile),
  };
};

const getSelectedUnit = async ({ userId, unitId }) => {
  if (!unitId) {
    return {
      unitId: "",
      unitName: "All Units",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(unitId)) {
    throw createHttpError("Unit is invalid", 400);
  }

  const unit = await WeavingUnit.findOne({
    _id: unitId,
    userId,
    moduleScope: WEAVING_SCOPE,
    isDeleted: false,
  }).lean();

  if (!unit) {
    throw createHttpError("Unit not found", 404);
  }

  return {
    unitId: String(unit._id),
    unitName: unit.name || `Unit ${unit.unitNo}`,
  };
};

const getSalaryClosingReport = async ({ userId, cycleKey, segmentNo, unitId = "" }) => {
  const cycle = resolvePayrollCycle(getPayrollBaseCycleKey(cycleKey));
  const [selection, business] = await Promise.all([
    getSelectedUnit({ userId, unitId }),
    getBusinessInfo(userId),
  ]);
  const payrolls = await EmployeePayroll.find({
    userId,
    moduleScope: WEAVING_SCOPE,
    isDeleted: false,
    status: { $ne: "void" },
    $or: [
      { baseCycleKey: cycle.key },
      {
        baseCycleKey: { $in: ["", null] },
        cycleKey: cycle.key,
      },
      {
        baseCycleKey: { $in: ["", null] },
        periodKey: cycle.key,
      },
    ],
  })
    .populate(
      "employeeId",
      "employeeNo name unitId unitNo unitName departmentName designationName listOrder isDeleted",
    )
    .sort({ unitNo: 1, listOrder: 1, createdAt: 1 })
    .lean();
  const segmentNos = [
    ...new Set(payrolls.map((payroll) => getPayrollSegmentNo(payroll))),
  ].sort((left, right) => left - right);
  const requestedSegmentNo =
    Number.parseInt(segmentNo, 10) ||
    (hasExplicitSegmentStorageKey(cycleKey) ? getPayrollSegmentNo(cycleKey) : 0);
  const selectedSegmentNo =
    requestedSegmentNo && segmentNos.includes(requestedSegmentNo)
      ? requestedSegmentNo
      : segmentNos[segmentNos.length - 1] || requestedSegmentNo || 1;
  const selectedStorageKey = buildSegmentStorageKey(cycle.key, selectedSegmentNo);
  const segments = segmentNos.length
    ? segmentNos.map((item) => {
        const segmentRows = payrolls.filter(
          (payroll) => getPayrollSegmentNo(payroll) === item,
        );
        const first = segmentRows[0] || {};
        const earlyClosed =
          segmentRows.length > 0 && segmentRows.every((payroll) => payroll.earlyClosed);
        const throughDate =
          segmentRows.find((payroll) => payroll.earlyCloseThroughDate)
            ?.earlyCloseThroughDate || "";

        return {
          segmentNo: item,
          storageKey: buildSegmentStorageKey(cycle.key, item),
          segmentStart: first.segmentStart || first.periodStart || cycle.periodStart,
          segmentEnd: earlyClosed && throughDate ? throughDate : first.segmentEnd || cycle.periodEnd,
          earlyClosed,
          hasDraft: segmentRows.some((payroll) => payroll.status === "draft"),
        };
      })
    : [
        {
          segmentNo: 1,
          storageKey: cycle.key,
          segmentStart: cycle.periodStart,
          segmentEnd: cycle.periodEnd,
          earlyClosed: false,
          hasDraft: false,
        },
      ];
  const rows = payrolls
    .filter(
      (payroll) =>
        buildSegmentStorageKey(cycle.key, getPayrollSegmentNo(payroll)) === selectedStorageKey,
    )
    .filter((payroll) => isReportPayrollStatusIncluded(payroll.status))
    .map(buildSalaryClosingRow)
    .filter((row) => !selection.unitId || row.unitId === selection.unitId);

  return buildSalaryClosingReportData({
    cycle,
    unitId: selection.unitId,
    unitName: selection.unitName,
    rows,
    business,
    segments,
    selectedSegmentNo,
  });
};

const assertOfficialPrintable = (report) => {
  if (report.status.canOfficialPrint) return;

  if (report.status.draftCount > 0) {
    throw createHttpError(
      `${report.status.draftCount} payrolls are still Draft. Finalize payroll before printing the official Salary Closing Sheet.`,
      409,
    );
  }

  if (report.status.provisionalPrintBlocked) {
    throw createHttpError(
      "This provisional payroll cycle is not official yet. Use Early Close or wait until cycle end before printing.",
      409,
    );
  }

  throw createHttpError("No finalized payroll found for this selection.", 409);
};

module.exports = {
  buildSalaryClosingReportData,
  buildSalaryClosingRow,
  getSalaryClosingReport,
  assertOfficialPrintable,
  splitSavedRecoveries,
  _test: {
    buildSalaryClosingReportData,
    buildSalaryClosingRow,
    isOfficialPayrollStatus,
    isReportPayrollStatusIncluded,
    splitSavedRecoveries,
  },
};
