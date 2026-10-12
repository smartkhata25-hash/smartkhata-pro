const test = require("node:test");
const assert = require("node:assert/strict");

const { buildTravelInvoicePrint } = require("../services/travel/travelPrintBuilder");
const { renderTravelInvoiceHtml } = require("../templates/travelInvoiceTemplate");

const printSetting = {
  travelInvoice: { header: {}, settings: {}, layout: {} },
};

const buildInvoice = (overrides = {}) =>
  buildTravelInvoicePrint(
    {
      bookingNumber: "TRV-PRINT-1",
      customer: { name: "Customer" },
      baseCurrency: "PKR",
      sellingTotal: 0,
      netSale: 0,
      bookingItems: [],
      ...overrides,
    },
    printSetting,
  );

test("customer-facing service details remove only a complete generated currency summary", () => {
  const description = [
    "Customer requested a wheelchair and quoted SAR 250 manually.",
    "Total SAR: SAR 500",
    "Total Base: PKR 38,000",
    "Total USD: USD 133.33",
  ].join("\n");
  const bookingItem = {
    itemType: "umrah_package",
    title: "Umrah Package",
    description,
    sellingPrice: 500,
    sellingCurrency: "SAR",
    estimatedSellingBase: 38000,
  };
  const built = buildInvoice({ bookingItems: [bookingItem] });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Customer requested a wheelchair and quoted SAR 250 manually/);
  assert.doesNotMatch(details, /Total SAR|Total Base|Total USD/);
  assert.equal(bookingItem.description, description);

  const historical = buildInvoice({
    bookingItems: [{
      itemType: "umrah_package",
      description: "Keep USD reference | Total SAR: SAR 500 | Total Base: PKR 38,000 | Total USD: USD 133.33",
      sellingPrice: 500,
    }],
  });
  assert.equal(historical.items[0].details.at(-1), "Keep USD reference");

  const manualOnly = buildInvoice({
    bookingItems: [{
      itemType: "service",
      description: "Total SAR: SAR 500\nCustomer approved USD 133.33",
      sellingPrice: 500,
    }],
  });
  assert.match(manualOnly.items[0].details.join("\n"), /Total SAR: SAR 500/);
  assert.match(manualOnly.items[0].details.join("\n"), /Customer approved USD 133\.33/);
});

