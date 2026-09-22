const { generatePdfFromHtml } = require("../../services/pdfService");
const {
  assertOfficialPrintable,
  getSalaryClosingReport,
} = require("../../services/weaving/weavingSalaryClosingReportService");
const {
  buildSalaryClosingReportHtml,
} = require("../../templates/weavingSalaryClosingReportTemplate");
const operational = require("../../services/weaving/weavingOperationalReportService");
const costing = require("../../services/weaving/weavingCostingService");
const { logActivity } = require("../../utils/activityLogger");
const { hasPermission } = require("../../utils/permissionList");

const getUserId = (req) => req.user?.id || req.userId;

const sendError = (res, error, fallback = "Request failed") => {
  console.error(fallback, error);

  return res.status(error.statusCode || 500).json({
    message: error.message || fallback,
  });
};

const getReportParams = (req) => ({
  userId: getUserId(req),
  cycleKey: req.query.cycleKey,
  segmentNo: req.query.segmentNo,
  unitId: req.query.unitId,
});

const sanitizeFilenamePart = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "All-Units";

const buildPdfFilename = (report) => {
  const unitPart = report.selection?.unitId
    ? sanitizeFilenamePart(report.selection.unitName)
    : "All-Units";

  const segmentPart = report.cycle?.segmentNo
    ? `-C${report.cycle.segmentNo}`
    : "";

  return `Salary-Closing-${sanitizeFilenamePart(report.cycle?.key)}${segmentPart}-${unitPart}.pdf`;
};

exports.getSalaryClosingReport = async (req, res) => {
  try {
    const report = await getSalaryClosingReport(getReportParams(req));

    return res.json({ data: report });
  } catch (error) {
    return sendError(res, error, "Failed to load salary closing report");
  }
};

exports.printSalaryClosingReport = async (req, res) => {
  try {
    const report = await getSalaryClosingReport(getReportParams(req));
    assertOfficialPrintable(report);

    return res.type("html").send(buildSalaryClosingReportHtml(report));
  } catch (error) {
    return sendError(res, error, "Failed to print salary closing report");
  }
};

