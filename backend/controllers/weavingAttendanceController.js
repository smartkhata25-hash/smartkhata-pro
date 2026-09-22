const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const WeavingAttendance = require("../models/WeavingAttendance");
const WeavingDepartment = require("../models/WeavingDepartment");
const WeavingShift = require("../models/WeavingShift");
const WeavingUnit = require("../models/WeavingUnit");
const { logActivity } = require("../utils/activityLogger");
const { PERMISSIONS } = require("../utils/permissionList");

const WEAVING_SCOPE = "weaving";
const BUSINESS_TIME_ZONE = "Asia/Karachi";
const BUSINESS_UTC_OFFSET = "+05:00";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const STATUS_VALUES = new Set(["present", "absent", "leave"]);

const getUserId = (req) => req.user?.id || req.userId;
const getActorId = (req) => req.actorId || req.user?.actorId || getUserId(req);

const createHttpError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallback = "Attendance request failed") => {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    message: error.message || fallback,
  });
};

const normalizeText = (value = "") => String(value || "").trim();

const toPlain = (value) =>
  value && typeof value.toObject === "function" ? value.toObject() : value;

const idOf = (value) => {
  if (!value) return "";
  if (value._id) return String(value._id);
  return String(value);
};

const sameId = (left, right) => idOf(left) === idOf(right);

const normalizeObjectId = (value, label, required = false) => {
  const text = normalizeText(value);

  if (!text) {
    if (required) {
      throw createHttpError(`${label} is required`, 400);
    }

    return "";
  }

  if (!mongoose.Types.ObjectId.isValid(text)) {
    throw createHttpError(`${label} is invalid`, 400);
  }

  return text;
};

const getBusinessDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError("Attendance date is invalid", 400);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const lookup = parts.reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

const normalizeDateKey = (value = new Date()) => {
  const text = normalizeText(value);

  if (!text) {
    return getBusinessDateKey();
  }

  const match = text.match(DATE_KEY_PATTERN);
  if (!match) {
    throw createHttpError("Attendance date is required", 400);
  }

  const dateKey = match[0];
  const parsed = new Date(`${dateKey}T00:00:00${BUSINESS_UTC_OFFSET}`);

  if (Number.isNaN(parsed.getTime()) || getBusinessDateKey(parsed) !== dateKey) {
    throw createHttpError("Attendance date is invalid", 400);
  }

  return dateKey;
};

const businessDateTime = (dateKey, timeValue) => {
  const time = TIME_PATTERN.test(normalizeText(timeValue))
    ? normalizeText(timeValue)
    : "23:59";

  return new Date(`${dateKey}T${time}:00${BUSINESS_UTC_OFFSET}`);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const buildLockState = (dateKey, shift = {}) => {
  const todayKey = getBusinessDateKey();
  const startTime = normalizeText(shift.startTime);
  const endTime = normalizeText(shift.endTime);

  if (dateKey > todayKey) {
    return {
      locked: true,
      reason: "future_date",
    };
  }

  if (!startTime || !endTime) {
    return {
      locked: dateKey !== todayKey,
      reason: dateKey === todayKey ? "open" : "historical_date",
    };
  }

  const now = new Date();
  const startAt = businessDateTime(dateKey, startTime);
  let endAt = businessDateTime(dateKey, endTime);

  if (endAt <= startAt) {
    endAt = addDays(endAt, 1);
  }

  return {
    locked: now > endAt || dateKey > todayKey,
    reason: now > endAt ? "shift_closed" : "open",
    startAt,
    endAt,
  };
};

const canOverrideAttendance = (req) => {
  if (req.user?.accountRole === "owner") return true;

  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];

  return permissions.includes(PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE);
};

const canManageAttendance = (req) => {
  if (req.user?.accountRole === "owner") return true;

  const permissions = Array.isArray(req.user?.permissions)
    ? req.user.permissions
    : [];

  return (
    permissions.includes(PERMISSIONS.WEAVING_ATTENDANCE.MANAGE) ||
    permissions.includes(PERMISSIONS.WEAVING_ATTENDANCE.OVERRIDE)
  );
};