test("traveler names stay in the top table while ticket facts and different passengers remain", () => {
  const travelerId = "64f000000000000000000001";
  const built = buildInvoice({
    travelers: [{ _id: travelerId, fullName: "Muhammad Arshad", passportNumber: "PAK-1" }],
    bookingItems: [{
      itemType: "air_ticket",
      title: "Air Ticket",
      travelerIds: [travelerId],
      sellingPrice: 100,
      ticketDetails: {
        passengerTickets: [
          {
            travelerId: { _id: travelerId, fullName: "Muhammad Arshad" },
            passengerName: "Muhammad Arshad",
            passportNumber: "PAK-1",
            pnr: "ABC123",
            ticketNumber: "ET-1",
          },
          {
            passengerName: "Guest Passenger",
            passportNumber: "PAK-2",
            pnr: "XYZ789",
            ticketNumber: "ET-2",
          },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");
  const html = renderTravelInvoiceHtml(built);

  assert.doesNotMatch(details, /Travelers: Muhammad Arshad/);
  assert.doesNotMatch(details, /Muhammad Arshad/);
  assert.match(details, /PAK-1 - ABC123 - ET-1/);
  assert.match(details, /Guest Passenger - PAK-2 - XYZ789 - ET-2/);
  assert.equal((html.match(/Muhammad Arshad/g) || []).length, 1);
});

test("traveler names remain in service details when no top traveler table exists", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "visit_visa",
      travelerIds: [{ fullName: "Walk-in Traveler" }],
      sellingPrice: 100,
      visaDetails: {
        travelerVisas: [{ passengerName: "Walk-in Traveler", reference: "VISA-1" }],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Travelers: Walk-in Traveler/);
  assert.match(details, /Walk-in Traveler - VISA-1/);
});

test("a different traveler with the same name is not hidden when IDs differ", () => {
  const topTravelerId = "64f000000000000000000001";
  const differentTravelerId = "64f000000000000000000002";
  const built = buildInvoice({
    travelers: [{ _id: topTravelerId, fullName: "Same Name" }],
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 100,
      ticketDetails: {
        passengerTickets: [{
          travelerId: { _id: differentTravelerId, fullName: "Same Name" },
          passengerName: "Same Name",
          pnr: "DIFFERENT-PNR",
        }],
      },
    }],
  });

  assert.match(built.items[0].details.join("\n"), /Same Name - DIFFERENT-PNR/);
});

test("Air Ticket prints saved shared baggage and omits an empty baggage line", () => {
  const built = buildInvoice({
    bookingItems: [
      {
        itemType: "air_ticket",
        sellingPrice: 100,
        ticketDetails: { baggage: "  30   KG  " },
      },
      {
        itemType: "air_ticket",
        sellingPrice: 100,
        ticketDetails: { baggage: "   " },
      },
    ],
  });

  assert.match(built.items[0].details.join("\n"), /Baggage: 30 KG/);
  assert.doesNotMatch(built.items[1].details.join("\n"), /Baggage/);
});

test("identical passenger baggage collapses to one line without traveler duplication", () => {
  const travelerA = "64f000000000000000000011";
  const travelerB = "64f000000000000000000012";
  const built = buildInvoice({
    travelers: [
      { _id: travelerA, fullName: "Traveler One" },
      { _id: travelerB, fullName: "Traveler Two" },
    ],
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 200,
      ticketDetails: {
        passengerTickets: [
          { travelerId: { _id: travelerA, fullName: "Traveler One" }, baggage: "30 KG" },
          { travelerId: { _id: travelerB, fullName: "Traveler Two" }, baggage: "30 KG" },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Baggage: 30 KG/);
  assert.doesNotMatch(details, /Baggage \(/);
  assert.doesNotMatch(details, /Traveler One|Traveler Two/);
});

test("different passenger baggage stays associated with the correct traveler", () => {
  const travelerA = "64f000000000000000000021";
  const travelerB = "64f000000000000000000022";
  const built = buildInvoice({
    travelers: [
      { _id: travelerA, fullName: "Traveler One" },
      { _id: travelerB, fullName: "Traveler Two" },
    ],
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 200,
      ticketDetails: {
        passengerTickets: [
          {
            travelerId: { _id: travelerA, fullName: "Traveler One" },
            passengerName: "Traveler One",
            pnr: "PNR-ONE",
            baggage: "20 KG",
          },
          {
            travelerId: { _id: travelerB, fullName: "Traveler Two" },
            passengerName: "Traveler Two",
            pnr: "PNR-TWO",
            baggage: "30 KG",
          },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Baggage \(Traveler One\): 20 KG/);
  assert.match(details, /Baggage \(Traveler Two\): 30 KG/);
  assert.equal((details.match(/Traveler One/g) || []).length, 1);
  assert.equal((details.match(/Traveler Two/g) || []).length, 1);
});

test("Pax x Rate groups identical authoritative rates and keeps the service amount unchanged", () => {
  const built = buildInvoice({
    sellingTotal: 45600,
    netSale: 45600,
    bookingItems: [{
      itemType: "umrah_package",
      title: "Umrah Package",
      sellingCurrency: "SAR",
      sellingPrice: 500,
      estimatedSellingBase: 45600,
      paxPricing: [
        { paxType: "adult", count: 2, sellingPrice: 100, estimatedSellingBase: 18240 },
        { paxType: "child", count: 1, sellingPrice: 100, estimatedSellingBase: 9120 },
        { paxType: "infant", count: 1, sellingPrice: 200, estimatedSellingBase: 18240 },
      ],
    }],
  });

  assert.deepEqual(built.items[0].paxRateLines, ["3 × SAR 100", "1 × SAR 200"]);
  assert.equal(built.items[0].amount, "PKR 45,600");

  const html = renderTravelInvoiceHtml(built);
  assert.match(html, /Pax &times; Rate/);
  assert.ok(html.indexOf("Pax &times; Rate") < html.indexOf(">Amount<"));
  assert.match(html, /3 × SAR 100/);
  assert.match(html, /PKR 45,600/);
});

test("round-trip Air Ticket shows saved flight facts and keeps financial internals out", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "air_ticket",
      title: "Air Ticket",
      sellingPrice: 100,
      ticketDetails: {
        journeyType: "round_trip",
        airline: "PIA",
        origin: "LHE",
        destination: "JED",
        departureDateTime: "2026-10-20T10:30:00+05:00",
        returnOrigin: "JED",
        returnDestination: "LHE",
        returnDateTime: "2026-11-05T08:00:00+05:00",
        travelClass: "Economy",
        pnr: "ABC123",
        ticketNumber: "ET-100",
        baggage: "40 KG",
        taxes: 999,
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Airline: PIA/);
  assert.match(details, /Route: LHE to JED/);
  assert.match(details, /Departure: 20\/10\/2026, 10:30 AM/);
  assert.match(details, /Return Route: JED to LHE/);
  assert.match(details, /Return: 05\/11\/2026, 8:00 AM/);
  assert.match(details, /Class: Economy/);
  assert.match(details, /PNR: ABC123/);
  assert.match(details, /Ticket Number: ET-100/);
  assert.match(details, /Baggage: 40 KG/);
  assert.doesNotMatch(details, /999|Tax/i);
});

test("one-way Air Ticket never prints stale return fields", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 100,
      ticketDetails: {
        journeyType: "one_way",
        origin: "LHE",
        destination: "JED",
        returnOrigin: "JED",
        returnDestination: "LHE",
        returnDateTime: "2026-11-05T08:00:00+05:00",
        passengerTickets: [{
          returnOrigin: "JED",
          returnDestination: "LHE",
          returnDateTime: "2026-11-06T08:00:00+05:00",
        }],
      },
    }],
  });

  assert.match(built.items[0].details.join("\n"), /Route: LHE to JED/);
  assert.doesNotMatch(built.items[0].details.join("\n"), /Return/);
});

test("passenger-specific flight differences are labeled without repeating shared facts", () => {
  const built = buildInvoice({
    travelers: [{ _id: "64f000000000000000000031", fullName: "Top Traveler" }],
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 200,
      ticketDetails: {
        airline: "PIA",
        origin: "LHE",
        destination: "JED",
        passengerTickets: [
          {
            travelerId: { _id: "64f000000000000000000031", fullName: "Top Traveler" },
            passengerName: "Top Traveler",
            airline: "PIA",
            origin: "LHE",
            destination: "JED",
            pnr: "SAME-1",
          },
          {
            passengerName: "Guest Traveler",
            airline: "Saudia",
            origin: "ISB",
            destination: "MED",
            travelClass: "Business",
            pnr: "DIFF-2",
          },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.equal((details.match(/Airline: PIA/g) || []).length, 1);
  assert.doesNotMatch(details, /Flight \(Passenger 1\)/);
  assert.match(details, /Flight \(Guest Traveler\): Airline: Saudia, Route: ISB to MED, Class: Business/);
  assert.equal((renderTravelInvoiceHtml(built).match(/Top Traveler/g) || []).length, 1);
});

test("identical passenger-specific flight facts collapse to one associated line", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "air_ticket",
      sellingPrice: 0,
      ticketDetails: {
        passengerTickets: [
          { airline: "PIA", origin: "LHE", destination: "JED" },
          { airline: "PIA", origin: "LHE", destination: "JED" },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.equal((details.match(/Airline: PIA/g) || []).length, 1);
  assert.match(details, /Flight \(Passengers 1, 2\): Airline: PIA, Route: LHE to JED/);
});

test("Hotel shows saved stay, room and confirmation facts without rates or costs", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "hotel",
      sellingPrice: 400,
      hotelDetails: {
        hotelId: { name: "Makkah Hilton", city: "Makkah" },
        checkIn: "2026-10-20",
        checkOut: "2026-10-25",
        nights: 5,
        roomPricing: [{
          roomType: "double",
          occupancy: 2,
          quantity: 2,
          costPrice: 500,
          sellingPrice: 700,
        }],
        confirmationNumber: "HT12345",
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Hotel: Makkah Hilton/);
  assert.match(details, /City: Makkah/);
  assert.match(details, /Check-in: 20\/10\/2026/);
  assert.match(details, /Check-out: 25\/10\/2026/);
  assert.match(details, /Stay: 5 Nights/);
  assert.match(details, /Room Type: Double - Rooms: 2 - Occupancy: 2/);
  assert.match(details, /Confirmation: HT12345/);
  assert.doesNotMatch(details, /500|700|Cost|Rate|Price/);
});

test("Hotel omits empty, invalid and unintentional default values", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "hotel",
      sellingPrice: 0,
      hotelDetails: {
        hotelId: "64f000000000000000000099",
        checkIn: "not-a-date",
        rooms: 1,
        adults: 1,
        children: 0,
      },
    }],
  });

  assert.deepEqual(built.items[0].details, []);
});

test("complete vendor Umrah package shows saved package, hotels and nights only", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "umrah_package",
      sellingPrice: 1000,
      umrahDetails: {
        packageMode: "complete_vendor_package",
        packageName: "Ramadan 14 Nights",
        departureDate: "2026-02-10",
        returnDate: "2026-02-24",
        makkahHotelId: { name: "Clock Tower Hotel" },
        madinahHotelId: { name: "Madinah View" },
        makkahNights: 8,
        madinahNights: 6,
        pricingSummary: { SAR: 5000, rate: 76 },
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Package: Ramadan 14 Nights/);
  assert.match(details, /Makkah Hotel: Clock Tower Hotel/);
  assert.match(details, /Makkah Stay: 8 Nights/);
  assert.match(details, /Madinah Hotel: Madinah View/);
  assert.match(details, /Madinah Stay: 6 Nights/);
  assert.doesNotMatch(details, /5000|76|Pricing|SAR/);
});

test("custom Umrah components expose only customer-facing labels, rooms and cleaned notes", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "umrah_package",
      sellingPrice: 1000,
      umrahDetails: {
        packageMode: "custom_component_package",
        components: [
          {
            componentType: "hotel",
            label: "Makkah stay",
            hotelId: { name: "Safwah", city: "makkah" },
            hotelPricing: {
              city: "makkah",
              checkIn: "2026-03-01",
              checkOut: "2026-03-06",
              nights: 5,
              roomPricing: [{ roomType: "triple", quantity: 2, occupancy: 3 }],
              normalRate: 900,
            },
            notes: "Breakfast included",
            costPrice: 2000,
          },
          {
            componentType: "transport",
            label: "Airport transfers",
            notes: "Private vehicle\nTotal SAR: SAR 500\nTotal Base: PKR 38,000\nTotal USD: USD 133.33",
            sellingPrice: 500,
          },
        ],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Makkah Hotel: Safwah/);
  assert.match(details, /Makkah Check-in: 01\/03\/2026/);
  assert.match(details, /Makkah Check-out: 06\/03\/2026/);
  assert.match(details, /Makkah Room Type: Triple - Rooms: 2 - Occupancy: 3/);
  assert.match(details, /Included Transport: Airport transfers/);
  assert.match(details, /Component Notes \(Makkah stay\): Breakfast included/);
  assert.match(details, /Component Notes \(Airport transfers\): Private vehicle/);
  assert.doesNotMatch(details, /Total SAR|Total Base|Total USD|2000|900/);
});

test("Umrah planner supplies only explicitly saved stay dates", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "umrah_package",
      sellingPrice: 0,
      umrahDetails: {
        makkahNights: 3,
        plannerInfo: {
          itinerary: [{
            type: "stay",
            city: "makkah",
            isoCheckIn: "2026-04-01",
            isoCheckOutDay: "2026-04-04",
          }],
        },
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Makkah Check-in: 01\/04\/2026/);
  assert.match(details, /Makkah Check-out: 04\/04\/2026/);
  assert.match(details, /Makkah Stay: 3 Nights/);
  assert.doesNotMatch(details, /Madinah/);
});

