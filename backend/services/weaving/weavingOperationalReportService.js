const JournalEntry = require("../../models/JournalEntry");
const Expense = require("../../models/Expense");
const WeavingContract = require("../../models/WeavingContract");
const WeavingFabricQuality = require("../../models/WeavingFabricQuality");
const WeavingFoldingEntry = require("../../models/WeavingFoldingEntry");
const WeavingGodown = require("../../models/WeavingGodown");
const WeavingLoom = require("../../models/WeavingLoom");
const WeavingParty = require("../../models/WeavingParty");
const WeavingPurchaseInvoice = require("../../models/WeavingPurchaseInvoice");
const WeavingRejectionDue = require("../../models/WeavingRejectionDue");
const WeavingSalesInvoice = require("../../models/WeavingSalesInvoice");
const foldingService = require("./weavingFoldingService");
const costingService = require("./weavingCostingService");
const salesService = require("./weavingSalesService");

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;
const id = (value) => String(value?._id || value || "");
const clean = (value = "") => String(value || "").trim();
const dateKey = (value = new Date()) => new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit",
}).format(value);

const resolveRange = (query = {}) => {
  if (query.from || query.to) return { from: clean(query.from), to: clean(query.to) };
  const today = dateKey();
  const date = new Date(`${today}T00:00:00.000Z`);
  const preset = clean(query.preset || "this_month");
  if (preset === "all") return { from: "", to: "" };
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") { date.setUTCDate(date.getUTCDate() - 1); const day = date.toISOString().slice(0, 10); return { from: day, to: day }; }
  if (preset === "this_week") { const day = date.getUTCDay() || 7; date.setUTCDate(date.getUTCDate() - day + 1); return { from: date.toISOString().slice(0, 10), to: today }; }
  if (preset === "this_year") return { from: `${today.slice(0, 4)}-01-01`, to: today };
  return { from: `${today.slice(0, 7)}-01`, to: today };
};

const rangeMatch = (field, range) => range.from || range.to ? {
  [field]: { ...(range.from ? { $gte: range.from } : {}), ...(range.to ? { $lte: range.to } : {}) },
} : {};

const dateRangeMatch = (field, range) => range.from || range.to ? {
  [field]: {
    ...(range.from ? { $gte: new Date(`${range.from}T00:00:00.000Z`) } : {}),
    ...(range.to ? { $lte: new Date(`${range.to}T23:59:59.999Z`) } : {}),
  },
} : {};

const entryTotals = (rows = []) => rows.reduce((sum, row) => ({
  than: sum.than + 1,
  meter: round(sum.meter + row.meter),
  kg: round(sum.kg + row.weightKg),
  goodMeter: round(sum.goodMeter + row.goodMeter),
  bGradeMeter: round(sum.bGradeMeter + row.bGradeMeter),
  rejectedMeter: round(sum.rejectedMeter + row.rejectedMeter),
}), { than: 0, meter: 0, kg: 0, goodMeter: 0, bGradeMeter: 0, rejectedMeter: 0 });

const gradeMeter = (row, grade) => grade === "a" ? row.goodMeter : grade === "b" ? row.bGradeMeter : grade === "rejected" ? row.rejectedMeter : row.meter;

const loadProductionRows = async (userId, query = {}) => {
  const range = resolveRange(query);
  const match = { userId, status: "posted", ...rangeMatch("date", range) };
  [["loomId", query.loomId], ["fabricQualityId", query.fabricQualityId], ["contractId", query.contractId]].forEach(([field, value]) => { if (value) match[field] = value; });
  let rows = await WeavingFoldingEntry.find(match)
    .populate("loomId", "loomNumber name brand model loomType")
    .populate("fabricQualityId", "name code warpCount weftCount width")
    .populate("contractId", "contractNo")
    .sort({ date: 1, createdAt: 1 }).lean();
  if (query.grade) rows = rows.filter((row) => Number(gradeMeter(row, query.grade) || 0) > 0).map((row) => {
    const selectedMeter = Number(gradeMeter(row, query.grade) || 0);
    const ratio = Number(row.meter || 0) > 0 ? selectedMeter / Number(row.meter) : 0;
    return { ...row, meter: selectedMeter, weightKg: round(Number(row.weightKg || 0) * ratio), goodMeter: query.grade === "a" ? selectedMeter : 0, bGradeMeter: query.grade === "b" ? selectedMeter : 0, rejectedMeter: query.grade === "rejected" ? selectedMeter : 0 };
  });
  return { rows, range };
};

