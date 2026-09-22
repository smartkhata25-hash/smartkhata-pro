const mongoose = require("mongoose");

const WEEKDAY_KEYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const additionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["bonus", "commission", "overtime", "other"],
      default: "other",
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    scheduledAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    cycleKey: {
      type: String,
      trim: true,
      default: "",
    },
    frequency: {
      type: String,
      enum: ["one_time", "carry_forward", "every_payroll_cycle", "monthly", ""],
      default: "",
    },
    isSkipped: {
      type: Boolean,
      default: false,
    },
    isManualOverride: {
      type: Boolean,
      default: false,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const deductionSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const recoveryApplicationSchema = new mongoose.Schema(
  {
    advanceLoanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeeAdvanceLoan",
      default: null,
    },
    kind: {
      type: String,
      enum: ["advance", "loan"],
      default: "advance",
    },
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false },
);

const paymentHistorySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque", ""],
      default: "",
    },
    paymentDate: {
      type: Date,
      default: null,
    },
    paymentTime: {
      type: String,
      trim: true,
      default: "",
    },
    receivedBy: {
      type: String,
      enum: ["self", "other"],
      default: "self",
    },
    receiverName: {
      type: String,
      trim: true,
      default: "",
    },
    receiverPhone: {
      type: String,
      trim: true,
      default: "",
    },
    note: {
      type: String,
      trim: true,
      default: "",
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { _id: false },
);

const employeePayrollSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    moduleScope: {
      type: String,
      enum: ["trading", "travel", "weaving"],
      default: "trading",
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    periodKey: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{4}-\d{2}(?:-H[12](?:-S\d+)?)?$/,
      index: true,
    },
    cycleKey: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    baseCycleKey: {
      type: String,
      trim: true,
      default: "",
      match: /^$|^\d{4}-\d{2}-H[12]$/,
      index: true,
    },
    segmentNo: {
      type: Number,
      default: 1,
      min: 1,
      index: true,
    },
    periodStart: {
      type: String,
      trim: true,
      default: "",
    },
    periodEnd: {
      type: String,
      trim: true,
      default: "",
    },
    calculationThroughDate: {
      type: String,
      trim: true,
      default: "",
    },
    segmentStart: {
      type: String,
      trim: true,
      default: "",
    },
    segmentEnd: {
      type: String,
      trim: true,
      default: "",
    },
    resumedAt: {
      type: Date,
      default: null,
    },
    resumedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resumeNote: {
      type: String,
      trim: true,
      default: "",
    },
    dueDate: {
      type: Date,
      default: null,
      index: true,
    },
    salaryDate: {
      type: Date,
      required: true,
    },
    salaryTime: {
      type: String,
      default: "",
    },
    baseSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    salaryTypeSnapshot: {
      type: String,
      enum: ["monthly", "daily", ""],
      default: "",
    },
    salaryRateSnapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    knottingPaymentMethodSnapshot: { type: String, default: "" },
    knottingEarnings: { type: Number, min: 0, default: 0 },
    knottingJobIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "WeavingKnottingJob" }],
    dutyHoursSnapshot: {
      type: Number,
      default: 0,
      min: 0,
      max: 24,
    },
    weeklyOffDaysSnapshot: {
      type: [
        {
          type: String,
          enum: WEEKDAY_KEYS,
        },
      ],
      default: [],
    },
    paidLeaveAllowanceSnapshot: {
      type: Number,
      default: 0,
      min: 0,
    },
    otAllowedSnapshot: {
      type: Boolean,
      default: true,
    },
    halfDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    eligibleDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    presentDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    absentDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    leaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidLeaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    unpaidLeaveDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    weeklyOffDaysInPeriod: {
      type: Number,
      default: 0,
      min: 0,
    },
    offDayWorkedDays: {
      type: Number,
      default: 0,
      min: 0,
    },
    offDayWorkedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    otHours: {
      type: Number,
      default: 0,
      min: 0,
    },
    otAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    doubleDutyCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    doubleDutyAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    proratedBaseSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    absentDeductionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    unpaidLeaveDeductionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    manualAdditionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    manualDeductionAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    missingAttendanceDates: {
      type: [String],
      default: [],
    },
    attendanceIncomplete: {
      type: Boolean,
      default: false,
      index: true,
    },
    finalizeBlockedReasons: {
      type: [String],
      default: [],
    },
    openingBalanceRecovery: {
      type: {
        applied: { type: Boolean, default: false },
        amount: { type: Number, default: 0, min: 0 },
        sourceAmount: { type: Number, default: 0, min: 0 },
        balanceType: {
          type: String,
          enum: ["payable", "receivable", ""],
          default: "",
        },
        deductionIntent: {
          type: String,
          enum: ["future_salary", "manual_review", ""],
          default: "",
        },
        targetCycleKey: { type: String, trim: true, default: "" },
        targetPayDate: { type: Date, default: null },
        description: { type: String, trim: true, default: "" },
      },
      default: () => ({
        applied: false,
        amount: 0,
        sourceAmount: 0,
        balanceType: "",
        deductionIntent: "",
        targetCycleKey: "",
        targetPayDate: null,
        description: "",
      }),
    },
    additions: [additionSchema],
    deductions: [deductionSchema],
    recoveryApplications: [recoveryApplicationSchema],
    totalAdditions: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalDeductions: {
      type: Number,
      default: 0,
      min: 0,
    },
    recoveryAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    grossSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    netSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingDue: {
      type: Number,
      default: 0,
    },
    paymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque", ""],
      default: "",
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    paymentJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],
    paymentHistory: {
      type: [paymentHistorySchema],
      default: [],
    },
    reversalJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],
    supersededJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["draft", "posted", "finalized", "partially_paid", "paid", "void"],
      default: "posted",
      index: true,
    },
    statusBeforeVoid: {
      type: String,
      enum: ["", "draft", "posted", "finalized", "partially_paid", "paid"],
      default: "",
    },
    finalizedAt: {
      type: Date,
      default: null,
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    earlyClosed: {
      type: Boolean,
      default: false,
      index: true,
    },
    earlyCloseThroughDate: {
      type: String,
      trim: true,
      default: "",
    },
    earlyCloseReason: {
      type: String,
      trim: true,
      default: "",
    },
    earlyClosedAt: {
      type: Date,
      default: null,
    },
    earlyClosedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    voidedAt: {
      type: Date,
      default: null,
    },
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    voidReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

employeePayrollSchema.index(
  { userId: 1, moduleScope: 1, employeeId: 1, periodKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      isDeleted: false,
    },
  },
);
employeePayrollSchema.index(
  { userId: 1, moduleScope: 1, employeeId: 1, cycleKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      moduleScope: "weaving",
      isDeleted: false,
      cycleKey: { $type: "string" },
    },
  },
);
employeePayrollSchema.index({ userId: 1, moduleScope: 1, salaryDate: -1 });
employeePayrollSchema.index({
  userId: 1,
  moduleScope: 1,
  baseCycleKey: 1,
  segmentNo: 1,
});

module.exports = mongoose.model("EmployeePayroll", employeePayrollSchema);
