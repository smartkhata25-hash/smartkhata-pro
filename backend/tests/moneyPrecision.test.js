const test = require('node:test');
const assert = require('node:assert/strict');

const { formatMoney, roundMoney } = require('../utils/money');
const generateSaleInvoiceHTML = require('../templates/saleInvoiceTemplate');
const generateReceivePaymentHTML = require('../templates/receivePaymentTemplate');

test('money helper removes floating-point artifacts', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(650 / 15), 43.33);
  assert.equal(formatMoney(0), '0');
  assert.equal(formatMoney(2000), '2000');
  assert.equal(formatMoney(2000.5), '2000.5');
  assert.equal(formatMoney(123456789.25), '123456789.25');
  assert.equal(formatMoney(12.05), '12.05');
});

test('Trading print templates render compact money without losing precision', () => {
  const saleHtml = generateSaleInvoiceHTML({
    lang: 'en',
    header: {},
    documentInfo: {},
    party: { customerTotalBalance: 0.1 + 0.2 },
    columns: {},
    items: [
      { name: 'Item', quantity: 15, price: 650 / 15, total: 650 },
      { name: 'Long item description that may wrap', quantity: 1000, price: 123456789.25, total: 123456789.25 },
    ],
    totals: {
      totalAmount: 650,
      discountAmount: 0.1 + 0.2,
      grandTotal: 649.7,
      paidAmount: 12.05,
    },
    footer: {},
    page: { isPdf: true, pageWidth: 'thermal' },
  });

  assert.match(saleHtml, />43\.33</);
  assert.match(saleHtml, />650</);
  assert.match(saleHtml, />12\.05</);
  assert.doesNotMatch(saleHtml, /650\.00/);
  assert.doesNotMatch(saleHtml, /43\.333333|0\.30000000000000004/);
  assert.match(saleHtml, /table-layout:\s*auto/);
  assert.match(saleHtml, /class="numeric-cell rate-cell">43\.33</);
  assert.match(saleHtml, /class="numeric-cell amount-cell">650</);
  assert.match(saleHtml, /class="numeric-cell rate-cell">123456789\.25</);
  assert.match(saleHtml, /white-space:\s*nowrap/);
  assert.match(saleHtml, /overflow-wrap:\s*anywhere/);
  assert.match(saleHtml, /max-width:\s*100%/);

  const receiptHtml = generateReceivePaymentHTML({
    lang: 'en',
    payments: [{ accountName: 'Cash', paymentType: 'Cash', amount: 12.05 }],
    totals: {
      previousBalance: 20.1,
      discountAmount: 0.1 + 0.2,
      remainingBalance: 7.75,
    },
    page: { isPdf: true },
  });

  assert.match(receiptHtml, />12\.05</);
  assert.match(receiptHtml, />0\.3</);
  assert.doesNotMatch(receiptHtml, /0\.30/);
  assert.doesNotMatch(receiptHtml, /0\.30000000000000004/);
});