const productionRow = (row) => ({
  _id: row._id, date: row.date, thanNo: row.thanNo,
  loomId: id(row.loomId), loomNo: row.loomId?.loomNumber || row.loomNumberSnapshot || "-", loomName: row.loomId?.name || "",
  qualityId: id(row.fabricQualityId), quality: row.fabricQualityId?.name || row.qualitySnapshot?.name || "-",
  count: [row.fabricQualityId?.warpCount || row.qualitySnapshot?.warpCount, row.fabricQualityId?.weftCount || row.qualitySnapshot?.weftCount].filter(Boolean).join(" / "),
  width: row.fabricQualityId?.width || row.qualitySnapshot?.width || "", contract: row.contractId?.contractNo || row.contractNoSnapshot || "",
  beam: row.beamNoSnapshot || "", set: row.setNoSnapshot || "", meter: round(row.meter), kg: round(row.weightKg),
  goodMeter: round(row.goodMeter), bGradeMeter: round(row.bGradeMeter), rejectedMeter: round(row.rejectedMeter), grade: row.grade,
});

const getProduction = async (userId, query = {}) => {
  const { rows, range } = await loadProductionRows(userId, query);
  const mapped = rows.map(productionRow);
  const groupBy = ["date", "loom", "quality", "contract"].includes(query.groupBy) ? query.groupBy : "date";
  const groups = new Map();
  mapped.forEach((row) => {
    const group = groupBy === "loom" ? { key: row.loomId, label: `${row.loomNo}${row.loomName ? ` - ${row.loomName}` : ""}` } : groupBy === "quality" ? { key: row.qualityId, label: row.quality } : groupBy === "contract" ? { key: row.contract || "unassigned", label: row.contract || "Unassigned" } : { key: row.date, label: row.date };
    const current = groups.get(group.key) || { ...group, rows: [] }; current.rows.push(row); groups.set(group.key, current);
  });
  const grouped = [...groups.values()].map((group) => ({ ...group, totals: entryTotals(group.rows.map((row) => ({ meter: row.meter, weightKg: row.kg, goodMeter: row.goodMeter, bGradeMeter: row.bGradeMeter, rejectedMeter: row.rejectedMeter }))) }));
  return { range, groupBy, summary: entryTotals(rows), groups: grouped, rows: mapped };
};

const getLoomPerformance = async (userId, query = {}) => {
  const [{ rows, range }, looms] = await Promise.all([
    loadProductionRows(userId, query),
    WeavingLoom.find({ userId, isActive: true }).sort({ loomNumber: 1 }).lean(),
  ]);
  const groups = new Map(looms.map((loom) => [id(loom), { loom, rows: [] }]));
  rows.forEach((row) => { const group = groups.get(id(row.loomId)); if (group) group.rows.push(row); });
  const search = clean(query.search).toLowerCase();
  const performance = [...groups.values()].map(({ loom, rows: loomRows }) => ({
    loomId: loom._id, loomNo: loom.loomNumber, loomName: loom.name, brand: loom.brand, model: loom.model, loomType: loom.loomType,
    ...entryTotals(loomRows), activeDays: new Set(loomRows.map((row) => row.date)).size,
  })).filter((row) => !search || [row.loomNo, row.loomName, row.brand, row.model].some((value) => clean(value).toLowerCase().includes(search)))
    .sort((a, b) => b.meter - a.meter || String(a.loomNo).localeCompare(String(b.loomNo)))
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const withProduction = performance.filter((row) => row.meter > 0);
  return { range, summary: { totalActiveLooms: looms.length, loomsWithProduction: withProduction.length, idleLooms: looms.length - withProduction.length, totalProductionMeter: round(withProduction.reduce((sum, row) => sum + row.meter, 0)), topLoom: withProduction[0] || null }, rows: performance };
};

