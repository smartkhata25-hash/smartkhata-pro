const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeUmrahDetails,
  optionalNonNegativeInteger,
} = require("../services/travel/travelBookingService");
const {
  resolveUmrahCityNights,
} = require("../services/travel/umrahStayNights");
const {
  buildTravelInvoicePrint,
} = require("../services/travel/travelPrintBuilder");

const printSetting = {
  travelInvoice: { header: {}, settings: {}, layout: {} },
};

const buildBooking = (umrahDetails) => ({
  serviceType: "umrah_package",
  bookingItems: [{ itemType: "umrah_package", title: "Umrah", umrahDetails }],
  travelers: [],
});

test("Umrah nights normalization accepts blank and whole non-negative values", () => {
  assert.equal(optionalNonNegativeInteger(""), null);
  assert.equal(optionalNonNegativeInteger(undefined), null);
  assert.equal(optionalNonNegativeInteger(0), 0);
  assert.equal(optionalNonNegativeInteger("3"), 3);
  assert.equal(normalizeUmrahDetails({ makkahNights: 3, madinahNights: 2 }).makkahNights, 3);
});

test("Umrah nights normalization rejects negative, decimal, and non-number values", () => {
  [-1, 2.5, "abc"].forEach((value) => {
    assert.throws(
      () => optionalNonNegativeInteger(value, "Makkah nights"),
      /non-negative whole number/,
    );
  });
});

test("legacy resolver uses components before pricing summary", () => {
  const details = {
    components: [
      { componentType: "hotel", hotelPricing: { city: "makkah", nights: 3 } },
    ],
    pricingSummary: { hotels: { makkah: { totalNights: 9 }, madinah: { nights: 2 } } },
  };
  assert.equal(resolveUmrahCityNights(details, "makkah"), 3);
  assert.equal(resolveUmrahCityNights(details, "madinah"), 2);
});

test("Travel print data shows explicit singular/plural nights and component nights", () => {
  const built = buildTravelInvoicePrint(
    buildBooking({
      makkahHotelId: { name: "Al Aseel" },
      madinahHotelId: { name: "Al Ansar" },
      makkahNights: 3,
      madinahNights: 1,
      components: [{
        componentType: "hotel",
        label: "Makkah Hotel",
        hotelId: { name: "Al Aseel" },
        hotelPricing: { city: "makkah", nights: 3 },
      }],
    }),
    printSetting,
  );
  const details = built.items[0].details.join("\n");
  assert.match(details, /Makkah - Al Aseel - 3 Nights/);
  assert.match(details, /Madinah - Al Ansar - 1 Night/);
  assert.match(details, /Makkah Hotel - Al Aseel - 3 Nights/);
  assert.doesNotMatch(details, /1 Nights/);
});

test("Travel print data resolves old component nights and omits unknown or zero suffixes", () => {
  const legacy = buildTravelInvoicePrint(
    buildBooking({
      makkahHotelId: { name: "Legacy Makkah" },
      madinahHotelId: { name: "Legacy Madinah" },
      components: [
        { componentType: "hotel", hotelPricing: { city: "makkah", nights: 3 } },
        { componentType: "hotel", hotelPricing: { city: "madinah", nights: 2 } },
      ],
    }),
    printSetting,
  );
  const legacyDetails = legacy.items[0].details.join("\n");
  assert.match(legacyDetails, /Makkah - Legacy Makkah - 3 Nights/);
  assert.match(legacyDetails, /Madinah - Legacy Madinah - 2 Nights/);

  const unknown = buildTravelInvoicePrint(
    buildBooking({ makkahHotelId: { name: "Hotel Only" }, makkahNights: null }),
    printSetting,
  ).items[0].details.join("\n");
  assert.match(unknown, /Makkah - Hotel Only/);
  assert.doesNotMatch(unknown, /0 Nights/);
});
