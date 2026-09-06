const express = require("express");

const ctrl = require("../controllers/employeeController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");
const { PERMISSIONS } = require("../utils/permissionList");

const router = express.Router();

router.use(protect);
router.use((req, res, next) => {
  if (String(req.originalUrl || "").startsWith("/api/travel/")) {
    return requireModule(MODULE_KEYS.TRAVEL)(req, res, next);
  }

  return next();
});

router.get(
  "/summary",
  requirePermission(PERMISSIONS.EMPLOYEES.VIEW, PERMISSIONS.PAYROLL.VIEW),
  ctrl.getEmployeeSummary,
);

router.get(
  "/designations",
  requirePermission(PERMISSIONS.EMPLOYEES.VIEW),
  ctrl.getDesignations,
);
router.post(
  "/designations",
  requirePermission(PERMISSIONS.EMPLOYEES.CREATE, PERMISSIONS.EMPLOYEES.EDIT),
  ctrl.createDesignation,
);
router.put(
  "/designations/:id",
  requirePermission(PERMISSIONS.EMPLOYEES.EDIT),
  ctrl.updateDesignation,
);
router.delete(
  "/designations/:id",
  requirePermission(PERMISSIONS.EMPLOYEES.DELETE),
  ctrl.deleteDesignation,
);

router.get(
  "/payroll",
  requirePermission(PERMISSIONS.PAYROLL.VIEW),
  ctrl.getPayrolls,
);
router.post(
  "/payroll",
  requirePermission(PERMISSIONS.PAYROLL.CREATE),
  ctrl.createPayroll,
);
router.get(
  "/payroll/:id",
  requirePermission(PERMISSIONS.PAYROLL.VIEW),
  ctrl.getPayrollById,
);
router.put(
  "/payroll/:id",
  requirePermission(PERMISSIONS.PAYROLL.EDIT),
  ctrl.updatePayroll,
);
router.post(
  "/payroll/:id/pay",
  requirePermission(PERMISSIONS.PAYROLL.PAY),
  ctrl.payPayroll,
);
router.post(
  "/payroll/:id/void",
  requirePermission(PERMISSIONS.PAYROLL.DELETE),
  ctrl.voidPayroll,
);
router.get(
  "/payroll/:id/print",
  requirePermission(PERMISSIONS.PAYROLL.PRINT, PERMISSIONS.PAYROLL.VIEW),
  ctrl.printPayroll,
);
router.get(
  "/payroll/:id/pdf",
  requirePermission(PERMISSIONS.PAYROLL.PRINT, PERMISSIONS.PAYROLL.VIEW),
  ctrl.printPayroll,
);

router.get(
  "/advance-loans",
  requirePermission(PERMISSIONS.PAYROLL.VIEW),
  ctrl.getAdvanceLoans,
);
router.post(
  "/advance-loans",
  requirePermission(PERMISSIONS.PAYROLL.CREATE),
  ctrl.createAdvanceLoan,
);
router.post(
  "/advance-loans/:id/recover",
  requirePermission(PERMISSIONS.PAYROLL.PAY),
  ctrl.recoverAdvanceLoan,
);
router.post(
  "/advance-loans/:id/void",
  requirePermission(PERMISSIONS.PAYROLL.DELETE),
  ctrl.voidAdvanceLoan,
);

router.get(
  "/payments/:journalId/print",
  requirePermission(PERMISSIONS.PAYROLL.PRINT, PERMISSIONS.PAYROLL.VIEW),
  ctrl.printPayment,
);
router.get(
  "/payments/:journalId/pdf",
  requirePermission(PERMISSIONS.PAYROLL.PRINT, PERMISSIONS.PAYROLL.VIEW),
  ctrl.printPayment,
);

router.get(
  "/:id/ledger",
  requirePermission(PERMISSIONS.EMPLOYEES.VIEW_LEDGER),
  ctrl.getEmployeeLedger,
);
router.get(
  "/:id/ledger/print",
  requirePermission(PERMISSIONS.EMPLOYEES.VIEW_LEDGER),
  ctrl.printEmployeeLedger,
);
router.get(
  "/:id/ledger/pdf",
  requirePermission(PERMISSIONS.EMPLOYEES.VIEW_LEDGER),
  ctrl.printEmployeeLedger,
);

router
  .route("/")
  .get(requirePermission(PERMISSIONS.EMPLOYEES.VIEW), ctrl.getEmployees)
  .post(requirePermission(PERMISSIONS.EMPLOYEES.CREATE), ctrl.createEmployee);

router
  .route("/:id")
  .get(requirePermission(PERMISSIONS.EMPLOYEES.VIEW), ctrl.getEmployeeById)
  .put(requirePermission(PERMISSIONS.EMPLOYEES.EDIT), ctrl.updateEmployee)
  .delete(requirePermission(PERMISSIONS.EMPLOYEES.DELETE), ctrl.deleteEmployee);

module.exports = router;
