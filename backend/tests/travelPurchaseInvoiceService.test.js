const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildVendorPurchaseGroups,
  calculateRemainingReturnAmount,
} = require("../services/travel/travelPurchaseInvoiceService");

const vendorA = "64f000000000000000000001";
const vendorB = "64f000000000000000000002";
const partyVendor = "64f000000000000000000003";

test("purchase groups split passenger pricing vendors and never use selling totals", () => {
  const groups = buildVendorPurchaseGroups({
    sellingTotal: 45000,
    bookingItems: [
      {
        _id: "64f000000000000000000011",
        itemType: "air_ticket",
        title: "Air Ticket",
        estimatedCostBase: 35000,
        estimatedSellingBase: 45000,
        paxPricing: [
          {
            paxType: "adult",
            vendorId: vendorA,
            estimatedCostBase: 20000,
          },
          {
            paxType: "child",
            vendorId: vendorB,
            estimatedCostBase: 15000,
          },
        ],
      },
    ],
  });

  assert.equal(groups.length, 2);
  assert.equal(groups.find((row) => row.vendorId === vendorA).purchaseAmount, 20000);
  assert.equal(groups.find((row) => row.vendorId === vendorB).purchaseAmount, 15000);
  assert.equal(groups.reduce((sum, row) => sum + row.purchaseAmount, 0), 35000);
});

test("bookings without a positive assigned vendor cost do not create purchase rows", () => {
  const groups = buildVendorPurchaseGroups({
    sellingTotal: 45000,
    bookingItems: [
      {
        itemType: "service",
        title: "Customer-only service",
        estimatedSellingBase: 45000,
        estimatedCostBase: 0,
      },
    ],
  });

  assert.deepEqual(groups, []);
});

test("purchase groups support custom Umrah supplier parties and per-vendor payments", () => {
  const groups = buildVendorPurchaseGroups({
    bookingItems: [
      {
        _id: "64f000000000000000000012",
        itemType: "umrah_package",
        umrahDetails: {
          packageMode: "custom_component_package",
          components: [
            {
              _id: "64f000000000000000000021",
              componentType: "hotel",
              label: "Makkah Hotel",
              vendorType: "party",
              vendorPartyId: partyVendor,
              estimatedCostBase: 30000,
            },
            {
              _id: "64f000000000000000000022",
              componentType: "transport",
              label: "Transport",
              vendorId: vendorA,
              estimatedCostBase: 10000,
            },
          ],
        },
      },
    ],
    vendorPayments: [
      {
        vendorType: "party",
        vendorPartyId: partyVendor,
        paidAmount: 12000,
        paymentType: "cash",
      },
      {
        vendorId: vendorA,
        paidAmount: 10000,
        paymentType: "online",
      },
    ],
  });

  const partyGroup = groups.find((row) => row.vendorPartyId === partyVendor);
  const vendorGroup = groups.find((row) => row.vendorId === vendorA);

  assert.equal(partyGroup.purchaseAmount, 30000);
  assert.equal(partyGroup.paidAmount, 12000);
  assert.equal(partyGroup.payableAmount, 18000);
  assert.equal(partyGroup.paymentStatus, "partial");
  assert.deepEqual(partyGroup.serviceTypes, ["hotel"]);
  assert.equal(vendorGroup.paymentStatus, "paid");
});

test("remaining purchase return eligibility deducts prior returns and refund recoveries", () => {
  assert.equal(
    calculateRemainingReturnAmount({
      purchaseAmount: 50000,
      priorVendorReturns: 12000,
      priorRefundRecovery: 8000,
    }),
    30000,
  );

  assert.equal(
    calculateRemainingReturnAmount({
      purchaseAmount: 50000,
      priorVendorReturns: 40000,
      priorRefundRecovery: 15000,
    }),
    0,
  );
});