const getLoomLedger = async (userId, loomId, query = {}) => {
  const loom = await WeavingLoom.findOne({ _id: loomId, userId }).lean();
  if (!loom) { const error = new Error("Loom not found"); error.statusCode = 404; throw error; }
  const { rows, range } = await loadProductionRows(userId, { ...query, loomId });
  return { loom, range, summary: entryTotals(rows), rows: rows.map(productionRow).sort((a, b) => b.date.localeCompare(a.date) || String(b.thanNo).localeCompare(String(a.thanNo))) };
};

const getQualityProduction = async (userId, query = {}) => {
  const { rows, range } = await loadProductionRows(userId, query);
  const groups = new Map();
  rows.forEach((entry) => {
    const key = id(entry.fabricQualityId); const current = groups.get(key) || { fabricQualityId: entry.fabricQualityId?._id, quality: entry.fabricQualityId?.name || entry.qualitySnapshot?.name || "-", warpCount: entry.fabricQualityId?.warpCount || entry.qualitySnapshot?.warpCount || "", weftCount: entry.fabricQualityId?.weftCount || entry.qualitySnapshot?.weftCount || "", width: entry.fabricQualityId?.width || entry.qualitySnapshot?.width || "", rows: [] };
    current.rows.push(entry); groups.set(key, current);
  });
  return { range, summary: entryTotals(rows), rows: [...groups.values()].map((group) => ({ ...group, ...entryTotals(group.rows), rows: undefined })).sort((a, b) => b.meter - a.meter) };
};

const getFabricStock = async (userId, query = {}) => {
  const stock = await foldingService.stockSummary(userId, query);
  let rows = stock.rows;
  if (query.ownershipType) rows = rows.filter((row) => row.ownershipType === query.ownershipType);
  if (query.ownerPartyId) rows = rows.filter((row) => id(row.ownerPartyId) === id(query.ownerPartyId));
  const totals = rows.reduce((sum, row) => ({ than: round(sum.than + row.than), pieceCount: round(sum.pieceCount + row.pieceCount), meter: round(sum.meter + row.meter), kg: round(sum.kg + row.kg), lbs: round(sum.lbs + row.lbs) }), { than: 0, pieceCount: 0, meter: 0, kg: 0, lbs: 0 });
  return { summary: totals, rows };
};

const getSales = async (userId, query = {}) => {
  const range = resolveRange(query); const match = { userId, status: "posted", ...rangeMatch("invoiceDate", range) };
  if (query.partyId) match.partyId = query.partyId; if (query.saleType) match.saleNature = query.saleType; if (query.contractId) match.contractId = query.contractId; if (query.paymentStatus) match.paymentStatus = query.paymentStatus;
  const invoices = await WeavingSalesInvoice.find(match).populate("partyId", "name").populate("fabricQualityId", "name code").populate("yarnId", "name count millBrand").populate("contractId", "contractNo").sort({ invoiceDate: -1, createdAt: -1 }).lean();
  const breakdown = { fabric: 0, yarn: 0, conversion: 0, other: 0 };
  invoices.forEach((row) => { breakdown[row.saleNature] = round(breakdown[row.saleNature] + row.grandTotal); });
  return { range, summary: { totalSales: round(invoices.reduce((sum, row) => sum + row.grandTotal, 0)), fabricSales: breakdown.fabric, yarnSales: breakdown.yarn, conversionRevenue: breakdown.conversion, otherSales: breakdown.other, received: round(invoices.reduce((sum, row) => sum + row.paidAmount, 0)), outstanding: round(invoices.reduce((sum, row) => sum + row.balanceDue, 0)) }, rows: invoices.map((row) => ({ _id: row._id, invoiceNo: row.invoiceNo, date: row.invoiceDate, party: row.partyId?.name || row.partyName, saleType: row.saleNature, source: row.saleSource, contract: row.contractId?.contractNo || "", item: row.fabricQualityId?.name || row.yarnId?.name || row.description, quantity: row.quantity, uom: row.uom, rate: row.finalRate, amount: row.grandTotal, received: row.paidAmount, balance: row.balanceDue, paymentStatus: row.paymentStatus })) };
};

