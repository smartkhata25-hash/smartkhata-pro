const test = require("node:test");
const assert = require("node:assert/strict");

const {
  collectEffectiveVendorCosts,
  normalizePaxPricing,
  normalizeTicketDetails,
  normalizeVendorPayments,
  _test: { applyEstimatedTotals },
} = require("../services/travel/travelBookingService");
const {
  _test: { buildAccountingSnapshot, collectVendorCostRows },
} = require("../services/travel/travelInvoiceAccountingService");
const {
  _test: { collectVendorCostRows: collectReturnVendorCostRows },
} = require("../controllers/travel/travelVendorReturnController");

const vendorA = "64f000000000000000000001";
const vendorB = "64f000000000000000000002";
const accountA = "64f000000000000000000011";

test("duplicate passenger types are normalized with independent row vendors", () => {
  const rows = normalizePaxPricing([
    { paxType: "adult", count: 2, costPrice: 25000, sellingPrice: 28000, vendorId: vendorA },
    { paxType: "adult", count: 2, costPrice: 26000, sellingPrice: 29000, vendorId: vendorB },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].paxType, "adult");
  assert.equal(rows[1].paxType, "adult");
  assert.equal(String(rows[0].vendorId), vendorA);
  assert.equal(String(rows[1].vendorId), vendorB);
});

test("row vendor costs group repeated vendors and reject incomplete confirmed allocation", () => {
  const completeItem = {
    itemType: "air_ticket",
    title: "Ticket",
    estimatedCostBase: 90000,
    paxPricing: [
      { paxType: "adult", vendorType: "vendor", vendorId: vendorA, estimatedCostBase: 50000 },
      { paxType: "adult", vendorType: "vendor", vendorId: vendorA, estimatedCostBase: 40000 },
    ],
  };
  const groups = collectEffectiveVendorCosts([completeItem], { requireAssigned: true });

  assert.equal(groups.get(`vendor:${vendorA}`), 90000);

  assert.throws(
    () =>
      collectEffectiveVendorCosts(
        [
          {
            ...completeItem,
            paxPricing: [
              completeItem.paxPricing[0],
              { paxType: "adult", estimatedCostBase: 40000 },
            ],
          },
        ],
        { requireAssigned: true },
      ),
    /Vendor is required for cost row/,
  );
});

test("vendor payments require unique vendors and retain per-vendor account data", () => {
  const payments = normalizeVendorPayments([
    {
      vendorType: "vendor",
      vendorId: vendorA,
      paidAmount: 20000,
      paymentType: "cash",
      accountId: accountA,
    },
    { vendorType: "vendor", vendorId: vendorB, paidAmount: 0 },
  ]);

  assert.equal(payments[0].paidAmount, 20000);
  assert.equal(payments[0].paymentType, "cash");
  assert.equal(String(payments[0].accountId), accountA);
  assert.equal(payments[1].paymentType, "credit");
  assert.equal(payments[1].accountId, null);

  assert.throws(
    () =>
      normalizeVendorPayments([
        { vendorId: vendorA, paidAmount: 0 },
        { vendorId: vendorA, paidAmount: 0 },
      ]),
    /Duplicate vendor payment row/,
  );
});

test("accounting uses row allocations while preserving legacy item paid amounts", () => {
  const rowBooking = {
    bookingItems: [
      {
        _id: "item-1",
        itemType: "air_ticket",
        title: "Ticket",
        vendorId: vendorB,
        estimatedCostBase: 102000,
        estimatedVendorPaidBase: 99999,
        paxPricing: [
          { paxType: "adult", vendorId: vendorA, estimatedCostBase: 50000 },
          { paxType: "adult", vendorId: vendorB, estimatedCostBase: 52000 },
        ],
      },
    ],
  };
  const rows = collectVendorCostRows(rowBooking);

  assert.deepEqual(
    rows.map((row) => [row.vendorId, row.amount, row.paidAmount]),
    [
      [vendorA, 50000, 0],
      [vendorB, 52000, 0],
    ],
  );

  const legacyRows = collectVendorCostRows({
    bookingItems: [
      {
        itemType: "hotel",
        vendorId: vendorA,
        estimatedCostBase: 50000,
        estimatedVendorPaidBase: 20000,
      },
    ],
  });
  assert.equal(legacyRows[0].paidAmount, 20000);
});

