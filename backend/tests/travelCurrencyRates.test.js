const test = require("node:test");
const assert = require("node:assert/strict");

const TravelBooking = require("../models/TravelBooking");
const TravelCurrencySetting = require("../models/TravelCurrencySetting");
const currencyController = require("../controllers/travelCurrencyController");
const bookingService = require("../services/travel/travelBookingService");
const accountingService = require("../services/travel/travelInvoiceAccountingService");

const { normalizeRates, validateRates } = currencyController._test;
const {
  applyEstimatedTotals,
  assertRequiredCurrencyRates,
  deriveHistoricalCurrencyRates,
  normalizeCurrencyRateSnapshot,
  resolveBookingCurrencySettings,
} = bookingService._test;

const settings = (cost = 74, sale = 76) => ({
  baseCurrency: "PKR",
  costRates: new Map([["PKR", 1], ["SAR", cost], ["USD", 278], ["AED", 75]]),
  saleRates: new Map([["PKR", 1], ["SAR", sale], ["USD", 281], ["AED", 77]]),
});

const hotelItem = ({ cost = 1200, sale = 2400 } = {}) => ({
  itemType: "hotel",
  costPrice: cost,
  sellingPrice: sale,
  costCurrency: "SAR",
  sellingCurrency: "SAR",
  hotelDetails: { roomPricing: [] },
  paxPricing: [],
  travelerIds: [],
  umrahDetails: { components: [] },
});

test("legacy settings rateToBase resolves to equal Cost and Sale rates", () => {
  const rows = normalizeRates([{ currency: "sar", rateToBase: 75 }]);
  const sar = rows.find((row) => row.currency === "SAR");
  assert.equal(sar.costRateToBase, 75);
  assert.equal(sar.saleRateToBase, 75);
});

test("settings validation rejects malformed, negative and duplicate rates", () => {
  assert.throws(() => validateRates([{ currency: "SAR", costRateToBase: "bad", saleRateToBase: 76 }]));
  assert.throws(() => validateRates([{ currency: "SAR", costRateToBase: -1, saleRateToBase: 76 }]));
  assert.throws(() => validateRates([
    { currency: "SAR", costRateToBase: 74, saleRateToBase: 76 },
    { currency: "sar", costRateToBase: 74, saleRateToBase: 76 },
  ]));
});

test("focused default update changes only the requested currency side", async () => {
  const originalUpdateOne = TravelCurrencySetting.updateOne;
  const originalFindOneAndUpdate = TravelCurrencySetting.findOneAndUpdate;
  let focusedUpdate;
  TravelCurrencySetting.updateOne = async () => ({ acknowledged: true });
  TravelCurrencySetting.findOneAndUpdate = (query, update) => {
    focusedUpdate = update;
    return {
      lean: async () => ({
        rates: [
          { currency: "SAR", costRateToBase: 73.5, saleRateToBase: 76 },
          { currency: "USD", costRateToBase: 278, saleRateToBase: 281 },
        ],
      }),
    };
  };
  const response = { status: () => response, json: (value) => value };
  try {
    const result = await currencyController.updateTravelCurrencyRate(
      { user: { id: "user-1" }, params: { currency: "SAR" }, body: { side: "cost", rateToBase: 73.5 } },
      response,
    );
    assert.deepEqual(focusedUpdate, { $set: { "rates.$.costRateToBase": 73.5 } });
    assert.equal(result.rates.find((row) => row.currency === "SAR").saleRateToBase, 76);
    assert.equal(result.rates.find((row) => row.currency === "USD").costRateToBase, 278);
  } finally {
    TravelCurrencySetting.updateOne = originalUpdateOne;
    TravelCurrencySetting.findOneAndUpdate = originalFindOneAndUpdate;
  }
});

