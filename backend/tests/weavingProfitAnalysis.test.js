const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { _test } = require("../services/weaving/weavingOperationalReportService");

const invoice = (id, saleNature, subtotal, discount, extra = {}) => ({
  _id: id,
  invoiceNo: `WS-${id}`,
  invoiceDate: extra.invoiceDate || "2026-09-10",
  partyId: { _id: extra.partyId || "party1", name: extra.party || "Alpha Textiles" },
  saleNature,
  saleSource: extra.saleSource || "direct",
  fabricQualityId: extra.fabricQualityId ? { _id: extra.fabricQualityId, name: extra.quality || "40x40 Grey", warpCount: "40", weftCount: "40", width: "63" } : null,
  quantity: extra.quantity || 100,
  uom: extra.uom || "Meter",
  finalRate: extra.rate || 10,
  subtotal,
  discountAmount: discount,
  description: extra.description || "",
});
const cost = (id, total, components = {}, status = "complete") => ({
  entityId: id,
  costStatus: status,
  components: { material: 0, warp: 0, weft: 0, processing: 0, sizing: 0, knotting: 0, otherDirect: 0, total, ...components },
  missingReasons: status === "complete" ? [] : ["missing Weft consumption"],
});

const sales = [
  invoice("1", "fabric", 1000, 50, { fabricQualityId: "q1", quantity: 100 }),
  invoice("2", "conversion", 600, 0, { fabricQualityId: "q1", quantity: 60, partyId: "party2", party: "Beta Mills", saleSource: "pakki" }),
  invoice("3", "yarn", 400, 0, { uom: "KG", quantity: 20 }),
];
const costs = [
  cost("1", 600, { material: 500, warp: 300, weft: 200, processing: 100, sizing: 80, knotting: 20 }),
  cost("2", 200, { material: 0, processing: 180, sizing: 150, knotting: 30, otherDirect: 20 }),
  cost("3", 250, { material: 250 }),
];
const mapped = _test.mapProfitRows({ sales, costRows: costs, hasCostingRun: true });
const combined = _test.summarizeProfitRows(mapped, { hasCostingRun: true });

assert.strictEqual(combined.revenue.grossRevenue, 2000, "Combined gross revenue reconciles");
assert.strictEqual(combined.revenue.netRevenue, 1950, "Discounts reconcile to net revenue");
assert.strictEqual(combined.knownDirectStockCost, 1050, "Invoice COGS reconciles to Direct COGS");
assert.strictEqual(combined.components.material + combined.components.processing + combined.components.otherDirect, combined.knownDirectStockCost, "Cost parents reconcile without adding Warp/Weft or Sizing/Knotting twice");
assert.strictEqual(_test.safeMargin(900, 1950, true), 46.15);

const ownFabric = _test.summarizeProfitRows(mapped.filter((row) => row.saleNature === "fabric"));
assert.strictEqual(ownFabric.revenue.netRevenue, 950, "Own Manufacturing Fabric revenue reconciles");
assert.strictEqual(ownFabric.knownDirectStockCost, 600);
const conversion = _test.summarizeProfitRows(mapped.filter((row) => row.saleNature === "conversion"));
assert.strictEqual(conversion.revenue.netRevenue, 600, "Conversion revenue remains service revenue");
assert.strictEqual(conversion.knownDirectStockCost, 200, "Conversion direct cost excludes Party material and retains processing");

const qualities = _test.aggregateProfitability(mapped, "quality");
assert.strictEqual(qualities.length, 1, "Quality profitability includes Fabric activity only");
assert.strictEqual(qualities[0].revenue, 1550);
assert.strictEqual(qualities[0].directCost, 800);
assert.strictEqual(qualities[0].invoiceCount, 2);
const parties = _test.aggregateProfitability(mapped, "party");
assert.strictEqual(parties.reduce((sum, row) => sum + row.revenue, 0), combined.revenue.netRevenue, "Party profitability reconciles to scoped revenue");
assert.strictEqual(parties.reduce((sum, row) => sum + row.directCost, 0), combined.knownDirectStockCost, "Party profitability reconciles to scoped COGS");

const partialRows = _test.mapProfitRows({ sales: [sales[0]], costRows: [cost("1", 300, { material: 300 }, "partial")], hasCostingRun: true });
assert.strictEqual(partialRows[0].directCost, null);
assert.strictEqual(partialRows[0].profit, null);
assert.strictEqual(partialRows[0].margin, null, "Partial cost never produces an exact margin");
assert.strictEqual(_test.summarizeProfitRows(partialRows).exact, false);

const range = _test.resolveRange({ from: "2026-09-01", to: "2026-09-15" });
const ownMatch = _test.buildProfitSalesMatch("user1", { partyId: "party1", fabricQualityId: "q1", saleType: "fabric" }, range, "own");
assert.deepStrictEqual(ownMatch.invoiceDate, { $gte: "2026-09-01", $lte: "2026-09-15" }, "Date filter is preserved");
assert.strictEqual(ownMatch.partyId, "party1", "Party filter is preserved");
assert.strictEqual(ownMatch.fabricQualityId, "q1", "Quality filter is preserved");
assert.strictEqual(ownMatch.saleNature, "fabric", "Own Manufacturing uses Fabric scope");
assert.strictEqual(_test.buildProfitSalesMatch("user1", {}, range, "conversion").saleNature, "conversion");

const serviceSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingOperationalReportService.js"), "utf8");
assert.match(serviceSource, /periodCostsUnallocated = scope !== "combined"/);
assert.match(serviceSource, /netProfit: exact && !periodCostsUnallocated/);
assert.match(serviceSource, /contributionProfit: exact \? provisionalGrossProfit : null/);
assert.match(serviceSource, /moduleScope: "weaving"/);
assert.doesNotMatch(serviceSource, /moduleScope: "trading"|moduleScope: "travel"/);

const routeSource = fs.readFileSync(path.join(__dirname, "../routes/weavingReportRoutes.js"), "utf8");
assert.match(routeSource, /"\/profit\/details", requirePermission\("weaving\.reports\.profit"\)/, "Profit details require focused permission");

console.log("weaving Profit analysis tests passed");
