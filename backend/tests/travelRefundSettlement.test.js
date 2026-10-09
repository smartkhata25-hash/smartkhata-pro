const test = require("node:test");
const assert = require("node:assert/strict");

const {
  _test: { getRefundVendorGroups, getSettlementLimit, identityKey },
} = require("../services/travel/travelRefundSettlementService");

const vendorA = "64f000000000000000000001";
const vendorB = "64f000000000000000000002";
const partyA = "64f000000000000000000003";

test("refund settlement limit is capped by both source outstanding and counterparty credit", () => {
  assert.deepEqual(getSettlementLimit(1000, 250, 500), {
    outstanding: 750,
    safeMaximum: 500,
  });
  assert.deepEqual(getSettlementLimit(1000, 250, 900), {
    outstanding: 750,
    safeMaximum: 750,
  });
  assert.deepEqual(getSettlementLimit(1000, 1100, 900), {
    outstanding: 0,
    safeMaximum: 0,
  });
});

test("vendor recovery grouping separates normal vendors and parties and totals duplicate rows", () => {
  const groups = getRefundVendorGroups({
    refundItems: [
      { title: "Ticket A", vendorId: vendorA, vendorRecoveryAmount: 100 },
      { title: "Ticket B", vendorId: vendorA, vendorRecoveryAmount: 250 },
      { title: "Hotel", vendorId: vendorB, vendorRecoveryAmount: 400 },
      { title: "Transport", vendorType: "party", vendorPartyId: partyA, vendorRecoveryAmount: 300 },
      { title: "Ignored", vendorId: vendorB, vendorRecoveryAmount: 0 },
    ],
  });

  const byIdentity = new Map(groups.map((group) => [identityKey(group.entityType, group.entityId), group]));
  assert.equal(byIdentity.get(`vendor:${vendorA}`).amount, 350);
  assert.equal(byIdentity.get(`vendor:${vendorA}`).items.length, 2);
  assert.equal(byIdentity.get(`vendor:${vendorB}`).amount, 400);
  assert.equal(byIdentity.get(`party:${partyA}`).amount, 300);
});
