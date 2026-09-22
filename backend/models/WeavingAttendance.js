const mongoose = require("mongoose");

const ATTENDANCE_STATUSES = ["present", "absent", "leave"];
const DUTY_TYPES = ["normal", "double", "replacement", "double_replacement"];

const weavingAttendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleScope: {
      type: String,
      enum: ["weaving"],
      default: "weaving",
      index: true,
    },
    attendanceDate: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingUnit",
      required: true,
      index: true,
    },
    unitNo: {
      type: Number,
      default: 0,
    },
    unitName: {
      type: String,
      trim: true,
      default: "",
    },
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingShift",
      required: true,
      index: true,
    },
    shiftName: {
      type: String,
      trim: true,
      default: "",
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    employeeNo: {
      type: String,
      trim: true,
      default: "",
    },
    employeeName: {
      type: String,
      trim: true,
      default: "",
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingDepartment",
      default: null,
      index: true,
    },
    departmentName: {
      type: String,
      trim: true,
      default: "",
    },
    designationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeDesignation",
      default: null,
    },
    designationName: {
      type: String,
      trim: true,
      default: "",
    },
    employeeShiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingShift",
      default: null,
    },
    employeeShiftName: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      required: true,
      index: true,
    },
    otHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    dutyType: {
      type: String,
      enum: DUTY_TYPES,
      default: "normal",
      index: true,
    },
    isDoubleDuty: {
      type: Boolean,
      default: false,
      index: true,
    },
    replacementEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
    },
    replacementEmployeeNo: {
      type: String,
      trim: true,
      default: "",
    },
    replacementEmployeeName: {
      type: String,
      trim: true,
      default: "",
    },
    replacementForEmployeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      default: null,
      index: true,
    },
    replacementForEmployeeNo: {
      type: String,
      trim: true,
      default: "",
    },
    replacementForEmployeeName: {
      type: String,
      trim: true,
      default: "",
    },
    replacementAttendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingAttendance",
      default: null,
    },
    sourceAttendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingAttendance",
      default: null,
    },
    generatedByReplacement: {
      type: Boolean,
      default: false,
      index: true,
    },
    isManuallyEdited: {
      type: Boolean,
      default: false,
    },
    lastEditedAfterLock: {
      type: Boolean,
      default: false,
    },
    lastEditedAfterLockAt: {
      type: Date,
      default: null,
    },
    lastEditedAfterLockBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

weavingAttendanceSchema.index(
  {
    userId: 1,
    moduleScope: 1,
    attendanceDate: 1,
    shiftId: 1,
    employeeId: 1,
  },
  { unique: true },
);
weavingAttendanceSchema.index({
  userId: 1,
  moduleScope: 1,
  attendanceDate: 1,
  unitId: 1,
  shiftId: 1,
});
weavingAttendanceSchema.index({
  userId: 1,
  moduleScope: 1,
  attendanceDate: 1,
  employeeId: 1,
  status: 1,
});

weavingAttendanceSchema.pre("validate", function (next) {
  [
    "attendanceDate",
    "unitName",
    "shiftName",
    "employeeNo",
    "employeeName",
    "departmentName",
    "designationName",
    "employeeShiftName",
    "replacementEmployeeNo",
    "replacementEmployeeName",
    "replacementForEmployeeNo",
    "replacementForEmployeeName",
  ].forEach((field) => {
    if (this[field]) {
      this[field] = String(this[field]).trim();
    }
  });

  if (this.status !== "present") {
    this.otHours = 0;
  }

  next();
});

module.exports = mongoose.model("WeavingAttendance", weavingAttendanceSchema);