test("Visit Visa shows saved references but never fee fields", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "visit_visa",
      sellingPrice: 0,
      visaDetails: {
        country: "Saudi Arabia",
        visaType: "Visit",
        duration: "90 Days",
        passportNumber: "PAK-100",
        reference: "VISA-REF",
        governmentFee: 300,
        serviceFee: 50,
        travelerVisas: [{ passengerName: "Guest", reference: "GUEST-REF" }],
      },
    }],
  });
  const details = built.items[0].details.join("\n");

  assert.match(details, /Country: Saudi Arabia/);
  assert.match(details, /Visa Type: Visit/);
  assert.match(details, /Duration: 90 Days/);
  assert.match(details, /Passport: PAK-100/);
  assert.match(details, /Reference: VISA-REF/);
  assert.match(details, /Passenger Visa: Guest - GUEST-REF/);
  assert.doesNotMatch(details, /300|50|Fee/);
});

test("Transport and generic services preserve their saved customer-facing information", () => {
  const built = buildInvoice({
    bookingItems: [
      {
        itemType: "transport",
        title: "Airport Transfer",
        description: "Driver will hold a name board",
        sellingPrice: 0,
        transportDetails: {
          pickup: "Jeddah Airport",
          dropoff: "Makkah Hotel",
          dateTime: "2026-10-20T14:15:00+05:00",
          vehicleType: "Hiace",
        },
      },
      {
        itemType: "insurance",
        title: "Travel Insurance",
        description: "Worldwide medical cover",
        sellingPrice: 0,
      },
    ],
  });
  const transport = built.items[0].details.join("\n");

  assert.match(transport, /Route: Jeddah Airport to Makkah Hotel/);
  assert.match(transport, /Date\/Time: 20\/10\/2026, 2:15 PM/);
  assert.match(transport, /Vehicle: Hiace/);
  assert.match(transport, /Driver will hold a name board/);
  assert.equal(built.items[1].title, "Travel Insurance");
  assert.deepEqual(built.items[1].details, ["Worldwide medical cover"]);
});