const assertEditable = ({ req, lockState }) => {
  if (!canManageAttendance(req)) {
    throw createHttpError("You do not have permission to manage attendance", 403);
  }

  if (lockState.locked && !canOverrideAttendance(req)) {
    throw createHttpError("Attendance is locked for this shift", 423);
  }
};

const resolveUnit = async (userId, unitId) => {
  const id = normalizeObjectId(unitId, "Unit", true);
  const unit = await WeavingUnit.findOne({
    _id: id,
    userId,
    moduleScope: WEAVING_SCOPE,
    isDeleted: false,
    isActive: { $ne: false },
  }).lean();

  if (!unit) {
    throw createHttpError("Unit not found", 404);
  }

  return unit;
};

const resolveShift = async (userId, shiftId) => {
  const id = normalizeObjectId(shiftId, "Shift", true);
  const shift = await WeavingShift.findOne({
    _id: id,
    userId,
    moduleScope: WEAVING_SCOPE,
    isDeleted: false,
    isActive: { $ne: false },
  }).lean();

  if (!shift) {
    throw createHttpError("Shift not found", 404);
  }

  return shift;
};

const getAttendanceContext = async ({ req, source }) => {
  const userId = getUserId(req);
  const dateKey = normalizeDateKey(source.date || source.attendanceDate);
  const [unit, shift] = await Promise.all([
    resolveUnit(userId, source.unitId),
    resolveShift(userId, source.shiftId),
  ]);
  const lockState = buildLockState(dateKey, shift);

  return {
    userId,
    actorId: getActorId(req),
    dateKey,
    unit,
    shift,
    lockState,
  };
};

const buildUnitLabel = (unit = {}) =>
  unit.name ? `Unit ${unit.unitNo} - ${unit.name}` : `Unit ${unit.unitNo}`;

const buildEmployeeSnapshot = ({ employee, unit, shift }) => ({
  unitId: unit._id,
  unitNo: unit.unitNo || 0,
  unitName: buildUnitLabel(unit),
  shiftId: shift._id,
  shiftName: shift.name || "",
  employeeId: employee._id,
  employeeNo: employee.employeeNo || "",
  employeeName: employee.name || "",
  departmentId: employee.departmentId || null,
  departmentName: employee.departmentName || "",
  designationId: employee.designationId || null,
  designationName: employee.designationName || "",
  employeeShiftId: employee.shiftId || null,
  employeeShiftName: employee.shiftName || "",
});

const normalizeStatus = (value = "") => {
  const status = normalizeText(value).toLowerCase();
  return STATUS_VALUES.has(status) ? status : "";
};

const normalizeOtHours = (value) => {
  if (value === "" || value === null || value === undefined) return 0;

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0 || number > 24) {
    throw createHttpError("OT Hours must be between 0 and 24", 400);
  }

  return Math.round(number * 100) / 100;
};

const hasOtherPresentShift = async ({ userId, dateKey, employeeId, shiftId }) => {
  const existing = await WeavingAttendance.exists({
    userId,
    moduleScope: WEAVING_SCOPE,
    attendanceDate: dateKey,
    employeeId,
    shiftId: { $ne: shiftId },
    status: "present",
  });

  return Boolean(existing);
};

const serializeRow = ({ record = null, employee = null, locked = false }) => {
  const source = toPlain(record) || {};
  const employeeRow = toPlain(employee) || {};

  return {
    attendanceId: source._id ? String(source._id) : "",
    employeeId: String(source.employeeId || employeeRow._id || ""),
    employeeName: source.employeeName || employeeRow.name || "",
    employeeNo: source.employeeNo || employeeRow.employeeNo || "",
    listOrder: employeeRow.listOrder || 0,
    departmentId: idOf(source.departmentId || employeeRow.departmentId),
    departmentName: source.departmentName || employeeRow.departmentName || "",
    designationName: source.designationName || employeeRow.designationName || "",
    employeeShiftId: idOf(source.employeeShiftId || employeeRow.shiftId),
    employeeShiftName: source.employeeShiftName || employeeRow.shiftName || "",
    status: source.status || "",
    otHours: source.otHours || "",
    dutyType: source.dutyType || "normal",
    isDoubleDuty: Boolean(source.isDoubleDuty),
    replacementEmployeeId: idOf(source.replacementEmployeeId),
    replacementEmployeeName: source.replacementEmployeeName || "",
    replacementEmployeeNo: source.replacementEmployeeNo || "",
    replacementForEmployeeId: idOf(source.replacementForEmployeeId),
    replacementForEmployeeName: source.replacementForEmployeeName || "",
    replacementForEmployeeNo: source.replacementForEmployeeNo || "",
    generatedByReplacement: Boolean(source.generatedByReplacement),
    locked,
  };
};