const getPendingRejection = async (userId, query = {}) => {
  const range = resolveRange(query); const match = { userId, status: { $in: ["pending", "partial", "received"] }, ...rangeMatch("pakkiDate", range) };
  if (query.partyId) match.partyId = query.partyId; if (query.fabricQualityId) match.fabricQualityId = query.fabricQualityId;
  const rows = await WeavingRejectionDue.find(match).populate("partyId", "name").populate("fabricQualityId", "name code").sort({ pakkiDate: 1 }).lean();
  const today = new Date(`${dateKey()}T00:00:00.000Z`);
  const mapped = rows.map((row) => ({ _id: row._id, party: row.partyId?.name || "-", pakkiDate: row.pakkiDate, quality: row.fabricQualityId?.name || row.qualitySnapshot?.name || "-", original: row.originalRejectionMeter, received: row.receivedMeter, pending: row.pendingMeter, age: row.pendingMeter > 0 ? Math.max(0, Math.floor((today - new Date(`${row.pakkiDate}T00:00:00.000Z`)) / 86400000)) : 0, status: row.status }));
  const pendingRows = mapped.filter((row) => row.pending > 0);
  return { range, summary: { original: round(mapped.reduce((sum, row) => sum + row.original, 0)), received: round(mapped.reduce((sum, row) => sum + row.received, 0)), pending: round(mapped.reduce((sum, row) => sum + row.pending, 0)), pendingParties: new Set(pendingRows.map((row) => row.party)).size, oldestPendingDays: pendingRows.reduce((max, row) => Math.max(max, row.age), 0) }, rows: mapped };
};

const activeSalaryJournalFilter = (userId, range = {}) => ({
  createdBy: userId,
  moduleScope: "weaving",
  originModule: "weaving_employee_salary",
  isDeleted: { $ne: true },
  isReversed: { $ne: true },
  isReversal: { $ne: true },
  sourceType: { $ne: "reversal" },
  ...dateRangeMatch("date", range),
});

const salaryExpenseDebitTotal = (journals = []) => round(journals.reduce(
  (total, journal) => total + (journal.lines || [])
    .filter((line) => line.type === "debit"
      && (line.account?.category === "salary" || line.account?.code === "WEAVING_SALARY_EXP"))
    .reduce((sum, line) => sum + Number(line.amount || 0), 0),
  0,
));