test("duplicate descriptions collapse and user text remains HTML escaped in the template", () => {
  const built = buildInvoice({
    bookingItems: [{
      itemType: "transport",
      title: "<script>bad()</script>",
      description: "Route: A to B\n<script>alert(1)</script>\nRoute: A to B",
      sellingPrice: 0,
      transportDetails: { pickup: "A", dropoff: "B" },
    }],
  });
  const details = built.items[0].details;
  const html = renderTravelInvoiceHtml(built);

  assert.equal(details.filter((line) => line === "Route: A to B").length, 1);
  assert.doesNotMatch(html, /<script>bad\(\)<\/script>|<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.match(html, /overflow-wrap: anywhere/);
});

test("historical sparse mixed-service invoices render without placeholder detail lines", () => {
  const built = buildInvoice({
    bookingItems: [
      { itemType: "air_ticket", sellingPrice: 1 },
      { itemType: "hotel", sellingPrice: 2, hotelDetails: null },
      { itemType: "visit_visa", sellingPrice: 3, visaDetails: {} },
      { itemType: "other", title: "Manual Service", sellingPrice: 4 },
    ],
  });
  const html = renderTravelInvoiceHtml(built);

  assert.deepEqual(built.items.map((item) => item.details), [[], [], [], []]);
  assert.doesNotMatch(html, /undefined|null|NaN|Invalid Date/);
  assert.match(html, /Manual Service/);
});

// Complete service-detail coverage is kept together below.

test("Pax x Rate uses an em dash when authoritative rows are absent or do not reconcile", () => {
  const built = buildInvoice({
    bookingItems: [
      { itemType: "hotel", sellingPrice: 25000, sellingCurrency: "PKR" },
      {
        itemType: "air_ticket",
        sellingPrice: 500,
        sellingCurrency: "SAR",
        estimatedSellingBase: 45600,
        paxPricing: [
          { paxType: "adult", count: 2, sellingPrice: 100, estimatedSellingBase: 18240 },
        ],
      },
    ],
  });

  assert.deepEqual(built.items[0].paxRateLines, ["—"]);
  assert.deepEqual(built.items[1].paxRateLines, ["—"]);
});
