const mongoose = require("mongoose");

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
      enum: ["trading", "travel"],
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
  ["name", "phone", "cnic", "address", "designationName", "notes"].forEach(
    (field) => {
      if (this[field]) this[field] = String(this[field]).trim();
    },
  );

  next();
});

module.exports = mongoose.model("Employee", employeeSchema);
