const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (relative) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
const commercial = read('services/weaving/weavingCommercialService.js');
const sales = read('services/weaving/weavingSalesService.js');
const routes = read('routes/weavingCommercialRoutes.js');
const purchaseModel = read('models/WeavingPurchaseInvoice.js');
const issueModel = read('models/WeavingSizingIssue.js');
const purchasePage = read('../frontend/src/pages/weaving/WeavingPurchasePage.js');
const salePage = read('../frontend/src/pages/weaving/WeavingSalesSettlementPage.js');
const saleModal = read('../frontend/src/components/weaving/WeavingDirectSaleModal.js');

assert.match(commercial, /const updatePurchase = async/);
assert.match(commercial, /const voidPurchase = async/);
assert.match(commercial, /createReversalInSession/);
assert.match(commercial, /Reverse later payments linked to this Purchase/);
assert.match(commercial, /Purchased Yarn has already been used downstream/);
assert.match(commercial, /sourceType: "direct_purchase"/);
assert.match(commercial, /movementIds: invoiceLines\.map/);
assert.doesNotMatch(commercial.slice(commercial.indexOf('if (directGroups.size)'), commercial.indexOf('if (!nonFinancial)', commercial.indexOf('if (directGroups.size)'))), /movementType: "sizing_issue"/);
assert.match(sales, /const updatePostedInvoice = async/);
assert.match(sales, /Reverse later receipts linked to this Invoice/);
assert.match(sales, /reverseJournalInSession/);
assert.match(routes, /purchases\/:id\/void/);
assert.match(routes, /weaving\.purchases\.edit/);
assert.match(purchaseModel, /replacesPurchaseId/);
assert.match(issueModel, /sourcePurchaseId/);
assert.match(purchasePage, /role="button" tabIndex=\{0\}/);
assert.match(purchasePage, /event\.stopPropagation\(\)/);
assert.match(purchasePage, /updatePurchase\(editingId/);
assert.match(salePage, /WeavingDirectSaleModal/);
assert.match(saleModal, /weaving:sale:unsaved:direct/);
assert.match(saleModal, /clearDirectSaleRecovery/);

console.log('weaving commercial mutation safety tests passed');
