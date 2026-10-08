import fs from 'fs';
import path from 'path';

const src = path.resolve(__dirname, '../..');
const read = (...parts) => fs.readFileSync(path.join(src, ...parts), 'utf8');
const occurrences = (source, value) => (source.match(new RegExp(value, 'g')) || []).length;

test('every counterparty entry workflow reuses the shared form-backed selector', () => {
  const parties = read('pages', 'weaving', 'WeavingPartiesPage.js');
  const purchase = read('pages', 'weaving', 'WeavingPurchasePage.js');
  const payments = read('pages', 'weaving', 'WeavingPaymentsPage.js');
  const sizing = read('pages', 'weaving', 'WeavingSizingPage.js');
  const directSales = read('components', 'weaving', 'WeavingDirectSaleModal.js');
  const postedSales = read('components', 'weaving', 'WeavingPostedSaleEditModal.js');

  expect(parties).toContain('<WeavingCounterpartyFormModal');
  expect(occurrences(purchase, '<WeavingCounterpartySelect')).toBeGreaterThanOrEqual(5);
  expect(occurrences(directSales, '<WeavingCounterpartySelect')).toBe(2);
  expect(postedSales).toContain('<WeavingCounterpartySelect');
  expect(payments).toContain('<WeavingCounterpartySelect');
  expect(occurrences(sizing, '<WeavingCounterpartySelect')).toBe(4);
});

test('counterparty workflows contain no reduced quick-add form or name-only Payments create', () => {
  const payments = read('pages', 'weaving', 'WeavingPaymentsPage.js');
  const componentDir = path.join(src, 'components', 'weaving');

  expect(payments).not.toMatch(/quickParty|createCounterparty/);
  expect(fs.existsSync(path.join(componentDir, 'WeavingCounterpartyQuickAdd.js'))).toBe(false);
  expect(fs.existsSync(path.join(componentDir, 'WeavingCounterpartyQuickAdd.test.js'))).toBe(false);
});

test('transaction contexts are wired to their required eligibility rules', () => {
  const purchase = read('pages', 'weaving', 'WeavingPurchasePage.js');
  const payments = read('pages', 'weaving', 'WeavingPaymentsPage.js');
  const sizing = read('pages', 'weaving', 'WeavingSizingPage.js');
  const directSales = read('components', 'weaving', 'WeavingDirectSaleModal.js');
  const postedSales = read('components', 'weaving', 'WeavingPostedSaleEditModal.js');

  expect(purchase).toContain("context={form.yarnSource === 'party' ? 'customer' : 'supplier'}");
  expect(purchase).toContain('context="supplier"');
  expect(occurrences(purchase, 'context="sizing"')).toBe(2);
  expect(payments).toContain("context={tab === 'receive' ? 'customer' : 'supplier'}");
  expect(occurrences(directSales, 'context="customer"')).toBe(2);
  expect(postedSales).toContain('context="customer"');
  expect(occurrences(sizing, 'context="sizing"')).toBe(4);
});