const COMPLETE_COST_STATUSES = new Set(["complete", "not_applicable"]);
const PROFIT_DETAIL_TYPES = new Set(["revenue", "cogs", "expenses", "quality", "party", "invoices", "conversion"]);
const safeMargin = (profit, revenue, exact = true) => exact && Math.abs(Number(revenue || 0)) > 0.000001 ? round(Number(profit || 0) * 100 / Number(revenue)) : exact ? 0 : null;
const profitScope = (value) => ["own", "conversion"].includes(value) ? value : "combined";
const buildProfitSalesMatch = (userId, query, range, scope) => {
  const match = { userId, status: "posted", ...rangeMatch("invoiceDate", range) };
  if (query.partyId) match.partyId = query.partyId;
  if (query.fabricQualityId) match.fabricQualityId = query.fabricQualityId;
  if (scope === "own") match.saleNature = ["fabric", "yarn"].includes(query.saleType) ? query.saleType : { $in: ["fabric", "yarn"] };
  else if (scope === "conversion") match.saleNature = "conversion";
  else if (query.saleType) match.saleNature = query.saleType;
  return match;
};
const mapProfitRows = ({ sales = [], costRows = [], hasCostingRun = false }) => {
  const costsByInvoice = new Map(costRows.map((row) => [id(row.entityId), row]));
  return sales.map((invoice) => {
    const cost = costsByInvoice.get(id(invoice)); const exact = Boolean(hasCostingRun && cost && COMPLETE_COST_STATUSES.has(cost.costStatus));
    const revenue = round(Number(invoice.subtotal || 0) - Number(invoice.discountAmount || 0)); const knownDirectCost = round(cost?.components?.total || 0);
    return {
      invoiceId: invoice._id, invoiceNo: invoice.invoiceNo, date: invoice.invoiceDate,
      partyId: invoice.partyId?._id || invoice.partyId, party: invoice.partyId?.name || invoice.partyName || "-",
      saleNature: invoice.saleNature, saleSource: invoice.saleSource,
      fabricQualityId: invoice.fabricQualityId?._id || invoice.fabricQualityId,
      quality: invoice.fabricQualityId?.name || invoice.qualitySnapshot?.name || "",
      qualityCode: invoice.fabricQualityId?.code || invoice.qualitySnapshot?.code || "",
      warpCount: invoice.fabricQualityId?.warpCount || invoice.qualitySnapshot?.warpCount || "",
      weftCount: invoice.fabricQualityId?.weftCount || invoice.qualitySnapshot?.weftCount || "",
      width: invoice.fabricQualityId?.width || invoice.qualitySnapshot?.width || "",
      item: invoice.fabricQualityId?.name || invoice.yarnId?.name || invoice.description || "-",
      contract: invoice.contractId?.contractNo || "", quantity: Number(invoice.quantity || 0), uom: invoice.uom,
      meter: invoice.uom === "Meter" ? Number(invoice.quantity || 0) : 0, rate: Number(invoice.finalRate || 0),
      grossRevenue: round(invoice.subtotal), discount: round(invoice.discountAmount), revenue,
      directCost: exact ? knownDirectCost : null, knownDirectCost,
      profit: exact ? round(revenue - knownDirectCost) : null,
      margin: safeMargin(revenue - knownDirectCost, revenue, exact), exact,
      costStatus: exact ? "complete" : "partial", missingReasons: cost?.missingReasons || (hasCostingRun ? ["Sales COGS snapshot is missing"] : ["Costing has not been calculated"]),
      components: cost?.components || {}, allocationBasis: cost?.allocationBasis || "",
    };
  });
};
const summarizeProfitRows = (rows = [], options = {}) => {
  const revenue = { fabricSales: 0, yarnSales: 0, conversionIncome: 0, otherSales: 0, salesDeductions: 0 };
  rows.forEach((row) => { const key = row.saleNature === "fabric" ? "fabricSales" : row.saleNature === "yarn" ? "yarnSales" : row.saleNature === "conversion" ? "conversionIncome" : "otherSales"; revenue[key] = round(revenue[key] + row.grossRevenue); revenue.salesDeductions = round(revenue.salesDeductions + row.discount); });
  const grossRevenue = round(revenue.fabricSales + revenue.yarnSales + revenue.conversionIncome + revenue.otherSales); const netRevenue = round(grossRevenue - revenue.salesDeductions);
  const exact = rows.every((row) => row.exact) && options.hasCostingRun !== false; const knownDirectStockCost = round(rows.reduce((sum, row) => sum + row.knownDirectCost, 0));
  const components = rows.reduce((sum, row) => { ["material", "warp", "weft", "sizing", "knotting", "processing", "otherDirect"].forEach((key) => { sum[key] = round(sum[key] + Number(row.components?.[key] || 0)); }); return sum; }, { material: 0, warp: 0, weft: 0, sizing: 0, knotting: 0, processing: 0, otherDirect: 0 });
  return { revenue: { ...revenue, grossRevenue, netRevenue }, exact, knownDirectStockCost, components, invoiceCount: rows.length, meter: round(rows.reduce((sum, row) => sum + row.meter, 0)), missingReasons: [...new Set(rows.flatMap((row) => row.missingReasons || []))] };
};
const aggregateProfitability = (rows = [], groupBy) => {
  const groups = new Map();
  rows.forEach((row) => {
    if (groupBy === "quality" && !["fabric", "conversion"].includes(row.saleNature)) return;
    const key = groupBy === "quality" ? id(row.fabricQualityId) || `quality:${row.quality}` : id(row.partyId) || `party:${row.party}`;
    const current = groups.get(key) || { key, qualityId: row.fabricQualityId, quality: row.quality, qualityCode: row.qualityCode, count: [row.warpCount, row.weftCount].filter(Boolean).join(" x "), width: row.width, partyId: row.partyId, party: row.party, businessTypes: new Set(), rows: [] };
    current.businessTypes.add(row.saleNature); current.rows.push(row); groups.set(key, current);
  });
  return [...groups.values()].map((group) => {
    const total = summarizeProfitRows(group.rows); const directCost = total.exact ? total.knownDirectStockCost : null; const profit = total.exact ? round(total.revenue.netRevenue - total.knownDirectStockCost) : null;
    return { ...group, businessTypes: [...group.businessTypes], rows: undefined, revenue: total.revenue.netRevenue, directCost, knownDirectCost: total.knownDirectStockCost, profit, margin: safeMargin(profit, total.revenue.netRevenue, total.exact), meter: total.meter, invoiceCount: total.invoiceCount, costCoverage: total.exact ? "complete" : "partial", missingReasons: total.missingReasons };
  }).sort((a, b) => b.revenue - a.revenue);
};
const loadProfitSales = async (userId, query = {}) => {
  const range = resolveRange(query);
  const scope = profitScope(query.scope); const salesMatch = buildProfitSalesMatch(userId, query, range, scope);
  const [sales, salesCosting] = await Promise.all([
    WeavingSalesInvoice.find(salesMatch).select("invoiceNo invoiceDate partyId partyName saleNature saleSource fabricQualityId yarnId contractId description qualitySnapshot quantity uom finalRate subtotal discountAmount taxAmount grandTotal").populate("partyId", "name").populate("fabricQualityId", "name code warpCount weftCount width").populate("yarnId", "name count millBrand").populate("contractId", "contractNo").sort({ invoiceDate: -1, createdAt: -1 }).lean(),
    costingService.getSalesCosting(userId, { ...range, scope, partyId: query.partyId, saleType: scope === "conversion" ? "conversion" : query.saleType, fabricQualityId: query.fabricQualityId }),
  ]);
  const invoiceIds = new Set(sales.map((row) => id(row))); const costRows = salesCosting.rows.filter((row) => invoiceIds.has(id(row.entityId)));
  const rows = mapProfitRows({ sales, costRows, hasCostingRun: Boolean(salesCosting.run) });
  return { range, scope, rows, run: salesCosting.run, summary: summarizeProfitRows(rows, { hasCostingRun: Boolean(salesCosting.run) }) };
};
const getProfit = async (userId, query = {}) => {
  const salesData = await loadProfitSales(userId, query); const { range, scope, summary } = salesData;
  const [payrollJournals, expenses] = await Promise.all([
    JournalEntry.find(activeSalaryJournalFilter(userId, range)).select("lines").populate("lines.account", "code category moduleScope").lean(),
    Expense.find({ userId, moduleScope: "weaving", isDeleted: false, isReversed: false, ...rangeMatch("date", range) }).select("amount").lean(),
  ]);
  const payrollCost = salaryExpenseDebitTotal(payrollJournals);
  const operatingExpenses = round(expenses.reduce((sum, row) => sum + row.amount, 0));
  const provisionalGrossProfit = round(summary.revenue.netRevenue - summary.knownDirectStockCost);
  const provisionalNetProfit = round(provisionalGrossProfit - payrollCost - operatingExpenses);
  const periodCostsUnallocated = scope !== "combined" || Boolean(query.partyId || query.fabricQualityId || query.saleType);
  const exact = summary.exact; const directStockCost = exact ? summary.knownDirectStockCost : null;
  return { range, scope, costingVersion: salesData.run?.costingVersion || costingService.COSTING_VERSION, calculatedAt: salesData.run?.calculatedAt || null, costCoverage: exact ? "complete" : "partial", isExact: exact, periodCostsUnallocated, missingCostReason: summary.missingReasons.join("; ") || "", missingReasons: summary.missingReasons, revenue: summary.revenue, costs: { directStockCost, knownDirectStockCost: summary.knownDirectStockCost, ...summary.components, payrollCost, periodProductionLabour: payrollCost, productionCost: exact ? round(summary.knownDirectStockCost + payrollCost) : null, operatingExpenses }, invoiceCount: summary.invoiceCount, meter: summary.meter, contributionProfit: exact ? provisionalGrossProfit : null, contributionMargin: safeMargin(provisionalGrossProfit, summary.revenue.netRevenue, exact), grossProfit: exact ? provisionalGrossProfit : null, grossMargin: safeMargin(provisionalGrossProfit, summary.revenue.netRevenue, exact), netProfit: exact && !periodCostsUnallocated ? provisionalNetProfit : null, netMargin: safeMargin(provisionalNetProfit, summary.revenue.netRevenue, exact && !periodCostsUnallocated), provisionalGrossProfit, provisionalNetProfit: periodCostsUnallocated ? null : provisionalNetProfit };
};

