const mongoose = require("mongoose");

const Employee = require("../models/Employee");
const EmployeeAdvanceLoan = require("../models/EmployeeAdvanceLoan");
const EmployeeDesignation = require("../models/EmployeeDesignation");
const EmployeePayroll = require("../models/EmployeePayroll");
const JournalEntry = require("../models/JournalEntry");
const { logActivity } = require("../utils/activityLogger");
const { generatePdfFromHtml } = require("../services/pdfService");
const { clearTravelReportCache } = require("../services/travel/travelReportCacheService");
const {
  appendEmployeeBalances,
  calculatePayrollTotals,
  collectAccountIdsFromJournal,
  createAdvanceLoanJournal,
  createHttpError,
  createRecoveryJournal,
  createSalaryJournal,
  createSalaryPaymentJournal,
  ensureEmployeeAccount,
  applyPayrollRecoveries,
  getEmployeeFinancialSummary,
  getEmployeeLedger,
  getOriginValuesForScope,
  getModuleScopeFromRequest,
  getPaymentTypeFromAccount,
  getSessionQuery,
  parseEntryDateTime,
  recalculateTouchedAccounts,
  reverseJournals,
  reversePayrollRecoveries,
  roundMoney,
  syncEmployeeAccountName,
  validateEmployee,
  validatePaymentAccount,
} = require("../services/employee/employeeAccountingService");

const DEFAULT_DESIGNATIONS = [
  "Manager",
  "Accountant",
  "Sales Executive",
  "Travel Consultant",
  "Visa Officer",
  "Ticketing Officer",
  "Driver",
  "Office Assistant",
];

const getUserId = (req) => req.user?.id || req.userId;

const sendError = (res, error, fallback = "Request failed") => {
  console.error(fallback, error);
  return res.status(error.statusCode || 500).json({
    message: error.message || fallback,
  });
};

const parseArrayField = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
};

const normalizeText = (value = "") => String(value || "").trim();

const normalizeStatus = (value = "active") =>
  value === "inactive" ? "inactive" : "active";

const withTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }

  return result;
};

const clearModuleCaches = (userId, moduleScope) => {
  if (moduleScope === "travel") {
    clearTravelReportCache(userId);
  }
};

const buildDesignationPayload = (payload = {}) => {
  const name = normalizeText(payload.name);

  if (!name) {
    throw createHttpError("Designation name is required", 400);
  }

  return {
    name,
    normalizedName: name.toLowerCase(),
  };
};

const ensureDefaultDesignations = async ({ userId, moduleScope }) => {
  const existingCount = await EmployeeDesignation.countDocuments({
    userId,
    moduleScope,
    isDeleted: false,
  });

  if (existingCount > 0) return;

  await EmployeeDesignation.insertMany(
    DEFAULT_DESIGNATIONS.map((name) => ({
      userId,
      moduleScope,
      name,
      normalizedName: name.toLowerCase(),
    })),
    { ordered: false },
  ).catch((error) => {
    if (error?.code !== 11000) {
      throw error;
    }
  });
};

const getDesignation = async ({ userId, moduleScope, designationId, session }) => {
  if (!designationId) return null;

  const designation = await getSessionQuery(
    EmployeeDesignation.findOne({
      _id: designationId,
      userId,
      moduleScope,
      isDeleted: false,
    }),
    session,
  );

  if (!designation) {
    throw createHttpError("Designation not found", 404);
  }

  return designation;
};

const buildEmployeePayload = async ({
  userId,
  moduleScope,
  payload = {},
  session,
}) => {
  const name = normalizeText(payload.name);

  if (!name) {
    throw createHttpError("Employee name is required", 400);
  }

  const designation = await getDesignation({
    userId,
    moduleScope,
    designationId: payload.designationId,
    session,
  });

  return {
    name,
    phone: normalizeText(payload.phone),
    cnic: normalizeText(payload.cnic),
    address: normalizeText(payload.address),
    designationId: designation?._id || null,
    designationName:
      normalizeText(payload.designationName) || designation?.name || "",
    joiningDate: payload.joiningDate || null,
    salaryType: payload.salaryType === "daily" ? "daily" : "monthly",
    baseSalary: roundMoney(payload.baseSalary),
    notes: normalizeText(payload.notes),
    status: normalizeStatus(payload.status),
  };
};

