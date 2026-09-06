const mongoose = require("mongoose");

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
      enum: ["trading", "travel"],
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
      match: /^\d{4}-\d{2}$/,
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
    reversalJournalEntryIds: [
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
      enum: ["draft", "posted", "paid", "void"],
      default: "posted",
      index: true,
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
employeePayrollSchema.index({ userId: 1, moduleScope: 1, salaryDate: -1 });

module.exports = mongoose.model("EmployeePayroll", employeePayrollSchema);
