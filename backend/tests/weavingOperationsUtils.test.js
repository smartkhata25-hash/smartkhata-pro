const assert = require("assert");
const { KG_TO_LBS, LBS_TO_KG, kgFromInput, lbsFromKg, assertUniqueGodowns } = require("../services/weaving/weavingOperationsUtils");
const WeavingContract = require("../models/WeavingContract");
const WeavingLoom = require("../models/WeavingLoom");
const WeavingParty = require("../models/WeavingParty");
const WeavingItem = require("../models/WeavingItem");
const WeavingMoneyTransaction = require("../models/WeavingMoneyTransaction");
const WeavingPurchaseInvoice = require("../models/WeavingPurchaseInvoice");
const WeavingSizingBill = require("../models/WeavingSizingBill");
const WeavingSizingIssue = require("../models/WeavingSizingIssue");
const WeavingSizingReceipt = require("../models/WeavingSizingReceipt");
const WeavingStockTransaction = require("../models/WeavingStockTransaction");
const { COLLECTION_CONFIG } = require("../services/backupService");

assert.strictEqual(KG_TO_LBS, 2.2046226218);
assert.strictEqual(LBS_TO_KG, 0.45359237);
assert.strictEqual(lbsFromKg(50), 110.231131);
assert.strictEqual(kgFromInput({ lbs: 100, sourceEntryUnit: "LBS" }), 45.359237);
assert.strictEqual(kgFromInput({ kg: 50, lbs: 1, sourceEntryUnit: "KG" }), 50);
assert.strictEqual(assertUniqueGodowns([{ godownId: "a", quantity: 50 }, { godownId: "b", quantity: 10 }]), true);
assert.strictEqual(assertUniqueGodowns([{ godownId: "a", quantity: 50 }, { godownId: "a", quantity: 10 }]), false);
const hasUniqueIndex = (Model, fields) => Model.schema.indexes().some(([index, options]) =>
  options.unique && fields.every((field) => Object.prototype.hasOwnProperty.call(index, field))
);
assert.strictEqual(hasUniqueIndex(WeavingLoom, ["userId", "normalizedName"]), true);
assert.strictEqual(hasUniqueIndex(WeavingLoom, ["userId", "loomNumber"]), true);
assert.strictEqual(hasUniqueIndex(WeavingParty, ["userId", "normalizedName", "role"]), true);
assert.strictEqual(hasUniqueIndex(WeavingItem, ["userId", "normalizedName", "category"]), true);
assert.strictEqual(hasUniqueIndex(WeavingPurchaseInvoice, ["userId", "purchaseNo"]), true);
assert.strictEqual(hasUniqueIndex(WeavingMoneyTransaction, ["userId", "transactionNo"]), true);
assert.strictEqual(WeavingPurchaseInvoice.schema.path("moduleScope").defaultValue, "weaving");
assert.strictEqual(WeavingMoneyTransaction.schema.path("moduleScope").defaultValue, "weaving");
assert.strictEqual(hasUniqueIndex(WeavingSizingIssue, ["userId", "issueNo"]), true);
assert.strictEqual(hasUniqueIndex(WeavingSizingReceipt, ["userId", "receiptNo"]), true);
assert.strictEqual(hasUniqueIndex(WeavingSizingBill, ["userId", "billNo"]), true);
assert.strictEqual(hasUniqueIndex(WeavingContract, ["userId", "type", "contractNo"]), true);
assert.strictEqual(hasUniqueIndex(WeavingStockTransaction, ["userId", "itemType", "itemId", "godownId", "transactionType"]), true);
["weavingunits", "weavingdepartments", "weavingshifts", "weavingattendances", "weavinggodowns", "weavingyarns", "weavingfabricqualities", "weavinglooms", "weavingstocktransactions", "weavingcontracts", "weavingparties", "weavingitems", "weavingyarnmovements", "weavingpurchaseinvoices", "weavingmoneytransactions", "weavingsizingissues", "weavingsizingreceipts", "weavingsizingbills"].forEach((collection) => assert.ok(COLLECTION_CONFIG[collection]));
console.log("weavingOperationsUtils tests passed");