const serializePayrollPayload = (payload = {}) => ({
  ...payload,
  additions: parseArrayField(payload.additions),
  deductions: parseArrayField(payload.deductions),
  recoveryApplications: parseArrayField(payload.recoveryApplications),
});

const resolvePayrollPeriod = (payload = {}) => {
  const periodKey = normalizeText(payload.periodKey);
  if (/^\d{4}-\d{2}$/.test(periodKey)) return periodKey;

  const { businessDate } = parseEntryDateTime({
    date: payload.salaryDate || new Date(),
    time: payload.salaryTime || payload.time,
    label: "payroll date",
  });

  return businessDate.slice(0, 7);
};

const buildDocumentHtml = ({ title, subtitle = "", rows = [], summary = [] }) => {
  const summaryHtml = summary
    .filter((item) => item && item.label)
    .map(
      (item) =>
        `<div><strong>${item.label}</strong><span>${item.value ?? ""}</span></div>`,
    )
    .join("");

  const rowsHtml = rows
    .map(
      (row) => `<tr>${row.map((cell) => `<td>${cell ?? ""}</td>`).join("")}</tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #111827; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .subtitle { color: #6b7280; margin-bottom: 18px; }
    .summary { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 18px; margin-bottom: 18px; }
    .summary div { border-bottom: 1px solid #e5e7eb; padding: 6px 0; display: flex; justify-content: space-between; gap: 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; text-align: left; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
  ${summaryHtml ? `<div class="summary">${summaryHtml}</div>` : ""}
  ${
    rows.length
      ? `<table><tbody>${rowsHtml}</tbody></table>`
      : "<p>No entries found.</p>"
  }
</body>
</html>`;
};

const sendPdf = async (res, html, filename) => {
  const pdfBuffer = await generatePdfFromHtml(html);

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=${filename}`,
    "Content-Length": pdfBuffer.length,
  });

  return res.send(pdfBuffer);
};

const getPaymentJournalIds = (payroll) => [
  payroll.journalEntryId,
  ...(payroll.paymentJournalEntryIds || []),
].filter(Boolean);

const applyPayrollAccounting = async ({
  userId,
  moduleScope,
  payroll,
  payload,
  session,
}) => {
  const employee = await validateEmployee({
    userId,
    employeeId: payroll.employeeId,
    moduleScope,
    session,
  });
  await ensureEmployeeAccount({ userId, moduleScope, employee, session });

  const totals = calculatePayrollTotals(payload);
  const { businessDate, businessTime } = parseEntryDateTime({
    date: payload.salaryDate || new Date(),
    time: payload.salaryTime || payload.time || "",
    label: "payroll date",
  });
  const salaryJournal = await createSalaryJournal({
    userId,
    moduleScope,
    employee,
    payroll,
    date: businessDate,
    time: businessTime,
    amount: totals.salaryExpenseAmount,
    session,
  });

  const paidAmount = roundMoney(payload.paidAmount || payload.payNowAmount || 0);
  if (paidAmount > totals.netSalary) {
    throw createHttpError("Paid amount cannot exceed net salary.", 400);
  }

  let paymentJournal = null;
  let paymentAccount = null;

  if (paidAmount > 0) {
    paymentAccount = await validatePaymentAccount({
      userId,
      moduleScope,
      paymentAccountId: payload.paymentAccountId,
      session,
    });
    paymentJournal = await createSalaryPaymentJournal({
      userId,
      moduleScope,
      employee,
      payroll,
      paymentAccount,
      date: payload.paymentDate || businessDate,
      time: payload.paymentTime || businessTime,
      amount: paidAmount,
      session,
    });
  }

  const appliedRecoveries = await applyPayrollRecoveries({
    userId,
    moduleScope,
    employee,
    payroll,
    recoveries: totals.recoveryApplications,
    journalEntryId: salaryJournal?._id || null,
    session,
  });

  payroll.salaryDate = businessDate;
  payroll.salaryTime = businessTime;
  payroll.baseSalary = totals.baseSalary;
  payroll.additions = totals.additions;
  payroll.deductions = totals.deductions;
  payroll.recoveryApplications = appliedRecoveries;
  payroll.totalAdditions = totals.totalAdditions;
  payroll.totalDeductions = totals.totalDeductions;
  payroll.recoveryAmount = totals.recoveryAmount;
  payroll.grossSalary = totals.grossSalary;
  payroll.netSalary = totals.netSalary;
  payroll.paidAmount = paidAmount;
  payroll.remainingDue = roundMoney(totals.netSalary - paidAmount);
  payroll.paymentAccountId = paymentAccount?._id || null;
  payroll.paymentType = paymentAccount ? getPaymentTypeFromAccount(paymentAccount) : "";
  payroll.journalEntryId = salaryJournal?._id || null;
  payroll.paymentJournalEntryIds = paymentJournal ? [paymentJournal._id] : [];
  payroll.status = payroll.remainingDue <= 0 ? "paid" : "posted";

  await payroll.save(session ? { session } : undefined);

  return [
    ...(salaryJournal ? collectAccountIdsFromJournal(salaryJournal) : []),
    ...(paymentJournal ? collectAccountIdsFromJournal(paymentJournal) : []),
  ];
};

exports.getDesignations = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    await ensureDefaultDesignations({ userId, moduleScope });

    const designations = await EmployeeDesignation.find({
      userId,
      moduleScope,
      isDeleted: false,
    }).sort({ name: 1 });

    return res.json({ data: designations });
  } catch (error) {
    return sendError(res, error, "Failed to load employee designations");
  }
};

exports.createDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = buildDesignationPayload(req.body);

    const designation = await EmployeeDesignation.create({
      ...payload,
      userId,
      moduleScope,
    });

    await logActivity({
      req,
      action: "create",
      module: "employees",
      moduleScope,
      entityType: "EmployeeDesignation",
      entityId: designation._id,
      title: designation.name,
    });

    return res.status(201).json({ data: designation });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Designation already exists" });
    }

    return sendError(res, error, "Failed to create employee designation");
  }
};

exports.updateDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = buildDesignationPayload(req.body);

    const designation = await EmployeeDesignation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          ...payload,
          isActive: req.body.isActive !== false,
        },
      },
      { new: true },
    );

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ data: designation });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Designation already exists" });
    }

    return sendError(res, error, "Failed to update employee designation");
  }
};

exports.deleteDesignation = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);

    const designation = await EmployeeDesignation.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          isActive: false,
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
        },
      },
      { new: true },
    );

    if (!designation) {
      return res.status(404).json({ message: "Designation not found" });
    }

    return res.json({ message: "Designation deleted", data: designation });
  } catch (error) {
    return sendError(res, error, "Failed to delete employee designation");
  }
};

exports.getEmployees = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const search = normalizeText(req.query.search);
    const status = normalizeText(req.query.status);
    const query = {
      userId,
      moduleScope,
      isDeleted: false,
    };

    if (status && ["active", "inactive"].includes(status)) {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { cnic: { $regex: search, $options: "i" } },
        { designationName: { $regex: search, $options: "i" } },
      ];
    }

    const employees = await Employee.find(query)
      .populate("designationId", "name")
      .populate("account", "name code balance moduleScope")
      .sort({ name: 1 });
    const employeesWithBalances = await appendEmployeeBalances({
      userId,
      moduleScope,
      employees,
    });

    return res.json({ data: employeesWithBalances });
  } catch (error) {
    return sendError(res, error, "Failed to load employees");
  }
};

exports.getEmployeeById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const employee = await Employee.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      isDeleted: false,
    })
      .populate("designationId", "name")
      .populate("account", "name code balance moduleScope");

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const [employeeWithBalance] = await appendEmployeeBalances({
      userId,
      moduleScope,
      employees: [employee],
    });

    return res.json({ data: employeeWithBalance });
  } catch (error) {
    return sendError(res, error, "Failed to load employee");
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let createdEmployee;

    await withTransaction(async (session) => {
      const payload = await buildEmployeePayload({
        userId,
        moduleScope,
        payload: req.body,
        session,
      });

      createdEmployee = new Employee({
        ...payload,
        userId,
        moduleScope,
        linkedUserId: req.body.linkedUserId || null,
      });

      await createdEmployee.save({ session });
      await ensureEmployeeAccount({
        userId,
        moduleScope,
        employee: createdEmployee,
        session,
      });
    });

    await logActivity({
      req,
      action: "create",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: createdEmployee._id,
      title: createdEmployee.name,
    });

    return res.status(201).json({ data: createdEmployee });
  } catch (error) {
    return sendError(res, error, "Failed to create employee");
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let updatedEmployee;

    await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: req.params.id,
        moduleScope,
        session,
      });
      const payload = await buildEmployeePayload({
        userId,
        moduleScope,
        payload: req.body,
        session,
      });

      Object.assign(employee, payload);
      updatedEmployee = await employee.save({ session });
      await syncEmployeeAccountName({ employee: updatedEmployee, session });
    });

    await logActivity({
      req,
      action: "update",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: updatedEmployee._id,
      title: updatedEmployee.name,
    });

    return res.json({ data: updatedEmployee });
  } catch (error) {
    return sendError(res, error, "Failed to update employee");
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const employee = await Employee.findOneAndUpdate(
      {
        _id: req.params.id,
        userId,
        moduleScope,
        isDeleted: false,
      },
      {
        $set: {
          isDeleted: true,
          status: "inactive",
          deletedAt: new Date(),
          deletedBy: req.actorId || userId,
          deleteReason: normalizeText(req.body.reason),
        },
      },
      { new: true },
    );

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await logActivity({
      req,
      action: "delete",
      module: "employees",
      moduleScope,
      entityType: "Employee",
      entityId: employee._id,
      title: employee.name,
    });

    return res.json({ message: "Employee archived", data: employee });
  } catch (error) {
    return sendError(res, error, "Failed to delete employee");
  }
};

exports.getEmployeeSummary = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const summary = await getEmployeeFinancialSummary({ userId, moduleScope });

    return res.json({ data: summary });
  } catch (error) {
    return sendError(res, error, "Failed to load employee summary");
  }
};

exports.getPayrolls = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const query = {
      userId,
      moduleScope,
      isDeleted: false,
    };

    if (req.query.periodKey) query.periodKey = req.query.periodKey;
    if (req.query.status) query.status = req.query.status;
    if (req.query.employeeId) query.employeeId = req.query.employeeId;

    const payrolls = await EmployeePayroll.find(query)
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category")
      .sort({ salaryDate: -1, createdAt: -1 });

    return res.json({ data: payrolls });
  } catch (error) {
    return sendError(res, error, "Failed to load payrolls");
  }
};

exports.createPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = serializePayrollPayload(req.body);
    const periodKey = resolvePayrollPeriod(payload);
    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: payload.employeeId,
        moduleScope,
        session,
      });
      const { businessDate, businessTime } = parseEntryDateTime({
        date: payload.salaryDate || new Date(),
        time: payload.salaryTime || payload.time || "",
        label: "payroll date",
      });

      payroll = new EmployeePayroll({
        userId,
        moduleScope,
        employeeId: employee._id,
        periodKey,
        salaryDate: businessDate,
        salaryTime: businessTime,
        notes: normalizeText(payload.notes),
      });
      await payroll.save({ session });

      touchedAccountIds = await applyPayrollAccounting({
        userId,
        moduleScope,
        payroll,
        payload,
        session,
      });

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "create",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${periodKey}`,
      metadata: { employeeId: result.employeeId },
    });

    return res.status(201).json({ data: result });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Payroll already exists for this employee and period.",
      });
    }

    return sendError(res, error, "Failed to create payroll");
  }
};

