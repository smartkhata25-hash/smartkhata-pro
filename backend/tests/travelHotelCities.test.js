const test = require("node:test");
const assert = require("node:assert/strict");

const TravelCity = require("../models/TravelCity");
const TravelBooking = require("../models/TravelBooking");
const cityController = require("../controllers/travel/travelCityController");
const { normalizeBookingItem } = require("../services/travel/travelBookingService");
const { buildTravelInvoicePrint } = require("../services/travel/travelPrintBuilder");

const id = (suffix) => `64f0000000000000000000${suffix}`;

test("Travel City normalizes case/spacing identity per user", async () => {
  const city = new TravelCity({ userId: id("01"), name: "  MakKah   City  " });
  await city.validate();
  assert.equal(city.name, "MakKah City");
  assert.equal(city.normalizedName, "makkah city");
  const uniqueIndex = TravelCity.schema.indexes().find(([fields]) => fields.userId === 1 && fields.normalizedName === 1);
  assert.equal(uniqueIndex[1].unique, true);
});

test("default City bootstrap is idempotent and contains the starter list", async () => {
  const originalCount = TravelCity.countDocuments;
  const originalInsert = TravelCity.insertMany;
  let count = 0;
  const inserted = [];
  TravelCity.countDocuments = async () => count;
  TravelCity.insertMany = async (documents) => {
    inserted.push(...documents);
    count += documents.length;
    return documents;
  };
  try {
    await cityController.ensureDefaultTravelCities(id("01"));
    await cityController.ensureDefaultTravelCities(id("01"));
    assert.deepEqual(inserted.map((city) => city.name), ["Makkah", "Madinah", "Jeddah", "Taif"]);
  } finally {
    TravelCity.countDocuments = originalCount;
    TravelCity.insertMany = originalInsert;
  }
});

test("normalized duplicate City creation reuses the existing record", async () => {
  const originalFindOne = TravelCity.findOne;
  const originalCreate = TravelCity.create;
  const existing = { _id: id("21"), name: "Makkah", normalizedName: "makkah", isActive: true, isDeleted: false };
  let createCalls = 0;
  TravelCity.findOne = async (query) => {
    assert.equal(query.normalizedName, "makkah");
    return existing;
  };
  TravelCity.create = async () => { createCalls += 1; };
  let responseBody;
  const res = {
    json(body) { responseBody = body; return body; },
    status() { return this; },
  };
  try {
    await cityController.createTravelCity(
      { user: { id: id("01") }, body: { name: "  makKAH  " } },
      res,
    );
    assert.equal(responseBody, existing);
    assert.equal(createCalls, 0);
  } finally {
    TravelCity.findOne = originalFindOne;
    TravelCity.create = originalCreate;
  }
});

test("Hotel booking normalization and schema round trip preserve separate City snapshots", () => {
  const rawItems = [
    { itemType: "hotel", vendorId: id("11"), hotelDetails: { city: "Makkah", nights: 5, confirmationNumber: "A1" } },
    { itemType: "hotel", vendorId: id("12"), hotelDetails: { city: "Madinah", nights: 4 } },
    { itemType: "hotel", vendorId: id("13"), hotelDetails: { city: "Jeddah", nights: 2 } },
  ];
  const normalized = rawItems.map((item) => normalizeBookingItem(item, "mixed"));
  assert.deepEqual(normalized.map((item) => item.hotelDetails.city), ["Makkah", "Madinah", "Jeddah"]);

  const document = new TravelBooking({ bookingNumber: "HOTELS-1", serviceType: "mixed", bookingItems: normalized });
  const reloaded = TravelBooking.hydrate(document.toObject());
  assert.deepEqual(reloaded.bookingItems.map((item) => item.hotelDetails.city), ["Makkah", "Madinah", "Jeddah"]);
  assert.deepEqual(reloaded.bookingItems.map((item) => String(item.vendorId)), [id("11"), id("12"), id("13")]);
});

test("shared print data contains every Hotel, City, nights and only nonblank confirmation", () => {
  const booking = {
    serviceType: "mixed",
    bookingItems: [
      { itemType: "hotel", hotelDetails: { city: "Makkah", hotelId: { name: "Hotel A", city: "Legacy" }, nights: 5, confirmationNumber: "A1" } },
      { itemType: "hotel", hotelDetails: { city: "Madinah", hotelId: { name: "Hotel B", city: "Madinah" }, nights: 4, confirmationNumber: "" } },
      { itemType: "hotel", hotelDetails: { hotelId: { name: "Hotel C", city: "Jeddah" }, nights: 1 } },
    ],
  };
  const print = buildTravelInvoicePrint(booking, { travelInvoice: { header: {}, settings: {}, layout: {} } });
  assert.equal(print.items.length, 3);
  assert.match(print.items[0].details.join("\n"), /Makkah.*Hotel A.*5 Nights/);
  assert.match(print.items[0].details.join("\n"), /Confirmation.*A1/);
  assert.match(print.items[1].details.join("\n"), /Madinah.*Hotel B.*4 Nights/);
  assert.doesNotMatch(print.items[1].details.join("\n"), /Confirmation/);
  assert.match(print.items[2].details.join("\n"), /Jeddah.*Hotel C.*1 Night/);
});
