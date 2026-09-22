const assert = require("assert");
const fs = require("fs");
const path = require("path");

const BusinessAsset = require("../models/BusinessAsset");
const BusinessAssetCategory = require("../models/BusinessAssetCategory");
const BusinessLiability = require("../models/BusinessLiability");
const BusinessLiabilityPayment = require("../models/BusinessLiabilityPayment");
const BusinessReceivableLoan = require("../models/BusinessReceivableLoan");
const BusinessReceivableLoanPayment = require("../models/BusinessReceivableLoanPayment");
const Employee = require("../models/Employee");
const EmployeeAdvanceLoan = require("../models/EmployeeAdvanceLoan");
const JournalEntry = require("../models/JournalEntry");
const WeavingParty = require("../models/WeavingParty");
const { COLLECTION_CONFIG } = require("../services/backupService");
const businessValueService = require("../services/businessValueService");
const weavingCostingService = require("../services/weaving/weavingCostingService");
const {
  buildBusinessValueScopeFilter,
  getScopedBusinessValueAccountConfig,
  getScopedBusinessValueOrigin,
  resolveBusinessValueModuleScope,
} = require("../utils/businessValueModuleScope");
const { buildModuleScopeFilter, MODULE_SCOPES } = require("../utils/moduleScope");

const read = (relativePath) =>
  fs.readFileSync(path.join(__dirname, relativePath), "utf8");

assert.strictEqual(
  resolveBusinessValueModuleScope({ moduleScope: "weaving" }),
  MODULE_SCOPES.WEAVING,
);
assert.deepStrictEqual(buildBusinessValueScopeFilter("weaving"), {
  moduleScope: "weaving",
});
assert.deepStrictEqual(buildBusinessValueScopeFilter("travel"), {
  moduleScope: "travel",
});
assert.deepStrictEqual(buildModuleScopeFilter("weaving"), {
  moduleScope: { $in: ["weaving", "shared"] },
});
assert.ok(buildBusinessValueScopeFilter("trading").$or, "Trading keeps legacy scope records");
assert.match(
  JSON.stringify(businessValueService._test.buildTradingJournalFilter()),
  /shared/,
  "Trading keeps shared-account journal compatibility",
);

assert.deepStrictEqual(
  getScopedBusinessValueAccountConfig(
    { name: "Loan Receivable", code: "LOAN_RECEIVABLE" },
    "weaving",
  ),
  {
    name: "Weaving Loan Receivable",
    code: "WEAVING_LOAN_RECEIVABLE",
    moduleScope: "weaving",
  },
);
assert.strictEqual(
  getScopedBusinessValueOrigin("business_receivable_loan", "weaving"),
  "weaving_business_receivable_loan",
);

[
  BusinessAsset,
  BusinessAssetCategory,
  BusinessLiability,
  BusinessLiabilityPayment,
  BusinessReceivableLoan,
  BusinessReceivableLoanPayment,
].forEach((Model) => {
  assert.ok(
    Model.schema.path("moduleScope").enumValues.includes("weaving"),
    `${Model.modelName} accepts Weaving scope`,
  );
});

assert.deepStrictEqual(
  businessValueService.normalizeComponents({
    preset: "complete",
    moduleScope: "weaving",
  }),
  businessValueService.PRESETS.complete,
);
assert.deepStrictEqual(
  businessValueService.normalizeComponents({ preset: "complete", moduleScope: "trading" }),
  businessValueService.PRESETS.complete,
  "Trading presets remain unchanged",
);
assert.deepStrictEqual(
  businessValueService.normalizeComponents({ preset: "complete", moduleScope: "travel" }),
  businessValueService.TRAVEL_PRESETS.complete,
  "Travel keeps its inventory-free preset",
);

const exactInventory = businessValueService._test.mapWeavingInventoryValuation({
  costingVersion: "weaving-cost-v1",
  calculatedAt: "2026-09-20T10:00:00.000Z",
  costCoverage: "complete",
  missingReasons: [],
  yarn: {
    rows: [{ ownershipType: "own" }, { ownershipType: "party" }],
    quantityKg: 50,
    partyQuantityKg: 75,
    inventoryValue: 12500,
    knownInventoryValue: 12500,
  },
  fabric: {
    rows: [{ ownershipType: "own" }, { ownershipType: "party" }],
    meter: 200,
    kg: 40,
    partyMeter: 300,
    inventoryValue: 30000,
    knownInventoryValue: 30000,
  },
});
assert.strictEqual(exactInventory.value, 42500);
assert.strictEqual(exactInventory.isExact, true);
assert.strictEqual(exactInventory.totalProducts, 2, "party-owned rows are not company inventory");

const partialInventory = businessValueService._test.mapWeavingInventoryValuation({
  costCoverage: "partial",
  missingReasons: ["source cost unavailable"],
  yarn: { quantityKg: 50, inventoryValue: null, knownInventoryValue: 10000 },
  fabric: { meter: 100, inventoryValue: null, knownInventoryValue: 18000 },
});
assert.strictEqual(partialInventory.value, 28000, "known inventory value remains visible");
assert.strictEqual(partialInventory.isExact, false);
assert.strictEqual(partialInventory.valuationStatus, "partial");
assert.deepStrictEqual(partialInventory.missingReasons, ["source cost unavailable"]);

