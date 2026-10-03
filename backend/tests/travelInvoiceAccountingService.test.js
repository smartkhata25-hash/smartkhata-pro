const test = require("node:test");
const assert = require("node:assert/strict");

const {
  hasAccountingChanges,
} = require("../services/travel/travelInvoiceAccountingService");

const baseInvoice = () => ({
  invoiceDate: new Date("2026-10-03T00:00:00.000Z"),
  customerType: "customer",
  customerId: "64b000000000000000000001",
  baseCurrency: "PKR",
  sellingTotal: 10000,
  costTotal: 6000,
  discountAmount: 0,
  netSale: 10000,
  receivedAmount: 5000,
  paymentType: "cash",
  accountId: "64b000000000000000000002",
  vendorPaidTotal: 3000,
  vendorPayments: [
    {
      vendorType: "vendor",
      vendorId: "64b000000000000000000003",
      paidAmount: 3000,
      paymentType: "cash",
      accountId: "64b000000000000000000002",
    },
  ],
  bookingItems: [
    {
      itemType: "service",
      title: "Travel service",
      vendorType: "vendor",
      vendorId: "64b000000000000000000003",
      sellingPrice: 10000,
      costPrice: 6000,
      sellingCurrency: "PKR",
      costCurrency: "PKR",
      estimatedSellingBase: 10000,
      estimatedCostBase: 6000,
    },
  ],
});

test("identical posted invoice accounting does not require repost", () => {
  const invoice = baseInvoice();
  assert.equal(hasAccountingChanges(invoice, structuredClone(invoice)), false);
});

test("sale, receipt overpayment, vendor payment, customer, vendor and date changes require repost", () => {
  const mutations = [
    (invoice) => { invoice.sellingTotal = 15000; invoice.netSale = 15000; },
    (invoice) => { invoice.receivedAmount = 20000; },
    (invoice) => { invoice.vendorPayments[0].paidAmount = 9000; invoice.vendorPaidTotal = 9000; },
    (invoice) => { invoice.customerId = "64b000000000000000000004"; },
    (invoice) => { invoice.bookingItems[0].vendorId = "64b000000000000000000005"; },
    (invoice) => { invoice.invoiceDate = new Date("2026-10-04T00:00:00.000Z"); },
  ];

  mutations.forEach((mutate) => {
    const original = baseInvoice();
    const updated = structuredClone(original);
    mutate(updated);
    assert.equal(hasAccountingChanges(original, updated), true);
  });
});

test("notes and attachment-only changes do not require accounting repost", () => {
  const original = baseInvoice();
  const updated = { ...structuredClone(original), notes: "Updated", attachments: [{ key: "a" }] };
  assert.equal(hasAccountingChanges(original, updated), false);
});
