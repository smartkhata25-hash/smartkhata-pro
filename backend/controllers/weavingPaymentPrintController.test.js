const test = require("node:test");
const assert = require("node:assert/strict");
const { _test } = require("./weavingPaymentPrintController");

const transaction = {
  type: "receive",
  transactionNo: "RCV-1001",
  date: "2026-10-17",
  createdAt: "2026-10-17T08:00:00.000Z",
  amount: 1250,
  partyId: { name: "Customer & Sons" },
  paymentAccountId: { name: "Main Cash", code: "CASH-1" },
  paymentMethod: "cash",
  description: "Against invoice <script>alert(1)</script>",
};

test("renders one saved Weaving payment as a branded receipt", () => {
  const html = _test.renderPaymentReceipt({
    transaction,
    header: { companyName: "Smart Khata" },
  });

  assert.match(html, /Receive Payment/);
  assert.match(html, /RCV-1001/);
  assert.match(html, /PKR 1,250/);
  assert.match(html, /Customer &amp; Sons/);
  assert.match(html, /Smart Khata/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("uses the payment-made heading and includes saved cheque details", () => {
  const html = _test.renderPaymentReceipt({
    transaction: {
      ...transaction,
      type: "pay",
      transactionNo: "PAY-1001",
      paymentMethod: "cheque",
      chequeNo: "CHQ-9",
      chequeBank: "Example Bank",
      chequeDate: "2026-10-18",
    },
    header: null,
    autoPrint: true,
  });

  assert.match(html, /Payment Made/);
  assert.match(html, /CHQ-9/);
  assert.match(html, /Example Bank/);
  assert.match(html, /window\.print/);
});