exports.updatePayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payload = serializePayrollPayload(req.body);
    const periodKey = resolvePayrollPeriod(payload);
    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $ne: "void" },
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      const reversalResult = await reverseJournals({
        journalIds: getPaymentJournalIds(payroll),
        userId,
        date: new Date(),
        time: "",
        session,
      });
      touchedAccountIds.push(...reversalResult.accountIds);
      payroll.reversalJournalEntryIds = [
        ...(payroll.reversalJournalEntryIds || []),
        ...reversalResult.reversalIds,
      ];

      await reversePayrollRecoveries({ payroll, session });

      payroll.employeeId = payload.employeeId || payroll.employeeId;
      payroll.periodKey = periodKey;
      payroll.notes = normalizeText(payload.notes);

      touchedAccountIds.push(
        ...(await applyPayrollAccounting({
          userId,
          moduleScope,
          payroll,
          payload: {
            ...payload,
            employeeId: payroll.employeeId,
            periodKey,
          },
          session,
        })),
      );

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);
    await logActivity({
      req,
      action: "update",
      module: "employees.payroll",
      moduleScope,
      entityType: "EmployeePayroll",
      entityId: result._id,
      title: `Payroll ${result.periodKey}`,
    });

    return res.json({ data: result });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "Payroll already exists for this employee and period.",
      });
    }

    return sendError(res, error, "Failed to update payroll");
  }
};

