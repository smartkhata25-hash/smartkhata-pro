const express = require("express");

const ctrl = require("../controllers/weaving/weavingReportController");
const protect = require("../middleware/authMiddleware");
const { requireModule } = require("../middleware/moduleMiddleware");
const { requirePermission } = require("../middleware/permissionMiddleware");
const { MODULE_KEYS } = require("../utils/moduleConfig");
const { PERMISSIONS, hasPermission } = require("../utils/permissionList");

const router = express.Router();
const operationalPermissions = ["weaving.reports.view", "weaving.reports.production", "weaving.reports.stock", "weaving.reports.sales", "weaving.reports.profit", "weaving.looms.view_performance"];
const outputAuth = (req, res, next) => { if (req.query.token && !req.headers.authorization) req.headers.authorization = `Bearer ${req.query.token}`; next(); };
const reportKindPermissions = {
  production: ["weaving.reports.view", "weaving.reports.production"],
  looms: ["weaving.reports.view", "weaving.looms.view_performance"],
  quality: ["weaving.reports.view", "weaving.reports.production"],
  stock: ["weaving.reports.view", "weaving.reports.stock"],
  sales: ["weaving.reports.view", "weaving.reports.sales"],
  rejection: ["weaving.reports.view", "weaving.reports.sales"],
  profit: ["weaving.reports.profit"],
};
const requireReportKindPermission = (req, res, next) => {
  const requiredPermissions = reportKindPermissions[req.params.kind];
  if (!requiredPermissions) return res.status(404).json({ message: "Unknown Weaving report" });
  if (req.user?.accountRole === "owner"
    || requiredPermissions.some((permission) => hasPermission(req.user?.permissions || [], permission))) {
    return next();
  }
  return res.status(403).json({
    message: "You do not have permission to perform this action",
    requiredPermissions,
  });
};

router.get("/operational/profit/print", outputAuth, protect, requireModule(MODULE_KEYS.WEAVING), requirePermission("weaving.reports.profit"), (req, res) => { req.params.kind = "profit"; req.params.format = "print"; return ctrl.outputOperationalReport(req, res); });
router.get("/operational/profit/pdf", outputAuth, protect, requireModule(MODULE_KEYS.WEAVING), requirePermission("weaving.reports.profit"), (req, res) => { req.params.kind = "profit"; req.params.format = "pdf"; return ctrl.outputOperationalReport(req, res); });
router.get("/operational/:kind/print", outputAuth, protect, requireModule(MODULE_KEYS.WEAVING), requireReportKindPermission, (req, res) => { req.params.format = "print"; return ctrl.outputOperationalReport(req, res); });
router.get("/operational/:kind/pdf", outputAuth, protect, requireModule(MODULE_KEYS.WEAVING), requireReportKindPermission, (req, res) => { req.params.format = "pdf"; return ctrl.outputOperationalReport(req, res); });

router.use(protect, requireModule(MODULE_KEYS.WEAVING));
router.get("/meta", requirePermission(...operationalPermissions), ctrl.getOperationalMeta);
router.get("/production", requirePermission("weaving.reports.view", "weaving.reports.production"), ctrl.getProductionReport);
router.get("/looms", requirePermission("weaving.reports.view", "weaving.looms.view_performance"), ctrl.getLoomPerformance);
router.get("/looms/:id", requirePermission("weaving.reports.view", "weaving.looms.view_performance"), ctrl.getLoomLedger);
router.get("/quality-production", requirePermission("weaving.reports.view", "weaving.reports.production"), ctrl.getQualityProduction);
router.get("/fabric-stock", requirePermission("weaving.reports.view", "weaving.reports.stock"), ctrl.getFabricStockReport);
router.get("/sales", requirePermission("weaving.reports.view", "weaving.reports.sales"), ctrl.getSalesReport);
router.get("/pending-rejection", requirePermission("weaving.reports.view", "weaving.reports.sales"), ctrl.getPendingRejectionReport);
router.get("/profit", requirePermission("weaving.reports.profit"), ctrl.getProfitReport);
router.get("/profit/details", requirePermission("weaving.reports.profit"), ctrl.getProfitDetails);
router.get("/costing/valuation", requirePermission("weaving.reports.view", "weaving.reports.stock", "weaving.reports.profit"), ctrl.getInventoryValuation);
router.post("/costing/rebuild", requirePermission("weaving.reports.profit"), ctrl.rebuildCosting);
router.get(
  "/dashboard",
  requirePermission(...operationalPermissions, "weaving.sales.view", "weaving.purchases.view"),
  ctrl.getDashboardSummary,
);

router.get(
  "/salary-closing",
  requirePermission(PERMISSIONS.PAYROLL.VIEW),
  ctrl.getSalaryClosingReport,
);

router.get(
  "/salary-closing/print",
  requirePermission(PERMISSIONS.PAYROLL.PRINT),
  ctrl.printSalaryClosingReport,
);

router.get(
  "/salary-closing/pdf",
  requirePermission(PERMISSIONS.PAYROLL.PRINT),
  ctrl.downloadSalaryClosingPdf,
);

module.exports = router;
