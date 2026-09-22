const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { _test } = require("../services/weaving/weavingOperationalReportService");

const totals = _test.entryTotals([
  { meter: 100, weightKg: 20, goodMeter: 80, bGradeMeter: 15, rejectedMeter: 5 },
  { meter: 120, weightKg: 24, goodMeter: 100, bGradeMeter: 10, rejectedMeter: 10 },
]);
assert.deepStrictEqual(totals, { than: 2, meter: 220, kg: 44, goodMeter: 180, bGradeMeter: 25, rejectedMeter: 15 });
assert.strictEqual(totals.goodMeter + totals.bGradeMeter + totals.rejectedMeter, totals.meter);
assert.deepStrictEqual(_test.resolveRange({ from: "2026-09-01", to: "2026-09-15" }), { from: "2026-09-01", to: "2026-09-15" });

const reportSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingOperationalReportService.js"), "utf8");
assert.match(reportSource, /WeavingFoldingEntry\.find\(match\)/);
assert.match(reportSource, /status: "posted"/);
assert.match(reportSource, /b\.meter - a\.meter/);
assert.match(reportSource, /loadProductionRows\(userId, \{ \.\.\.query, loomId \}\)/);
assert.match(reportSource, /foldingService\.stockSummary/);
assert.match(reportSource, /ownershipType/);
assert.match(reportSource, /WeavingSalesInvoice\.find\(salesMatch\)/);
assert.match(reportSource, /status: "posted"/);
assert.match(reportSource, /received: round\(invoices\.reduce/);
assert.match(reportSource, /pending: round\(mapped\.reduce/);
assert.match(reportSource, /costingService\.getSalesCosting/);
assert.match(reportSource, /costCoverage: exact \? "complete" : "partial"/);
assert.match(reportSource, /directStockCost = exact \? summary\.knownDirectStockCost : null/);
assert.match(reportSource, /periodProductionLabour: payrollCost/);
assert.match(reportSource, /periodCostsUnallocated = scope !== "combined"/);
assert.match(reportSource, /contributionProfit: exact \? provisionalGrossProfit : null/);
assert.match(reportSource, /netProfit: exact && !periodCostsUnallocated/);
assert.match(reportSource, /moduleScope: "weaving"/);
assert.match(reportSource, /originModule: "weaving_employee_salary"/);
assert.doesNotMatch(reportSource, /moduleScope: "trading"|moduleScope: "travel"/);
assert.doesNotMatch(reportSource, /finalRate.*directStockCost|grandTotal.*directStockCost/);

const salesSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8");
const postSource = salesSource.slice(salesSource.indexOf("const postInvoice"), salesSource.indexOf("const receiveRejection"));
const receiveSource = salesSource.slice(salesSource.indexOf("const receiveRejection"), salesSource.indexOf("const reverseRejection"));
const reverseSource = salesSource.slice(salesSource.indexOf("const reverseRejection"), salesSource.indexOf("const getWorkspace"));
assert.match(postSource, /runAtomic\(async \(session\)/);
assert.match(postSource, /WeavingFabricMovement\.findOneAndUpdate/);
assert.match(postSource, /createOne\(JournalEntry/);
assert.match(postSource, /createOne\(WeavingMoneyTransaction/);
assert.match(postSource, /locked\.status = "posted"/);
assert.match(postSource, /receiptRequestKey/);
assert.match(receiveSource, /runAtomic\(async \(session\)/);
assert.match(receiveSource, /WeavingRejectionDue\.findOneAndUpdate/);
assert.match(receiveSource, /createOne\(WeavingRejectionReceipt/);
assert.match(receiveSource, /sessionOptions\(session\)/);
assert.match(reverseSource, /direction: "out"/);
assert.match(reverseSource, /"sale_out", "kacchi_out", "quality_transfer_out"/);

console.log("weaving operational reporting and reliability tests passed");