test("vendor return eligibility aggregates only matching row-vendor cost in an item", () => {
  const invoice = {
    bookingItems: [
      {
        _id: "item-1",
        itemType: "air_ticket",
        title: "Ticket",
        vendorId: vendorB,
        estimatedCostBase: 142000,
        paxPricing: [
          { vendorId: vendorA, estimatedCostBase: 50000 },
          { vendorId: vendorB, estimatedCostBase: 52000 },
          { vendorId: vendorA, estimatedCostBase: 40000 },
        ],
      },
    ],
  };

  const rows = collectReturnVendorCostRows(invoice, {
    vendorType: "vendor",
    vendorId: vendorA,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "item-1");
  assert.equal(rows[0].amount, 90000);
});

test("accounting snapshot changes when row vendors or vendor payments change", () => {
  const source = {
    bookingItems: [
      {
        itemType: "air_ticket",
        paxPricing: [{ paxType: "adult", count: 1, estimatedCostBase: 50000, vendorId: vendorA }],
      },
    ],
    vendorPayments: [
      { vendorId: vendorA, paidAmount: 20000, paymentType: "cash", accountId: accountA },
    ],
  };

  const changed = {
    ...source,
    vendorPayments: [{ ...source.vendorPayments[0], paidAmount: 21000 }],
  };

  assert.notEqual(buildAccountingSnapshot(source), buildAccountingSnapshot(changed));
});

test("multi-city sectors normalize ids and calculate independent pricing without double count", () => {
  const sectorId = "64f000000000000000000101";
  const rowId = "64f000000000000000000102";
  const ticketDetails = normalizeTicketDetails({
    journeyType: "multi_city",
    sectors: [
      {
        _id: sectorId,
        airline: "PIA",
        origin: "LHE",
        destination: "DXB",
        departureDateTime: "2026-11-01T10:00:00.000Z",
        vendorId: vendorA,
        paxPricing: [
          { _id: rowId, paxType: "adult", count: 2, costPrice: 100, sellingPrice: 150 },
          { paxType: "child", count: 1, costPrice: 60, sellingPrice: 90 },
        ],
      },
      {
        airline: "Emirates",
        origin: "DXB",
        destination: "LHR",
        departureDateTime: "2026-11-03T12:00:00.000Z",
        vendorId: vendorB,
        paxPricing: [
          { paxType: "adult", count: 1, costPrice: 200, sellingPrice: 260 },
          { paxType: "infant", count: 1, costPrice: 25, sellingPrice: 40, vendorId: vendorA },
        ],
      },
    ],
  });

  assert.equal(String(ticketDetails.sectors[0]._id), sectorId);
  assert.equal(String(ticketDetails.sectors[0].paxPricing[0]._id), rowId);

  const result = applyEstimatedTotals(
    [
      {
        itemType: "air_ticket",
        costCurrency: "PKR",
        sellingCurrency: "PKR",
        costPrice: 999999,
        sellingPrice: 999999,
        paxPricing: [{ count: 99, costPrice: 999, sellingPrice: 999 }],
        ticketDetails,
      },
    ],
    { baseCurrency: "PKR", costRates: new Map(), saleRates: new Map() },
  );

  assert.equal(result.costTotal, 485);
  assert.equal(result.sellingTotal, 690);
  assert.equal(result.bookingItems[0].estimatedCostBase, 485);
  assert.equal(result.bookingItems[0].ticketDetails.sectors[1].paxPricing[1].estimatedCostBase, 25);

  const converted = applyEstimatedTotals(
    [{ ...result.bookingItems[0], costCurrency: "USD", sellingCurrency: "USD" }],
    {
      baseCurrency: "PKR",
      costRates: new Map([["USD", 280.123456]]),
      saleRates: new Map([["USD", 281.654321]]),
    },
  );
  assert.equal(converted.costTotal, 135859.88);
  assert.equal(converted.sellingTotal, 194341.48);
  assert.equal(
    converted.bookingItems[0].ticketDetails.sectors
      .flatMap((sector) => sector.paxPricing)
      .reduce((sum, row) => sum + row.estimatedCostBase, 0),
    135859.88,
  );
});

test("multi-city accounting uses sector defaults and row vendor overrides", () => {
  const item = {
    _id: "item-multi",
    itemType: "air_ticket",
    title: "Multi-city ticket",
    estimatedCostBase: 485,
    ticketDetails: {
      journeyType: "multi_city",
      sectors: [
        {
          _id: "sector-1",
          vendorId: vendorA,
          paxPricing: [
            { paxType: "adult", estimatedCostBase: 200 },
            { paxType: "child", estimatedCostBase: 60 },
          ],
        },
        {
          _id: "sector-2",
          vendorId: vendorB,
          paxPricing: [
            { paxType: "adult", estimatedCostBase: 200 },
            { paxType: "infant", vendorId: vendorA, estimatedCostBase: 25 },
          ],
        },
      ],
    },
  };

  const groups = collectEffectiveVendorCosts([item], { requireAssigned: true });
  assert.equal(groups.get(`vendor:${vendorA}`), 285);
  assert.equal(groups.get(`vendor:${vendorB}`), 200);

  const accountingRows = collectVendorCostRows({ bookingItems: [item] });
  assert.equal(
    accountingRows.filter((row) => row.vendorId === vendorA).reduce((sum, row) => sum + row.amount, 0),
    285,
  );
  assert.equal(
    accountingRows.filter((row) => row.vendorId === vendorB).reduce((sum, row) => sum + row.amount, 0),
    200,
  );

  const returnRows = collectReturnVendorCostRows({ bookingItems: [item] }, {
    vendorType: "vendor",
    vendorId: vendorA,
  });
  assert.equal(returnRows.reduce((sum, row) => sum + row.amount, 0), 285);
});