exports.payPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let payroll;
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $in: ["posted", "paid"] },
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      const amount = roundMoney(req.body.amount);
      if (amount <= 0 || amount > roundMoney(payroll.remainingDue)) {
        throw createHttpError("Invalid salary payment amount.", 400);
      }

      const employee = await validateEmployee({
        userId,
        employeeId: payroll.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const journal = await createSalaryPaymentJournal({
        userId,
        moduleScope,
        employee,
        payroll,
        paymentAccount,
        date: req.body.paymentDate || payroll.salaryDate,
        time: req.body.paymentTime || req.body.time || payroll.salaryTime,
        amount,
        session,
      });

      payroll.paymentJournalEntryIds = [
        ...(payroll.paymentJournalEntryIds || []),
        journal._id,
      ];
      payroll.paymentAccountId = paymentAccount._id;
      payroll.paymentType = getPaymentTypeFromAccount(paymentAccount);
      payroll.paidAmount = roundMoney(Number(payroll.paidAmount || 0) + amount);
      payroll.remainingDue = roundMoney(
        Number(payroll.netSalary || 0) - Number(payroll.paidAmount || 0),
      );
      payroll.status = payroll.remainingDue <= 0 ? "paid" : "posted";
      await payroll.save({ session });

      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to pay payroll");
  }
};

