const test = require('node:test');
const assert = require('node:assert/strict');
const Invoice = require('../models/InstallmentsInvoice');
const AccountEntry = require('../models/InstallmentsAccountEntry');
const { calculate } = require('../services/installments/installmentsInvoiceService');

test('combined invoice totals support multiple stockless products and true margin', () => {
  const result = calculate([
    { productName: 'Refrigerator', supplierId: '507f1f77bcf86cd799439011', quantity: 1, unitPurchaseCost: 100000, unitSalePrice: 130000 },
    { productName: 'Fan', supplierId: '507f1f77bcf86cd799439011', quantity: 2, unitPurchaseCost: 5000, unitSalePrice: 7500, brand: 'Custom' },
  ]);
  assert.equal(result.totalPurchaseCost, 110000);
  assert.equal(result.totalSale, 145000);
  assert.equal(result.grossProfit, 35000);
  assert.equal(result.grossMarginPercent, 24.14);
  assert.equal(result.items[1].brand, 'Custom');
});

test('invalid quantities and non-finite prices are rejected', () => {
  assert.throws(() => calculate([{ productName: 'Phone', supplierId: 'x', quantity: 0, unitPurchaseCost: 1, unitSalePrice: 2 }]), /Invalid invoice item amount/);
  assert.throws(() => calculate([{ productName: 'Phone', supplierId: 'x', quantity: 1, unitPurchaseCost: 'nope', unitSalePrice: 2 }]), /Invalid invoice item amount/);
});

test('invoice and account posting keys are owner scoped and idempotent', () => {
  const invoiceIndex = Invoice.schema.indexes().find(([fields]) => fields.businessOwnerId === 1 && fields.invoiceNumber === 1);
  const postingIndex = AccountEntry.schema.indexes().find(([fields]) => fields.businessOwnerId === 1 && fields.idempotencyKey === 1);
  assert.equal(invoiceIndex[1].unique, true);
  assert.equal(postingIndex[1].unique, true);
});