const getProfitDetails = async (userId, query = {}) => {
  const type = clean(query.type).toLowerCase(); if (!PROFIT_DETAIL_TYPES.has(type)) { const error = new Error("Unknown Profit detail type"); error.statusCode = 400; throw error; }
  if (type === "expenses") {
    const range = resolveRange(query); const scope = profitScope(query.scope);
    const sharedCostsUnallocated = scope !== "combined" || Boolean(query.partyId || query.fabricQualityId || query.saleType);
    const [expenses, payrollJournals] = await Promise.all([
      Expense.find({ userId, moduleScope: "weaving", isDeleted: false, isReversed: false, ...rangeMatch("date", range) }).select("date title description paymentType amount").sort({ date: -1, createdAt: -1 }).lean(),
      JournalEntry.find(activeSalaryJournalFilter(userId, range)).select("date description lines").populate("lines.account", "code category moduleScope").sort({ date: -1 }).lean(),
    ]);
    const payroll = salaryExpenseDebitTotal(payrollJournals); const operating = round(expenses.reduce((sum, row) => sum + row.amount, 0));
    return { type, range, scope, sharedCostsUnallocated, summary: { payroll, operatingExpenses: operating, total: round(payroll + operating) }, rows: [{ kind: "payroll", title: "Period Payroll / Labour", amount: payroll }, ...expenses.map((row) => ({ kind: "expense", date: row.date, title: row.title, description: row.description, paymentType: row.paymentType, amount: row.amount }))] };
  }
  const salesQuery = type === "conversion" ? { ...query, scope: "conversion", saleType: "conversion" } : query;
  const data = await loadProfitSales(userId, salesQuery); const { rows, summary, range, scope } = data;
  if (type === "revenue") return { type, range, scope, summary: summary.revenue, rows: [{ key: "fabric", amount: summary.revenue.fabricSales }, { key: "conversion", amount: summary.revenue.conversionIncome }, { key: "yarn", amount: summary.revenue.yarnSales }, { key: "other", amount: summary.revenue.otherSales }, { key: "deductions", amount: -summary.revenue.salesDeductions }, { key: "net", amount: summary.revenue.netRevenue }] };
  if (type === "cogs") return { type, range, scope, costCoverage: summary.exact ? "complete" : "partial", missingReasons: summary.missingReasons, summary: { directCost: summary.exact ? summary.knownDirectStockCost : null, knownDirectCost: summary.knownDirectStockCost }, rows: [{ key: "material", amount: summary.components.material, level: 0 }, { key: "warp", amount: summary.components.warp, level: 1 }, { key: "weft", amount: summary.components.weft, level: 1 }, { key: "processing", amount: summary.components.processing, level: 0 }, { key: "sizing", amount: summary.components.sizing, level: 1 }, { key: "knotting", amount: summary.components.knotting, level: 1 }, { key: "otherDirect", amount: summary.components.otherDirect, level: 0 }, { key: "total", amount: summary.knownDirectStockCost, level: 0 }] };
  if (["quality", "party", "conversion"].includes(type)) { const groupBy = type === "quality" ? "quality" : "party"; const grouped = aggregateProfitability(rows, groupBy); return { type, range, scope, summary: { revenue: summary.revenue.netRevenue, directCost: summary.exact ? summary.knownDirectStockCost : null, knownDirectCost: summary.knownDirectStockCost, meter: summary.meter, count: grouped.length, costCoverage: summary.exact ? "complete" : "partial" }, rows: grouped }; }
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1); const limit = Math.min(100, Math.max(10, Number.parseInt(query.limit, 10) || 25)); const start = (page - 1) * limit;
  return { type, range, scope, summary: { revenue: summary.revenue.netRevenue, directCost: summary.exact ? summary.knownDirectStockCost : null, knownDirectCost: summary.knownDirectStockCost, meter: summary.meter, invoiceCount: summary.invoiceCount, costCoverage: summary.exact ? "complete" : "partial" }, pagination: { page, limit, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / limit)) }, rows: rows.slice(start, start + limit) };
};