test("booking schema supports a dual invoice rate snapshot", () => {
  const path = TravelBooking.schema.path("currencyRateSnapshot");
  assert.ok(path);
  const settingPath = TravelCurrencySetting.schema.path("rates").schema;
  assert.ok(settingPath.path("costRateToBase"));
  assert.ok(settingPath.path("saleRateToBase"));
});

test("Cost and Sale totals use their matching invoice rates", () => {
  const resolved = resolveBookingCurrencySettings({
    body: {
      currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 76 }],
    },
    existingBooking: null,
    savedSettings: settings(80, 82),
  });
  const totals = applyEstimatedTotals([hotelItem()], resolved);
  assert.equal(totals.costTotal, 88800);
  assert.equal(totals.sellingTotal, 182400);
  assert.equal(totals.bookingItems[0].estimatedCostBase, 88800);
  assert.equal(totals.bookingItems[0].estimatedSellingBase, 182400);
});

test("saved invoice snapshot wins after global settings change and one-side override is isolated", () => {
  const existingBooking = {
    currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 76 }],
    bookingItems: [hotelItem()],
  };
  const unchanged = resolveBookingCurrencySettings({
    body: {},
    existingBooking,
    savedSettings: settings(80, 82),
  });
  assert.deepEqual(unchanged.currencyRateSnapshot.find((row) => row.currency === "SAR"), {
    currency: "SAR",
    costRateToBase: 74,
    saleRateToBase: 76,
  });

  const overridden = resolveBookingCurrencySettings({
    body: {
      currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 78 }],
    },
    existingBooking,
    savedSettings: settings(80, 82),
  });
  const totals = applyEstimatedTotals([hotelItem()], overridden);
  assert.equal(totals.costTotal, 88800);
  assert.equal(totals.sellingTotal, 187200);
});

test("legacy invoice derives historical rates from stored source/base amounts", () => {
  const derived = deriveHistoricalCurrencyRates({
    bookingItems: [{
      ...hotelItem({ cost: 1000, sale: 1500 }),
      estimatedCostBase: 74000,
      estimatedSellingBase: 114000,
    }],
  }, "PKR");
  assert.equal(derived.get("SAR").costRateToBase, 74);
  assert.equal(derived.get("SAR").saleRateToBase, 76);
});

test("posting rejects a positive foreign amount with a missing matching-side rate", () => {
  const missingSale = {
    ...settings(74, 0),
    currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 0 }],
  };
  assert.throws(
    () => assertRequiredCurrencyRates([hotelItem()], missingSale, "confirmed"),
    /Sale conversion rate for SAR is not configured/,
  );
  assert.doesNotThrow(() => assertRequiredCurrencyRates([hotelItem({ sale: 0 })], missingSale, "confirmed"));
  assert.doesNotThrow(() => assertRequiredCurrencyRates([hotelItem()], missingSale, "draft"));
});

test("rate snapshot normalization rejects duplicates and forces base currency to one", () => {
  assert.throws(() => normalizeCurrencyRateSnapshot([
    { currency: "SAR", costRateToBase: 74, saleRateToBase: 76 },
    { currency: "sar", costRateToBase: 75, saleRateToBase: 77 },
  ], "PKR", { strict: true }));
  const normalized = normalizeCurrencyRateSnapshot([
    { currency: "PKR", costRateToBase: 9, saleRateToBase: 9 },
  ], "PKR", { strict: true });
  assert.equal(normalized.get("PKR").costRateToBase, 1);
  assert.equal(normalized.get("PKR").saleRateToBase, 1);
});

test("accounting financial snapshot changes when invoice conversion rates change", () => {
  const source = {
    baseCurrency: "PKR",
    currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 76 }],
    bookingItems: [],
  };
  const changed = {
    ...source,
    currencyRateSnapshot: [{ currency: "SAR", costRateToBase: 74, saleRateToBase: 78 }],
  };
  assert.equal(accountingService.hasAccountingChanges(source, source), false);
  assert.equal(accountingService.hasAccountingChanges(source, changed), true);
});

