const mongoose = require("mongoose");

const recoveryHistorySchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      default: "",
    },
    paymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    payrollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployeePayroll",
      default: null,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { _id: false, timestamps: true },
);

const employeeAdvanceLoanSchema = new mongoose.Schema(
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
    kind: {
      type: String,
      enum: ["advance", "loan"],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    recoveredAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    outstandingAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      default: "",
    },
    paymentAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    paymentType: {
      type: String,
      enum: ["cash", "online", "cheque"],
      default: "cash",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JournalEntry",
      default: null,
    },
    recoveryHistory: [recoveryHistorySchema],
    reversalJournalEntryIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "JournalEntry",
      },
    ],
    status: {
      type: String,
      enum: ["active", "closed", "void"],
      default: "active",
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

employeeAdvanceLoanSchema.index({
  userId: 1,
  moduleScope: 1,
  employeeId: 1,
  status: 1,
});
employeeAdvanceLoanSchema.index({ userId: 1, moduleScope: 1, date: -1 });

module.exports = mongoose.model(
  "EmployeeAdvanceLoan",
  employeeAdvanceLoanSchema,
);