const accountSummary = businessValueService._test.summarizeWeavingAccountData({
  accountData: [
    { _id: { accountId: "cash", category: "cash", lineType: "debit" }, amount: 500 },
    { _id: { accountId: "cash", category: "cash", lineType: "credit" }, amount: 50 },
    { _id: { accountId: "bank", category: "bank", lineType: "debit" }, amount: 900 },
    { _id: { accountId: "party-1", category: "party", lineType: "debit" }, amount: 1000 },
    { _id: { accountId: "party-1", category: "party", lineType: "credit" }, amount: 200 },
    { _id: { accountId: "party-2", category: "party", lineType: "credit" }, amount: 400 },
    { _id: { accountId: "trading-party", category: "party", lineType: "debit" }, amount: 9999 },
  ],
  parties: [{ accountId: "party-1" }, { accountId: "party-2" }],
  employeeSummary: { totalPayable: 300, totalRecoverable: 125 },
});
assert.deepStrictEqual(accountSummary, {
  cash: 450,
  bank: 900,
  receivables: 800,
  payables: 700,
  receivableCount: 1,
  payableCount: 2,
});

const summarySource = read("../services/businessValueService.js");
assert.match(summarySource, /moduleScope: MODULE_SCOPES\.WEAVING/);
assert.match(
  summarySource,
  /\$in: \[MODULE_SCOPES\.WEAVING, MODULE_SCOPES\.SHARED\]/,
);
assert.match(summarySource, /weavingCostingService\.getInventoryValuation/);
assert.match(summarySource, /WeavingParty\.find/);

[
  "../controllers/businessLiabilityPaymentController.js",
  "../controllers/businessReceivableLoanController.js",
  "../controllers/businessReceivableLoanPaymentController.js",
].forEach((controllerPath) => {
  const source = read(controllerPath);
  assert.match(source, /JournalEntry\.create\(\{/);
  assert.match(source, /moduleScope,/);
  assert.match(source, /getScopedBusinessValueOrigin/);
});

[
  "businessassetcategories",
  "businessassets",
  "businessliabilities",
  "businessliabilitypayments",
  "businessreceivableloans",
  "businessreceivableloanpayments",
].forEach((collection) => assert.ok(COLLECTION_CONFIG[collection]));

const restoreSource = read("../services/restoreService.js");
assert.match(restoreSource, /businessassetcategories/);
assert.match(restoreSource, /businessliabilitypayments/);
assert.match(restoreSource, /businessreceivableloanpayments/);

const appSource = read("../../frontend/src/App.js");
assert.match(appSource, /path="\/weaving\/business-value"/);
assert.match(appSource, /<BusinessValuePage moduleScope=\{BUSINESS_VALUE_MODULE_SCOPES\.WEAVING\}/);
assert.doesNotMatch(appSource, /WeavingBusinessValuePage/);

const originalMethods = {
  employeeFind: Employee.find,
  advanceAggregate: EmployeeAdvanceLoan.aggregate,
  journalAggregate: JournalEntry.aggregate,
  partyFind: WeavingParty.find,
  getInventoryValuation: weavingCostingService.getInventoryValuation,
};

(async () => {
  try {
    Employee.find = () => ({ select: async () => [] });
    EmployeeAdvanceLoan.aggregate = async () => [];
    WeavingParty.find = () => ({
      select: () => ({
        lean: async () => [{ accountId: "party-1" }, { accountId: "party-2" }],
      }),
    });
    JournalEntry.aggregate = async (pipeline) => {
      assert.strictEqual(pipeline[0].$match.moduleScope, "weaving");
      return [
        { _id: { accountId: "cash", category: "cash", lineType: "debit" }, amount: 500 },
        { _id: { accountId: "cash", category: "cash", lineType: "credit" }, amount: 50 },
        { _id: { accountId: "bank", category: "bank", lineType: "debit" }, amount: 900 },
        { _id: { accountId: "party-1", category: "party", lineType: "debit" }, amount: 800 },
        { _id: { accountId: "party-2", category: "party", lineType: "credit" }, amount: 400 },
      ];
    };
    weavingCostingService.getInventoryValuation = async () => ({
      costCoverage: "partial",
      missingReasons: ["source cost unavailable"],
      yarn: { quantityKg: 50, inventoryValue: null, knownInventoryValue: 10000 },
      fabric: { meter: 100, inventoryValue: null, knownInventoryValue: 18000 },
    });

    const summary = await businessValueService.getBusinessValueSummary({
      userId: "66e123456789012345678901",
      preset: "custom",
      components: ["inventory", "cash", "bank", "receivables", "payables"],
      moduleScope: "weaving",
    });

    assert.strictEqual(summary.moduleScope, "weaving");
    assert.strictEqual(summary.components.inventory.value, 28000);
    assert.strictEqual(summary.components.inventory.isExact, false);
    assert.strictEqual(summary.components.cash.value, 450);
    assert.strictEqual(summary.components.bank.value, 900);
    assert.strictEqual(summary.components.receivables.value, 800);
    assert.strictEqual(summary.components.payables.value, 400);
    assert.strictEqual(summary.netBusinessValue, 29750);
    assert.strictEqual(summary.valuationStatus, "partial");
    assert.deepStrictEqual(summary.partialComponents, ["inventory"]);

    console.log("Weaving Business Value tests passed");
  } finally {
    Employee.find = originalMethods.employeeFind;
    EmployeeAdvanceLoan.aggregate = originalMethods.advanceAggregate;
    JournalEntry.aggregate = originalMethods.journalAggregate;
    WeavingParty.find = originalMethods.partyFind;
    weavingCostingService.getInventoryValuation = originalMethods.getInventoryValuation;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