exports.voidPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];
    let payroll;

    const result = await withTransaction(async (session) => {
      payroll = await getSessionQuery(
        EmployeePayroll.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
        }),
        session,
      );

      if (!payroll) {
        throw createHttpError("Payroll not found", 404);
      }

      await reversePayrollRecoveries({ payroll, session });
      const reversalResult = await reverseJournals({
        journalIds: getPaymentJournalIds(payroll),
        userId,
        date: new Date(),
        time: "",
        session,
      });
      touchedAccountIds = reversalResult.accountIds;
      payroll.reversalJournalEntryIds = [
        ...(payroll.reversalJournalEntryIds || []),
        ...reversalResult.reversalIds,
      ];
      payroll.status = "void";
      payroll.isDeleted = true;
      payroll.voidedAt = new Date();
      payroll.voidedBy = req.actorId || userId;
      payroll.voidReason = normalizeText(req.body.reason);
      await payroll.save({ session });

      return payroll;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ message: "Payroll voided", data: result });
  } catch (error) {
    return sendError(res, error, "Failed to void payroll");
  }
};

exports.getPayrollById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payroll = await EmployeePayroll.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      isDeleted: false,
    })
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category");

    if (!payroll) {
      return res.status(404).json({ message: "Payroll not found" });
    }

    return res.json({ data: payroll });
  } catch (error) {
    return sendError(res, error, "Failed to load payroll");
  }
};

exports.getAdvanceLoans = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const query = {
      userId,
      moduleScope,
      isDeleted: false,
    };

    if (req.query.employeeId) query.employeeId = req.query.employeeId;
    if (req.query.kind) query.kind = req.query.kind === "loan" ? "loan" : "advance";
    if (req.query.status) query.status = req.query.status;

    const entries = await EmployeeAdvanceLoan.find(query)
      .populate("employeeId", "name phone designationName account")
      .populate("paymentAccountId", "name code category")
      .sort({ date: -1, createdAt: -1 });

    return res.json({ data: entries });
  } catch (error) {
    return sendError(res, error, "Failed to load employee advances/loans");
  }
};

