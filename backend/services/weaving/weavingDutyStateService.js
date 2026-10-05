const WeavingAttendance = require("../../models/WeavingAttendance");

const idOf = (value) => String(value?._id || value || "");

/**
 * Double duty is derived from actual present shifts. The first present duty is
 * the normal duty and every later present shift is one extra duty.
 */
const deriveDoubleDutyUnits = (rows = []) =>
  Math.max(0, rows.filter((row) => row?.status === "present").length - 1);

const reconcileEmployeeDateDutyState = async ({
  userId,
  attendanceDate,
  employeeId,
  session,
}) => {
  if (!userId || !attendanceDate || !employeeId) return 0;

  const rows = await WeavingAttendance.find({
    userId,
    moduleScope: "weaving",
    attendanceDate,
    employeeId,
  })
    .sort({ createdAt: 1, _id: 1 })
    .session(session || null);

  const presentRows = rows.filter((row) => row.status === "present");
  const normalPresentId = idOf(presentRows[0]);

  for (const row of rows) {
    const isExtraDuty = row.status === "present" && idOf(row) !== normalPresentId;
    const replacement = Boolean(row.generatedByReplacement || row.replacementForEmployeeId);
    const dutyType = row.status !== "present"
      ? "normal"
      : isExtraDuty
        ? (replacement ? "double_replacement" : "double")
        : (replacement ? "replacement" : "normal");

    if (row.isDoubleDuty !== isExtraDuty || row.dutyType !== dutyType) {
      row.isDoubleDuty = isExtraDuty;
      row.dutyType = dutyType;
      await row.save(session ? { session } : undefined);
    }
  }

  return deriveDoubleDutyUnits(rows);
};

module.exports = {
  deriveDoubleDutyUnits,
  reconcileEmployeeDateDutyState,
};
