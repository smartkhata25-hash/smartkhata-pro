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

const employeeSchema = new mongoose.Schema(
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
    linkedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    employeeNo: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    listOrder: {
      type: Number,
      default: 0,
      min: 0,
      index: true,
    },
    fatherName: {
      type: String,
      trim: true,
      default: "",
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", ""],
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    cnic: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: "",
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingUnit",
      default: null,
      index: true,
    },
    unitNo: {
      type: Number,
      default: 0,
      index: true,
    },
    unitName: {
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
    shiftId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WeavingShift",
      default: null,
      index: true,
    },
    shiftName: {
      type: String,
      trim: true,
      default: "",
    },
    joiningDate: {
      type: Date,
      default: null,
    },
    salaryType: {
      type: String,
      enum: ["monthly", "daily", "hourly", "commission", "custom"],
      default: "monthly",
    },
    baseSalary: {
      type: Number,
      default: 0,
      min: 0,
    },
    knottingPaymentMethod: {
      type: String,
      enum: ["monthly", "per_beam", "per_set", "monthly_per_beam", "monthly_per_set"],
      default: "monthly",
    },
    dutyHours: {
      type: Number,
      default: 0,
      min: 0,
      max: 24,
    },
    weeklyOffDays: {
      type: [
        {
          type: String,
          enum: WEEKDAY_KEYS,
        },
      ],
      default: [],
    },
    paidLeaveAllowance: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Paid Leave Allowance must be an integer",
      },
    },
    otAllowed: {
      type: Boolean,
      default: true,
    },
    openingBalance: {
      amount: {
        type: Number,
        default: 0,
        min: 0,
      },
      type: {
        type: String,
        enum: ["payable", "receivable", ""],
        default: "",
      },
      deductionIntent: {
        type: String,
        enum: ["future_salary", "manual_review", ""],
        default: "",
      },
      recordedAt: {
        type: Date,
        default: null,
      },
      targetCycleKey: {
        type: String,
        trim: true,
        default: "",
      },
      targetPayDate: {
        type: Date,
        default: null,
      },
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    deleteReason: {
      type: String,
      trim: true,
      default: "",
    },
  },
  { timestamps: true },
);

employeeSchema.index({ userId: 1, moduleScope: 1, status: 1, isDeleted: 1 });
employeeSchema.index({ userId: 1, moduleScope: 1, name: 1 });
employeeSchema.index({ userId: 1, moduleScope: 1, unitNo: 1, listOrder: 1, name: 1 });
employeeSchema.index({ userId: 1, moduleScope: 1, employeeNo: 1 });
employeeSchema.index({ userId: 1, moduleScope: 1, cnic: 1 });
employeeSchema.index(
  { userId: 1, account: 1 },
  {
    unique: true,
    partialFilterExpression: {
      account: { $type: "objectId" },
    },
  },
);

employeeSchema.pre("save", function (next) {
  [
    "name",
    "employeeNo",
    "fatherName",
    "phone",
    "cnic",
    "address",
    "emergencyContact",
    "unitName",
    "departmentName",
    "designationName",
    "shiftName",
    "notes",
  ].forEach((field) => {
    if (this[field]) this[field] = String(this[field]).trim();
  });

  next();
});

module.exports = mongoose.model("Employee", employeeSchema);