exports.createAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const employee = await validateEmployee({
        userId,
        employeeId: req.body.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const amount = roundMoney(req.body.amount);

      if (amount <= 0) {
        throw createHttpError("Amount must be greater than zero.", 400);
      }

      const { businessDate, businessTime } = parseEntryDateTime({
        date: req.body.date || new Date(),
        time: req.body.time || "",
        label: "advance/loan date",
      });
      const advanceLoan = new EmployeeAdvanceLoan({
        userId,
        moduleScope,
        employeeId: employee._id,
        kind: req.body.kind === "loan" ? "loan" : "advance",
        amount,
        recoveredAmount: 0,
        outstandingAmount: amount,
        date: businessDate,
        time: businessTime,
        paymentAccountId: paymentAccount._id,
        paymentType: getPaymentTypeFromAccount(paymentAccount),
        description: normalizeText(req.body.description),
        status: "active",
      });

      await advanceLoan.save({ session });
      const journal = await createAdvanceLoanJournal({
        userId,
        moduleScope,
        employee,
        advanceLoan,
        paymentAccount,
        date: businessDate,
        time: businessTime,
        session,
      });

      advanceLoan.journalEntryId = journal._id;
      await advanceLoan.save({ session });
      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.status(201).json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to create employee advance/loan");
  }
};

exports.recoverAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const advanceLoan = await getSessionQuery(
        EmployeeAdvanceLoan.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
          status: { $in: ["active", "closed"] },
        }),
        session,
      );

      if (!advanceLoan) {
        throw createHttpError("Advance/loan not found", 404);
      }

      const amount = roundMoney(req.body.amount);
      if (amount <= 0 || amount > roundMoney(advanceLoan.outstandingAmount)) {
        throw createHttpError("Invalid recovery amount.", 400);
      }

      const employee = await validateEmployee({
        userId,
        employeeId: advanceLoan.employeeId,
        moduleScope,
        session,
      });
      const paymentAccount = await validatePaymentAccount({
        userId,
        moduleScope,
        paymentAccountId: req.body.paymentAccountId,
        session,
      });
      const { businessDate, businessTime } = parseEntryDateTime({
        date: req.body.date || new Date(),
        time: req.body.time || "",
        label: "recovery date",
      });
      const journal = await createRecoveryJournal({
        userId,
        moduleScope,
        employee,
        advanceLoan,
        paymentAccount,
        date: businessDate,
        time: businessTime,
        amount,
        session,
      });

      advanceLoan.recoveredAmount = roundMoney(
        Number(advanceLoan.recoveredAmount || 0) + amount,
      );
      advanceLoan.outstandingAmount = roundMoney(
        Number(advanceLoan.outstandingAmount || 0) - amount,
      );
      advanceLoan.status = advanceLoan.outstandingAmount <= 0 ? "closed" : "active";
      advanceLoan.recoveryHistory.push({
        amount,
        date: businessDate,
        time: businessTime,
        paymentAccountId: paymentAccount._id,
        journalEntryId: journal._id,
        description: normalizeText(req.body.description),
      });
      await advanceLoan.save({ session });
      touchedAccountIds = collectAccountIdsFromJournal(journal);

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ data: result });
  } catch (error) {
    return sendError(res, error, "Failed to recover employee advance/loan");
  }
};

exports.voidAdvanceLoan = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    let touchedAccountIds = [];

    const result = await withTransaction(async (session) => {
      const advanceLoan = await getSessionQuery(
        EmployeeAdvanceLoan.findOne({
          _id: req.params.id,
          userId,
          moduleScope,
          isDeleted: false,
        }),
        session,
      );

      if (!advanceLoan) {
        throw createHttpError("Advance/loan not found", 404);
      }

      const hasPayrollRecovery = (advanceLoan.recoveryHistory || []).some(
        (entry) => entry.payrollId,
      );

      if (hasPayrollRecovery) {
        throw createHttpError(
          "Void the payroll recovery before deleting this advance/loan.",
          400,
        );
      }

      const recoveryJournalIds = (advanceLoan.recoveryHistory || [])
        .map((entry) => entry.journalEntryId)
        .filter(Boolean);
      const reversalResult = await reverseJournals({
        journalIds: [advanceLoan.journalEntryId, ...recoveryJournalIds],
        userId,
        date: new Date(),
        time: "",
        session,
      });

      touchedAccountIds = reversalResult.accountIds;
      advanceLoan.reversalJournalEntryIds = [
        ...(advanceLoan.reversalJournalEntryIds || []),
        ...reversalResult.reversalIds,
      ];
      advanceLoan.status = "void";
      advanceLoan.isDeleted = true;
      advanceLoan.voidedAt = new Date();
      advanceLoan.voidedBy = req.actorId || userId;
      advanceLoan.voidReason = normalizeText(req.body.reason);
      await advanceLoan.save({ session });

      return advanceLoan;
    });

    await recalculateTouchedAccounts(touchedAccountIds);
    clearModuleCaches(userId, moduleScope);

    return res.json({ message: "Advance/loan voided", data: result });
  } catch (error) {
    return sendError(res, error, "Failed to void employee advance/loan");
  }
};