const buildSummary = (rows = []) =>
  rows.reduce(
    (summary, row) => {
      summary.total += 1;

      if (row.status === "present") summary.present += 1;
      if (row.status === "absent") summary.absent += 1;
      if (row.status === "leave") summary.leave += 1;
      if (Number(row.otHours || 0) > 0) {
        summary.ot += 1;
        summary.otHours += Number(row.otHours || 0);
      }
      if (row.isDoubleDuty || String(row.dutyType || "").includes("double")) {
        summary.double += 1;
      }

      return summary;
    },
    {
      total: 0,
      present: 0,
      absent: 0,
      leave: 0,
      ot: 0,
      otHours: 0,
      double: 0,
    },
  );

const getSessionRows = async ({ userId, dateKey, unit, shift, lockState }) => {
  const baseEmployees = await Employee.find({
    userId,
    moduleScope: WEAVING_SCOPE,
    unitId: unit._id,
    shiftId: shift._id,
    status: "active",
    isDeleted: false,
  })
    .sort({ listOrder: 1, name: 1 })
    .lean();

  const records = await WeavingAttendance.find({
    userId,
    moduleScope: WEAVING_SCOPE,
    attendanceDate: dateKey,
    unitId: unit._id,
    shiftId: shift._id,
  })
    .sort({ createdAt: 1 })
    .lean();

  const baseMap = new Map(baseEmployees.map((employee) => [idOf(employee), employee]));
  const recordMap = new Map(records.map((record) => [idOf(record.employeeId), record]));
  const extraEmployeeIds = records
    .map((record) => idOf(record.employeeId))
    .filter((employeeId) => employeeId && !baseMap.has(employeeId));
  const extraEmployees = extraEmployeeIds.length
    ? await Employee.find({
        _id: { $in: extraEmployeeIds },
        userId,
        moduleScope: WEAVING_SCOPE,
      }).lean()
    : [];
  const employeeMap = new Map([
    ...baseEmployees.map((employee) => [idOf(employee), employee]),
    ...extraEmployees.map((employee) => [idOf(employee), employee]),
  ]);
  const rows = baseEmployees.map((employee) =>
    serializeRow({
      record: recordMap.get(idOf(employee)),
      employee,
      locked: lockState.locked,
    }),
  );

  records.forEach((record) => {
    const employeeId = idOf(record.employeeId);
    if (baseMap.has(employeeId)) return;

    const employee = employeeMap.get(employeeId);
    if (!employee) return;

    rows.push(
      serializeRow({
        record,
        employee,
        locked: lockState.locked,
      }),
    );
  });

  rows.sort((left, right) => {
    if (left.generatedByReplacement !== right.generatedByReplacement) {
      return left.generatedByReplacement ? 1 : -1;
    }

    return (
      Number(left.listOrder || 0) - Number(right.listOrder || 0) ||
      left.employeeName.localeCompare(right.employeeName)
    );
  });

  return rows;
};

const getReplacementOptions = async ({ userId, unit }) => {
  const employees = await Employee.find({
    userId,
    moduleScope: WEAVING_SCOPE,
    unitId: unit._id,
    status: "active",
    isDeleted: false,
  })
    .sort({ shiftName: 1, listOrder: 1, name: 1 })
    .lean();

  return employees.map((employee) => ({
    _id: String(employee._id),
    name: employee.name || "",
    employeeNo: employee.employeeNo || "",
    shiftId: idOf(employee.shiftId),
    shiftName: employee.shiftName || "",
    departmentId: idOf(employee.departmentId),
    departmentName: employee.departmentName || "",
    designationName: employee.designationName || "",
  }));
};