exports.downloadSalaryClosingPdf = async (req, res) => {
  try {
    const report = await getSalaryClosingReport(getReportParams(req));
    assertOfficialPrintable(report);

    const html = buildSalaryClosingReportHtml(report);
    const pdfBuffer = await generatePdfFromHtml(html);
    const filename = buildPdfFilename(report);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=${filename}`,
      "Content-Length": pdfBuffer.length,
    });

    return res.send(pdfBuffer);
  } catch (error) {
    return sendError(res, error, "Failed to download salary closing report");
  }
};

const operationalHandler = (loader, fallback) => async (req, res) => {
  try { return res.json({ data: await loader(getUserId(req), req.query, req.params) }); }
  catch (error) { return sendError(res, error, fallback); }
};

exports.getOperationalMeta = operationalHandler((userId) => operational.getMeta(userId), "Failed to load report filters");
exports.getProductionReport = operationalHandler((userId, query) => operational.getProduction(userId, query), "Failed to load Production report");
exports.getLoomPerformance = operationalHandler((userId, query) => operational.getLoomPerformance(userId, query), "Failed to load Loom performance");
exports.getLoomLedger = operationalHandler((userId, query, params) => operational.getLoomLedger(userId, params.id, query), "Failed to load Loom ledger");
exports.getQualityProduction = operationalHandler((userId, query) => operational.getQualityProduction(userId, query), "Failed to load Quality Production report");
exports.getFabricStockReport = operationalHandler((userId, query) => operational.getFabricStock(userId, query), "Failed to load Fabric Stock report");
exports.getSalesReport = operationalHandler((userId, query) => operational.getSales(userId, query), "Failed to load Sales report");
exports.getPendingRejectionReport = operationalHandler((userId, query) => operational.getPendingRejection(userId, query), "Failed to load Pending Rejection report");
exports.getProfitReport = operationalHandler((userId, query) => operational.getProfit(userId, query), "Failed to load Profit report");
exports.getProfitDetails = operationalHandler((userId, query) => operational.getProfitDetails(userId, query), "Failed to load Profit details");
exports.getDashboardSummary = async (req, res) => {
  try {
    const isOwner = req.user?.accountRole === "owner";
    const canViewProfit = isOwner
      || hasPermission(req.user?.permissions || [], "weaving.reports.profit");
    const can = (...permissions) => isOwner
      || permissions.some((permission) => hasPermission(req.user?.permissions || [], permission));
    return res.json({
      data: await operational.getDashboard(getUserId(req), {
        canViewProduction: can("weaving.reports.view", "weaving.reports.production"),
        canViewProfit,
        canViewSales: can("weaving.reports.view", "weaving.reports.sales"),
        canViewReady: can("weaving.sales.view"),
        canViewRejection: can("weaving.reports.view", "weaving.reports.sales"),
        canViewPurchases: can("weaving.purchases.view"),
      }),
    });
  } catch (error) {
    return sendError(res, error, "Failed to load Weaving dashboard summary");
  }
};
exports.getInventoryValuation = operationalHandler((userId) => costing.getInventoryValuation(userId), "Failed to load Weaving inventory valuation");
exports.rebuildCosting = async (req, res) => {
  try {
    const result = await costing.rebuildCosting(getUserId(req));
    await logActivity({ req, action: "recalculate", module: "weaving.costing", moduleScope: "weaving", entityType: "WeavingCostSnapshot", title: `Weaving Costing v${result.costingVersion}` });
    return res.json({ data: result });
  } catch (error) { return sendError(res, error, "Failed to recalculate Weaving costing"); }
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const labels = {
  production: ["Production Report", ["date", "loomNo", "thanNo", "quality", "meter", "kg", "goodMeter", "bGradeMeter", "rejectedMeter"]],
  looms: ["Loom Performance", ["rank", "loomNo", "loomName", "than", "meter", "kg", "goodMeter", "bGradeMeter", "rejectedMeter", "activeDays"]],
  quality: ["Quality Production", ["quality", "warpCount", "weftCount", "width", "than", "meter", "kg", "goodMeter", "bGradeMeter", "rejectedMeter"]],
  stock: ["Fabric Stock Report", ["quality", "grade", "ownershipType", "ownerName", "godownName", "than", "pieceCount", "meter", "kg", "lbs"]],
  sales: ["Sales & Conversion Report", ["invoiceNo", "date", "party", "saleType", "source", "item", "quantity", "rate", "amount", "received", "balance", "paymentStatus"]],
  rejection: ["Pending Rejection Report", ["party", "pakkiDate", "quality", "original", "received", "pending", "age", "status"]],
};
const printableRows = (kind, report) => kind === "stock" ? report.rows.map((row) => ({ ...row, quality: row.quality?.name || "" })) : report.rows || [];
const reportHtml = (kind, report) => {
  const [title, columns] = labels[kind] || ["Weaving Profit Report", []];
  if (kind === "profit") { const scoped = report.periodCostsUnallocated; const rows = [["Fabric Sales",report.revenue.fabricSales],["Yarn Sales",report.revenue.yarnSales],["Conversion Income",report.revenue.conversionIncome],["Other Sales",report.revenue.otherSales],["Less Sales Deductions",-report.revenue.salesDeductions],["Net Revenue",report.revenue.netRevenue],["Direct COGS",report.costs.directStockCost ?? report.costs.knownDirectStockCost],[scoped ? "Contribution Profit" : "Gross Profit",scoped ? report.contributionProfit ?? report.provisionalGrossProfit : report.grossProfit ?? report.provisionalGrossProfit],["Gross / Contribution Margin %",scoped ? report.contributionMargin : report.grossMargin],["Period Payroll / Labour",scoped ? "Not allocated" : report.costs.payrollCost],["Operating Expenses",scoped ? "Not allocated" : report.costs.operatingExpenses],...(scoped ? [] : [[report.isExact ? "Net Profit" : "Provisional Net Profit",report.isExact ? report.netProfit : report.provisionalNetProfit],["Net Margin %",report.netMargin]])]; return `<!doctype html><html><head><meta charset="utf-8"><style>${printCss}</style></head><body><h1>${title}</h1><p>Scope: ${escapeHtml(report.scope)} | ${escapeHtml(report.range?.from)} - ${escapeHtml(report.range?.to)}</p><div class="notice">Cost Coverage: ${escapeHtml(report.costCoverage)}${scoped ? " - Shared period costs not allocated to this view" : ""}${report.missingCostReason ? ` - ${escapeHtml(report.missingCostReason)}` : ""}</div><table><tbody>${rows.map(([label,value])=>`<tr><th>${label}</th><td>${escapeHtml(value ?? "-")}</td></tr>`).join("")}</tbody></table></body></html>`; }
  const rows = printableRows(kind, report);
  return `<!doctype html><html><head><meta charset="utf-8"><style>${printCss}</style></head><body><h1>${title}</h1><p>${escapeHtml(report.range?.from || "Current")} ${report.range?.to ? `- ${escapeHtml(report.range.to)}` : ""}</p><table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.replace(/([A-Z])/g, " $1"))}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
};
const printCss = "body{font-family:Arial,sans-serif;color:#0f172a;margin:24px}h1{margin:0 0 6px}p{color:#64748b}.notice{border:1px solid #f59e0b;background:#fffbeb;padding:10px;margin:14px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:7px;font-size:10px;text-align:left}th{background:#e2e8f0;text-transform:capitalize}@page{size:landscape;margin:12mm}";

exports.outputOperationalReport = async (req, res) => {
  try {
    const report = await operational.getReport(req.params.kind, getUserId(req), req.query);
    const html = reportHtml(req.params.kind, report);
    if (req.params.format === "pdf") {
      const pdf = await generatePdfFromHtml(html); const filename = `Weaving-${req.params.kind}-Report.pdf`;
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename=${filename}`, "Content-Length": pdf.length }); return res.send(pdf);
    }
    return res.type("html").send(html);
  } catch (error) { return sendError(res, error, "Failed to generate Weaving report"); }
};