exports.getEmployeeLedger = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const ledger = await getEmployeeLedger({
      userId,
      moduleScope,
      employeeId: req.params.id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });

    return res.json({ data: ledger });
  } catch (error) {
    return sendError(res, error, "Failed to load employee ledger");
  }
};

exports.printEmployeeLedger = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const ledger = await getEmployeeLedger({
      userId,
      moduleScope,
      employeeId: req.params.id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    const html = buildDocumentHtml({
      title: "Employee Ledger",
      subtitle: ledger.employee.name,
      summary: [
        { label: "Debit", value: ledger.totals.debit },
        { label: "Credit", value: ledger.totals.credit },
        { label: "Closing", value: ledger.totals.closingBalance },
      ],
      rows: [
        ["Date", "Description", "Debit", "Credit", "Balance"],
        ...ledger.rows.map((row) => [
          row.formattedDate,
          row.description,
          row.debit,
          row.credit,
          row.balance,
        ]),
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, "Employee-Ledger.pdf");
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print employee ledger");
  }
};

exports.printPayroll = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const payroll = await EmployeePayroll.findOne({
      _id: req.params.id,
      userId,
      moduleScope,
      isDeleted: false,
    })
      .populate("employeeId", "name phone designationName")
      .populate("paymentAccountId", "name code category")
      .lean();

    if (!payroll) {
      return res.status(404).json({ message: "Payroll not found" });
    }

    const html = buildDocumentHtml({
      title: "Salary Slip",
      subtitle: `${payroll.employeeId?.name || "Employee"} - ${payroll.periodKey}`,
      summary: [
        { label: "Base Salary", value: payroll.baseSalary },
        { label: "Additions", value: payroll.totalAdditions },
        { label: "Deductions", value: payroll.totalDeductions },
        { label: "Recoveries", value: payroll.recoveryAmount },
        { label: "Net Salary", value: payroll.netSalary },
        { label: "Paid", value: payroll.paidAmount },
        { label: "Due", value: payroll.remainingDue },
      ],
      rows: [
        ["Type", "Description", "Amount"],
        ...(payroll.additions || []).map((entry) => [
          "Addition",
          entry.description || entry.type,
          entry.amount,
        ]),
        ...(payroll.deductions || []).map((entry) => [
          "Deduction",
          entry.description || "-",
          entry.amount,
        ]),
        ...(payroll.recoveryApplications || []).map((entry) => [
          `${entry.kind} recovery`,
          entry.description || "-",
          entry.amount,
        ]),
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, `Salary-Slip-${payroll.periodKey}.pdf`);
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print payroll");
  }
};

exports.printPayment = async (req, res) => {
  try {
    const userId = getUserId(req);
    const moduleScope = getModuleScopeFromRequest(req);
    const journal = await JournalEntry.findOne({
      _id: req.params.journalId,
      createdBy: userId,
      isDeleted: false,
      originModule: { $in: getOriginValuesForScope(moduleScope) },
    })
      .populate("employeeId", "name phone designationName")
      .lean();

    if (!journal) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const amount = (journal.lines || []).reduce(
      (max, line) => Math.max(max, Number(line.amount || 0)),
      0,
    );
    const html = buildDocumentHtml({
      title: "Employee Payment Voucher",
      subtitle: journal.employeeId?.name || "Employee",
      summary: [
        { label: "Date", value: formatDateSafe(journal.date) },
        { label: "Amount", value: amount },
        { label: "Description", value: journal.description },
      ],
    });

    if (req.path.endsWith("/pdf")) {
      return sendPdf(res, html, "Employee-Payment-Voucher.pdf");
    }

    return res.send(html);
  } catch (error) {
    return sendError(res, error, "Failed to print employee payment");
  }
};

const formatDateSafe = (value) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(value));
  } catch (error) {
    return "";
  }
};