const buildSessionPayload = async ({ req, context }) => {
  const rows = await getSessionRows(context);
  const replacementOptions = await getReplacementOptions(context);
  const canOverride = canOverrideAttendance(req);
  const canManage = canManageAttendance(req);

  return {
    date: context.dateKey,
    unit: {
      _id: String(context.unit._id),
      unitNo: context.unit.unitNo,
      name: context.unit.name || "",
      label: buildUnitLabel(context.unit),
    },
    shift: {
      _id: String(context.shift._id),
      name: context.shift.name || "",
      startTime: context.shift.startTime || "",
      endTime: context.shift.endTime || "",
    },
    rows,
    replacementOptions,
    summary: buildSummary(rows),
    lock: {
      locked: context.lockState.locked,
      reason: context.lockState.reason,
      canOverride,
      canManage,
      canEdit: canManage && (!context.lockState.locked || canOverride),
    },
  };
};

const assertSelfBenefitAllowed = ({ req, employee, replacement, otHours }) => {
  if (req.user?.accountRole !== "staff" || canOverrideAttendance(req)) return;

  const actorId = idOf(getActorId(req));
  if (!actorId) return;

  if (sameId(employee.linkedUserId, actorId) && Number(otHours || 0) > 0) {
    throw createHttpError("You cannot assign OT to yourself", 403);
  }

  if (replacement && sameId(replacement.linkedUserId, actorId)) {
    throw createHttpError("You cannot assign yourself as replacement", 403);
  }
};

const prepareRowsForSave = async ({ req, context, rows }) => {
  if (!Array.isArray(rows)) {
    throw createHttpError("Attendance rows are required", 400);
  }

  const normalizedRows = [];
  const seenEmployees = new Set();
  const requestedEmployeeIds = new Set();

  rows.forEach((row) => {
    if (row?.generatedByReplacement || row?.replacementForEmployeeId) {
      return;
    }

    const employeeId = normalizeObjectId(row?.employeeId, "Employee", false);
    if (!employeeId) return;

    if (seenEmployees.has(employeeId)) {
      throw createHttpError("Duplicate employee attendance row found", 400);
    }

    seenEmployees.add(employeeId);

    const replacementEmployeeId = normalizeObjectId(
      row?.replacementEmployeeId,
      "Replacement Employee",
      false,
    );

    requestedEmployeeIds.add(employeeId);
    if (replacementEmployeeId) {
      requestedEmployeeIds.add(replacementEmployeeId);
    }

    normalizedRows.push({
      raw: row,
      employeeId,
      replacementEmployeeId,
    });
  });

  const employeeRows = requestedEmployeeIds.size
    ? await Employee.find({
        _id: { $in: [...requestedEmployeeIds] },
        userId: context.userId,
        moduleScope: WEAVING_SCOPE,
        unitId: context.unit._id,
        status: "active",
        isDeleted: false,
      }).lean()
    : [];
  const employeeMap = new Map(employeeRows.map((employee) => [idOf(employee), employee]));
  const replacementAssignments = new Set();
  const prepared = [];

  for (const row of normalizedRows) {
    const employee = employeeMap.get(row.employeeId);
    if (!employee) {
      throw createHttpError("Employee not found or hidden", 404);
    }

    if (!sameId(employee.shiftId, context.shift._id)) {
      throw createHttpError("Employee does not belong to the selected shift", 400);
    }

    const replacement = row.replacementEmployeeId
      ? employeeMap.get(row.replacementEmployeeId)
      : null;

    if (row.replacementEmployeeId && !replacement) {
      throw createHttpError("Replacement Employee not found or hidden", 404);
    }

    if (replacement && sameId(replacement._id, employee._id)) {
      throw createHttpError("Employee cannot replace themselves", 400);
    }

    if (replacement && sameId(replacement.shiftId, context.shift._id)) {
      throw createHttpError(
        "Replacement Employee already belongs to the selected shift",
        409,
      );
    }

    if (replacement && replacementAssignments.has(idOf(replacement._id))) {
      throw createHttpError("Replacement Employee is already assigned", 409);
    }

    if (replacement) {
      replacementAssignments.add(idOf(replacement._id));

      const existingTarget = await WeavingAttendance.findOne({
        userId: context.userId,
        moduleScope: WEAVING_SCOPE,
        attendanceDate: context.dateKey,
        shiftId: context.shift._id,
        employeeId: replacement._id,
      }).lean();

      if (
        existingTarget &&
        (!existingTarget.generatedByReplacement ||
          !sameId(existingTarget.replacementForEmployeeId, employee._id))
      ) {
        throw createHttpError(
          "Replacement Employee already has attendance in this shift",
          409,
        );
      }
    }

    const requestedOtHours = normalizeOtHours(row.raw?.otHours);
    let status = normalizeStatus(row.raw?.status);

    if (replacement) {
      status = "absent";
    } else if (!status && requestedOtHours > 0) {
      status = "present";
    }

    if (!status) {
      continue;
    }

    const otHours = status === "present" ? requestedOtHours : 0;

    assertSelfBenefitAllowed({
      req,
      employee,
      replacement,
      otHours,
    });

    prepared.push({
      employee,
      status,
      otHours,
      replacement,
    });
  }

  return prepared;
};

