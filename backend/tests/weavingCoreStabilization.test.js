const assert = require("assert");
const fs = require("fs");
const path = require("path");

const WeavingFabricMovement = require("../models/WeavingFabricMovement");
const WeavingKacchiParchi = require("../models/WeavingKacchiParchi");
const WeavingMoneyTransaction = require("../models/WeavingMoneyTransaction");
const WeavingPakkiSettlement = require("../models/WeavingPakkiSettlement");
const WeavingSalesInvoice = require("../models/WeavingSalesInvoice");

const fabricPaths = WeavingFabricMovement.schema.paths;
assert.ok(fabricPaths.kacchiId);
assert.ok(fabricPaths.sourceFoldingEntryId);
assert.ok(fabricPaths.thanCount);
assert.ok(fabricPaths.pieceCount);
assert.ok(fabricPaths.purchaseInvoiceId);
assert.ok(fabricPaths.movementType.enumValues.includes("purchase_in"));

const movementIndexes = WeavingFabricMovement.schema.indexes();
assert.ok(movementIndexes.some(([fields, options]) => fields.kacchiId === 1 && fields.sourceFoldingEntryId === 1 && options.unique));
assert.ok(movementIndexes.some(([fields, options]) => fields.purchaseInvoiceId === 1 && fields.purchaseLineId === 1 && options.unique));
assert.ok(WeavingKacchiParchi.schema.indexes().some(([fields, options]) => fields.requestKey === 1 && options.unique));
assert.ok(WeavingMoneyTransaction.schema.indexes().some(([fields, options]) => fields.requestKey === 1 && options.unique));
assert.ok(WeavingPakkiSettlement.schema.paths.sourceKacchiId);
assert.ok(WeavingPakkiSettlement.schema.paths.stockMovementId);
assert.ok(WeavingPakkiSettlement.schema.paths.voidedAt);
assert.ok(WeavingPakkiSettlement.schema.indexes().some(([fields, options]) => fields.kacchiId === 1 && options.unique));
assert.ok(WeavingSalesInvoice.schema.indexes().some(([fields, options]) => fields.sourcePakkiId === 1 && fields.activeForPakki === 1 && options.unique));

const salesSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingSalesService.js"), "utf8");
const commercialSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingCommercialService.js"), "utf8");
const foldingSource = fs.readFileSync(path.join(__dirname, "../services/weaving/weavingFoldingService.js"), "utf8");
assert.match(salesSource, /activeKacchiId: null/);
assert.match(salesSource, /requestKey/);
assert.match(salesSource, /activeForPakki = false/);
assert.match(salesSource, /Reverse linked receipts before voiding/);
const voidPakkiSource = salesSource.slice(salesSource.indexOf("const voidPakki"), salesSource.indexOf("const draftFromPakki"));
assert.match(voidPakkiSource, /sourceKacchiId/);
assert.match(voidPakkiSource, /WeavingSalesInvoice\.findOne/);
assert.match(voidPakkiSource, /status: "posted"/);
assert.match(voidPakkiSource, /rejectionDue\.status = "closed"/);
assert.match(voidPakkiSource, /kacchi\.status = "confirmed"/);
assert.match(voidPakkiSource, /kacchi\.pakkiId = null/);
assert.match(voidPakkiSource, /pakki\.kacchiId = null/);
assert.doesNotMatch(voidPakkiSource, /WeavingFabricMovement|stockMovementId|activeKacchiId|movementType: "kacchi_out"/);
assert.match(commercialSource, /movementType: "purchase_in"/);
assert.match(commercialSource, /Weaving Fabric Inventory/);
assert.match(commercialSource, /WeavingMoneyTransaction\.findOne\(\{ userId, requestKey \}\)/);
assert.match(foldingSource, /than: sign \* Number\(movement\.thanCount/);
assert.match(foldingSource, /weightLbs: sign \* Number\(movement\.weightKg/);

console.log("weaving core stabilization tests passed");
