const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeBookingItem,
  normalizeObjectIdSequence,
} = require("../services/travel/travelBookingService");
const { buildTravelInvoicePrint } = require("../services/travel/travelPrintBuilder");
const TravelBooking = require("../models/TravelBooking");

const travelerA = "64f000000000000000000001";
const travelerB = "64f000000000000000000002";

test("item traveler normalization preserves duplicate order and still rejects invalid IDs", () => {
  assert.deepEqual(normalizeObjectIdSequence([travelerA, travelerA, travelerB], "traveler ID"), [
    travelerA, travelerA, travelerB,
  ]);
  assert.throws(() => normalizeObjectIdSequence(["invalid"], "traveler ID"), /Invalid traveler ID/);
});

test("air ticket and visa normalization retain duplicate occurrence detail rows", () => {
  const ticket = normalizeBookingItem({
    itemType: "air_ticket",
    travelerIds: [travelerA, travelerA],
    ticketDetails: {
      passengerTickets: [
        { travelerId: travelerA, pnr: "FIRST", ticketNumber: "T1" },
        { travelerId: travelerA, pnr: "SECOND", ticketNumber: "T2" },
      ],
    },
  }, "air_ticket");
  const visa = normalizeBookingItem({
    itemType: "visit_visa",
    travelerIds: [travelerA, travelerA],
    visaDetails: {
      travelerVisas: [
        { travelerId: travelerA, passportNumber: "P1", reference: "V1" },
        { travelerId: travelerA, passportNumber: "P2", reference: "V2" },
      ],
    },
  }, "visit_visa");

  assert.deepEqual(ticket.travelerIds, [travelerA, travelerA]);
  assert.deepEqual(ticket.ticketDetails.passengerTickets.map((row) => row.pnr), ["FIRST", "SECOND"]);
  assert.deepEqual(visa.travelerIds, [travelerA, travelerA]);
  assert.deepEqual(visa.visaDetails.travelerVisas.map((row) => row.reference), ["V1", "V2"]);
});

test("nested occurrence rows can supply repeated item traveler IDs without being collapsed", () => {
  const ticket = normalizeBookingItem({
    itemType: "air_ticket",
    travelerIds: [],
    ticketDetails: {
      passengerTickets: [{ travelerId: travelerA }, { travelerId: travelerA }],
    },
  }, "air_ticket");
  assert.deepEqual(ticket.travelerIds, [travelerA, travelerA]);
});

test("TravelBooking schema serialization and hydration preserve repeated item occurrences", () => {
  const document = new TravelBooking({
    bookingNumber: "TRV-DUP-1",
    serviceType: "air_ticket",
    bookingItems: [{
      itemType: "air_ticket",
      travelerIds: [travelerA, travelerA, travelerB],
      ticketDetails: {
        passengerTickets: [
          { travelerId: travelerA, pnr: "FIRST" },
          { travelerId: travelerA, pnr: "SECOND" },
          { travelerId: travelerB, pnr: "THIRD" },
        ],
      },
    }],
  });
  const reloaded = TravelBooking.hydrate(document.toObject());

  assert.deepEqual(
    reloaded.bookingItems[0].travelerIds.map(String),
    [travelerA, travelerA, travelerB],
  );
  assert.deepEqual(
    reloaded.bookingItems[0].ticketDetails.passengerTickets.map((row) => row.pnr),
    ["FIRST", "SECOND", "THIRD"],
  );
});

test("travel print preserves duplicate traveler names and both passenger rows", () => {
  const print = buildTravelInvoicePrint({
    serviceType: "air_ticket",
    travelers: [{ _id: travelerA, fullName: "Muhammad Arshad" }],
    bookingItems: [{
      itemType: "air_ticket",
      title: "Ticket",
      travelerIds: [travelerA, travelerA],
      ticketDetails: {
        passengerTickets: [
          { travelerId: { _id: travelerA, fullName: "Muhammad Arshad" }, passengerName: "Muhammad Arshad", pnr: "FIRST", ticketNumber: "T1" },
          { travelerId: { _id: travelerA, fullName: "Muhammad Arshad" }, passengerName: "Muhammad Arshad", pnr: "SECOND", ticketNumber: "T2" },
        ],
      },
    }],
  }, { travelInvoice: { header: {}, settings: {}, layout: {} } });
  const details = print.items[0].details.join("\n");
  assert.match(details, /Muhammad Arshad, Muhammad Arshad/);
  assert.match(details, /FIRST/);
  assert.match(details, /SECOND/);
});