const savePreparedRows = async ({ req, context, preparedRows }) => {
  const actorId = context.actorId;
  let replacementChangeCount = 0;
  let savedCount = 0;

  for (const row of preparedRows) {
    const staleGeneratedQuery = {
      userId: context.userId,
      moduleScope: WEAVING_SCOPE,
      attendanceDate: context.dateKey,
      unitId: context.unit._id,
      shiftId: context.shift._id,
      replacementForEmployeeId: row.employee._id,
      generatedByReplacement: true,
      isManuallyEdited: { $ne: true },
    };

    if (row.replacement) {
      staleGeneratedQuery.employeeId = { $ne: row.replacement._id };
    }

    const deleted = await WeavingAttendance.deleteMany(staleGeneratedQuery);
    if (deleted.deletedCount > 0) {
      replacementChangeCount += deleted.deletedCount;
    }

    const isDoubleDuty = await hasOtherPresentShift({
      userId: context.userId,
      dateKey: context.dateKey,
      employeeId: row.employee._id,
      shiftId: context.shift._id,
    });
    const snapshot = buildEmployeeSnapshot({
      employee: row.employee,
      unit: context.unit,
      shift: context.shift,
    });
    const originalRecord = await WeavingAttendance.findOneAndUpdate(
      {
        userId: context.userId,
        moduleScope: WEAVING_SCOPE,
        attendanceDate: context.dateKey,
        shiftId: context.shift._id,
        employeeId: row.employee._id,
      },
      {
        $set: {
          ...snapshot,
          status: row.status,
          otHours: row.otHours,
          dutyType:
            row.status === "present" && isDoubleDuty ? "double" : "normal",
          isDoubleDuty: row.status === "present" && isDoubleDuty,
          replacementEmployeeId: row.replacement?._id || null,
          replacementEmployeeNo: row.replacement?.employeeNo || "",
          replacementEmployeeName: row.replacement?.name || "",
          replacementForEmployeeId: null,
          replacementForEmployeeNo: "",
          replacementForEmployeeName: "",
          replacementAttendanceId: null,
          sourceAttendanceId: null,
          generatedByReplacement: false,
          isManuallyEdited: false,
          updatedBy: actorId,
          lastEditedAfterLock: context.lockState.locked,
          lastEditedAfterLockAt: context.lockState.locked ? new Date() : null,
          lastEditedAfterLockBy: context.lockState.locked ? actorId : null,
        },
        $setOnInsert: {
          createdBy: actorId,
          moduleScope: WEAVING_SCOPE,
          attendanceDate: context.dateKey,
          userId: context.userId,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
    savedCount += 1;

    if (!row.replacement) {
      continue;
    }

    replacementChangeCount += 1;

    const replacementIsDouble = await hasOtherPresentShift({
      userId: context.userId,
      dateKey: context.dateKey,
      employeeId: row.replacement._id,
      shiftId: context.shift._id,
    });
    const generatedRecord = await WeavingAttendance.findOneAndUpdate(
      {
        userId: context.userId,
        moduleScope: WEAVING_SCOPE,
        attendanceDate: context.dateKey,
        shiftId: context.shift._id,
        employeeId: row.replacement._id,
      },
      {
        $set: {
          ...buildEmployeeSnapshot({
            employee: row.replacement,
            unit: context.unit,
            shift: context.shift,
          }),
          status: "present",
          otHours: 0,
          dutyType: replacementIsDouble ? "double_replacement" : "replacement",
          isDoubleDuty: replacementIsDouble,
          replacementEmployeeId: null,
          replacementEmployeeNo: "",
          replacementEmployeeName: "",
          replacementForEmployeeId: row.employee._id,
          replacementForEmployeeNo: row.employee.employeeNo || "",
          replacementForEmployeeName: row.employee.name || "",
          replacementAttendanceId: null,
          sourceAttendanceId: originalRecord._id,
          generatedByReplacement: true,
          isManuallyEdited: false,
          updatedBy: actorId,
          lastEditedAfterLock: context.lockState.locked,
          lastEditedAfterLockAt: context.lockState.locked ? new Date() : null,
          lastEditedAfterLockBy: context.lockState.locked ? actorId : null,
        },
        $setOnInsert: {
          createdBy: actorId,
          moduleScope: WEAVING_SCOPE,
          attendanceDate: context.dateKey,
          userId: context.userId,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );

    await WeavingAttendance.updateOne(
      { _id: originalRecord._id },
      { $set: { replacementAttendanceId: generatedRecord._id } },
    );
    savedCount += 1;
  }

  if (context.lockState.locked || replacementChangeCount > 0) {
    await logActivity({
      req,
      action: "update",
      module: "weaving.attendance",
      moduleScope: WEAVING_SCOPE,
      entityType: "WeavingAttendance",
      title: `Attendance ${context.dateKey}`,
      description: context.lockState.locked
        ? "Locked attendance was updated with override permission"
        : "Attendance replacement records were updated",
      metadata: {
        date: context.dateKey,
        unitId: idOf(context.unit._id),
        shiftId: idOf(context.shift._id),
        replacementChangeCount,
      },
    });
  }

  return {
    savedCount,
    replacementChangeCount,
  };
};

exports.getAttendanceMeta = async (req, res) => {
  try {
    const userId = getUserId(req);
    const [units, departments, shifts] = await Promise.all([
      WeavingUnit.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        isActive: { $ne: false },
      })
        .sort({ unitNo: 1, name: 1 })
        .lean(),
      WeavingDepartment.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        isActive: { $ne: false },
      })
        .sort({ name: 1 })
        .lean(),
      WeavingShift.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        isDeleted: false,
        isActive: { $ne: false },
      })
        .sort({ name: 1 })
        .lean(),
    ]);

    return res.json({
      data: {
        date: getBusinessDateKey(),
        units,
        departments,
        shifts,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load attendance setup");
  }
};

exports.getAttendanceSession = async (req, res) => {
  try {
    const context = await getAttendanceContext({
      req,
      source: req.query,
    });
    const data = await buildSessionPayload({ req, context });

    return res.json({ data });
  } catch (error) {
    return sendError(res, error, "Failed to load attendance");
  }
};

exports.saveAttendanceSession = async (req, res) => {
  try {
    const context = await getAttendanceContext({
      req,
      source: req.body,
    });

    assertEditable({ req, lockState: context.lockState });

    const preparedRows = await prepareRowsForSave({
      req,
      context,
      rows: req.body.rows,
    });
    const result = await savePreparedRows({
      req,
      context,
      preparedRows,
    });
    const data = await buildSessionPayload({ req, context });

    return res.json({
      message: "Attendance saved",
      data: {
        ...data,
        savedCount: result.savedCount,
        replacementChangeCount: result.replacementChangeCount,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Duplicate Employee attendance for this Date and Shift is not allowed",
      });
    }

    return sendError(res, error, "Failed to save attendance");
  }
};

exports.getAttendanceDashboardSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const dateKey = normalizeDateKey(req.query.date);
    const [total, rows] = await Promise.all([
      Employee.countDocuments({
        userId,
        moduleScope: WEAVING_SCOPE,
        status: "active",
        isDeleted: false,
      }),
      WeavingAttendance.find({
        userId,
        moduleScope: WEAVING_SCOPE,
        attendanceDate: dateKey,
      })
        .select("status otHours dutyType isDoubleDuty")
        .lean(),
    ]);
    const summary = buildSummary(rows);

    return res.json({
      data: {
        date: dateKey,
        ...summary,
        total,
      },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load attendance summary");
  }
};
