const mongoose = require("mongoose");

const weavingAttendanceCorrectionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
  attendanceId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingAttendance", required: true },
  attendanceDate: { type: String, required: true, index: true },
  shiftId: { type: mongoose.Schema.Types.ObjectId, ref: "WeavingShift", required: true },
  previousStatus: { type: String, default: "" },
  newStatus: { type: String, default: "" },
  previousOtHours: { type: Number, default: 0 },
  newOtHours: { type: Number, default: 0 },
  previousIsDoubleDuty: { type: Boolean, default: false },
  newIsDoubleDuty: { type: Boolean, default: false },
  previousReplacementEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  newReplacementEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  previousReplacementForEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  newReplacementForEmployeeId: { type: mongoose.Schema.Types.ObjectId, ref: "Employee", default: null },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  payrollId: { type: mongoose.Schema.Types.ObjectId, ref: "EmployeePayroll", default: null },
  payrollIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "EmployeePayroll" }],
  oldPayrollNetAmount: { type: Number, default: 0 },
  revisedPayrollNetAmount: { type: Number, default: 0 },
  oldJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
  reversalJournalEntryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry" }],
  newJournalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: "JournalEntry", default: null },
}, { timestamps: true });

module.exports = mongoose.model("WeavingAttendanceCorrection", weavingAttendanceCorrectionSchema);
