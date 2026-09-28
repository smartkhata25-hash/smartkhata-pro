const test = require('node:test');
const assert = require('node:assert/strict');

const { formatMoney, roundMoney } = require('../utils/money');
const generateSaleInvoiceHTML = require('../templates/saleInvoiceTemplate');
const generateReceivePaymentHTML = require('../templates/receivePaymentTemplate');

test('money helper removes floating-point artifacts', () => {
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(650 / 15), 43.33);
  assert.equal(formatMoney(12.05), '12.05');
});

test('Trading print templates render money with two decimals', () => {
  const saleHtml = generateSaleInvoiceHTML({
    lang: 'en',
    header: {},
    documentInfo: {},
    party: { customerTotalBalance: 0.1 + 0.2 },
    columns: {},
    items: [{ name: 'Item', quantity: 15, price: 650 / 15, total: 650 }],
    totals: {
      totalAmount: 650,
      discountAmount: 0.1 + 0.2,
      grandTotal: 649.7,
      paidAmount: 12.05,
    },
    footer: {},
    page: { isPdf: true },
  });

  assert.match(saleHtml, />43\.33</);
  assert.match(saleHtml, />650\.00</);
  assert.match(saleHtml, />12\.05</);
  assert.doesNotMatch(saleHtml, /43\.333333|0\.30000000000000004/);

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
  assert.match(receiptHtml, />0\.30</);
  assert.doesNotMatch(receiptHtml, /0\.30000000000000004/);
});