const getMeta = async (userId) => {
  const [looms, qualities, parties, contracts, godowns] = await Promise.all([
    WeavingLoom.find({ userId, isActive: true }).select("loomNumber name brand model loomType").sort({ loomNumber: 1 }).lean(),
    WeavingFabricQuality.find({ userId, isActive: true }).select("name code warpCount weftCount width").sort({ name: 1 }).lean(),
    WeavingParty.find({ userId, isActive: true, isHidden: false }).select("name role").sort({ name: 1 }).lean(),
    WeavingContract.find({ userId, status: "active" }).select("contractNo type contractType partyId itemId").sort({ contractDate: -1 }).lean(),
    WeavingGodown.find({ userId, isActive: true }).select("name").sort({ name: 1 }).lean(),
  ]);
  return { looms, qualities, parties, contracts, godowns };
};

const getDashboardPurchaseTotal = async (userId) => {
  const range = resolveRange({ preset: "this_month" });
  const purchases = await WeavingPurchaseInvoice.find({
    userId,
    status: { $ne: "void" },
    purchaseDate: { $gte: range.from, $lte: range.to },
    $nor: [{ purchaseType: "yarn", yarnSource: "party" }],
  })
    .select("grandTotal")
    .lean();

  return round(purchases.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0));
};

const getDashboard = async (userId, {
  canViewProduction = true,
  canViewProfit = true,
  canViewSales = true,
  canViewReady = true,
  canViewRejection = true,
  canViewPurchases = true,
} = {}) => {
  const [production, profit, sales, management, purchaseTotal] = await Promise.all([
    canViewProduction ? getProduction(userId, { preset: "this_month" }) : null,
    canViewProfit ? getProfit(userId, { preset: "this_month" }) : null,
    canViewSales ? getSales(userId, { preset: "this_month" }) : null,
    canViewReady || canViewRejection ? salesService.getManagementMetrics(userId) : null,
    canViewPurchases ? getDashboardPurchaseTotal(userId) : null,
  ]);

  const dashboard = {
    productionMeters: production?.summary?.meter ?? null,
    canViewProfit,
    netProfit: profit?.isExact ? profit.netProfit : null,
    profitStatus: profit?.costCoverage || null,
    provisionalNetProfit: profit?.provisionalNetProfit ?? null,
    salesRevenue: sales?.summary?.totalSales ?? null,
    readyToInvoice: canViewReady ? management?.readyCount ?? 0 : null,
    pendingRejectionMeter: canViewRejection
      ? management?.pendingRejectionMeter ?? 0
      : null,
    purchaseTotal,
  };

  if (!canViewProfit) {
    Object.assign(dashboard, {
      canViewProfit: false,
      netProfit: null,
      profitStatus: null,
      provisionalNetProfit: null,
    });
  }

  return dashboard;
};

const REPORT_LOADERS = { production: getProduction, looms: getLoomPerformance, quality: getQualityProduction, stock: getFabricStock, sales: getSales, rejection: getPendingRejection, profit: getProfit };
const getReport = (kind, userId, query) => {
  const loader = REPORT_LOADERS[kind]; if (!loader) { const error = new Error("Unknown Weaving report"); error.statusCode = 404; throw error; }
  return loader(userId, query);
};

module.exports = { getDashboard, getFabricStock, getLoomLedger, getLoomPerformance, getMeta, getPendingRejection, getProduction, getProfit, getProfitDetails, getQualityProduction, getReport, getSales, _test: { activeSalaryJournalFilter, aggregateProfitability, buildProfitSalesMatch, entryTotals, mapProfitRows, resolveRange, safeMargin, salaryExpenseDebitTotal, summarizeProfitRows } };
