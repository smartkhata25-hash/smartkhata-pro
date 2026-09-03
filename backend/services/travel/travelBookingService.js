const mongoose = require("mongoose");

const Account = require("../../models/Account");
const Customer = require("../../models/Customer");
const Supplier = require("../../models/Supplier");
const Traveler = require("../../models/Traveler");
const TravelBooking = require("../../models/TravelBooking");
const TravelCurrencySetting = require("../../models/TravelCurrencySetting");
const TravelHotel = require("../../models/TravelHotel");
const TravelService = require("../../models/TravelService");
const TravelAirline = require("../../models/TravelAirline");

const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
  getDefaultTravelCurrencyRates,
  isSupportedTravelCurrency,
  normalizeCurrencyCode,
} = require("../../config/travelConfig");

const {
  formatTravelInvoiceAttachments,
} = require("./travelInvoiceAttachmentService");

const {
  generateTemporaryBookingNumber,
  generateTravelInvoiceNumber,
} = require("./travelInvoiceNumberService");

const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../utils/moduleScope");
const {
  normalizeCustomerCounterpartyInput,
  normalizeVendorCounterpartyInput,
  buildTravelPartyRoleQuery,
} = require("./travelCounterpartyService");
const Party = require("../../models/Party");

const BOOKING_STATUSES = TravelBooking.TRAVEL_BOOKING_STATUSES;
const SERVICE_TYPES = TravelBooking.TRAVEL_BOOKING_SERVICE_TYPES;
const ITEM_TYPES = TravelBooking.TRAVEL_BOOKING_ITEM_TYPES;
const JOURNEY_TYPES = TravelBooking.JOURNEY_TYPES;
const UMRAH_PACKAGE_MODES = TravelBooking.UMRAH_PACKAGE_MODES;
const PAX_TYPES = TravelBooking.PAX_TYPES || ["adult", "child", "infant"];

const HOTEL_ROOM_TYPES = TravelBooking.HOTEL_ROOM_TYPES || [
  "single",
  "double",
  "twin",
  "triple",
  "quad",
  "quint",
  "5_sharing",
  "6_sharing",
  "7_sharing",
  "8_sharing",
  "family",
  "sharing",
  "custom",
];

const UMRAH_COMPONENT_TYPES = TravelBooking.UMRAH_COMPONENT_TYPES || [
  "air_ticket",
  "visit_visa",
  "hotel",
  "transport",
  "appointment",
  "token",
  "insurance",
  "service",
  "other",
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const PAYMENT_TYPES = new Set(["cash", "online", "cheque"]);

const PAYMENT_ACCOUNT_CATEGORIES = ["cash", "bank", "online", "cheque"];

const ROOM_OCCUPANCY_MAP = Object.freeze({
  single: 1,
  double: 2,
  twin: 2,
  triple: 3,
  quad: 4,
  quint: 5,
  "5_sharing": 5,
  "6_sharing": 6,
  "7_sharing": 7,
  "8_sharing": 8,
});

const getUserId = (req) => req.user?.id || req.userId;

const getActorId = (req) => req.actorId || req.user?.actorId || getUserId(req);

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({
      message: error.message,
    });
  }

  if (error?.name === "ValidationError" || error?.code === 11000) {
    return res.status(400).json({
      message: error.message,
    });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({
    message: fallbackMessage,
  });
};

const escapeRegex = (text = "") =>
  String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cleanString = (value = "") => String(value || "").trim();

const cleanUpperString = (value = "") => cleanString(value).toUpperCase();

const moneyNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return 0;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw createHttpError(400, "Prices cannot be negative");
  }

  return numericValue;
};

const nonNegativeInteger = (value, fallback = 0, label = "Quantity") => {
  if (value === "" || value === undefined || value === null) {
    return fallback;
  }

  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw createHttpError(400, `${label} cannot be negative`);
  }

  return Math.floor(numericValue);
};

const roundMoney = (value = 0) => Number(Number(value || 0).toFixed(2));

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw createHttpError(400, "Invalid request payload");
  }
};

const nullableDate = (value) => {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, "Invalid date");
  }

  return date;
};

const ensureObjectIdString = (value, label) => {
  if (!value) {
    return "";
  }

  const id = typeof value === "object" ? value._id || value.id : value;

  if (!mongoose.Types.ObjectId.isValid(String(id))) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return String(id);
};

const normalizeObjectIdArray = (values = [], label) => {
  const source = Array.isArray(values) ? values : [];
  const ids = [];

  source.forEach((value) => {
    const id = ensureObjectIdString(value, label);

    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  });

  return ids;
};

const normalizeCurrency = (value = DEFAULT_TRAVEL_CURRENCY) => {
  const currency = normalizeCurrencyCode(value) || DEFAULT_TRAVEL_CURRENCY;

  if (!isSupportedTravelCurrency(currency)) {
    throw createHttpError(400, "Unsupported travel currency");
  }

  return currency;
};

const normalizeStatus = (value = "draft") => {
  const status = cleanString(value || "draft").toLowerCase();

  if (!BOOKING_STATUSES.includes(status)) {
    throw createHttpError(400, "Invalid booking status");
  }

  return status;
};

const normalizeServiceType = (value = "mixed") => {
  const serviceType = cleanString(value || "mixed").toLowerCase();

  if (!SERVICE_TYPES.includes(serviceType)) {
    throw createHttpError(400, "Invalid booking service type");
  }

  return serviceType;
};

const normalizeItemType = (value = "service") => {
  const itemType = cleanString(value || "service").toLowerCase();

  if (!ITEM_TYPES.includes(itemType)) {
    throw createHttpError(400, "Invalid booking item type");
  }

  return itemType;
};

const normalizeJourneyType = (value = "one_way") => {
  const journeyType = cleanString(value || "one_way").toLowerCase();

  if (!JOURNEY_TYPES.includes(journeyType)) {
    throw createHttpError(400, "Invalid ticket journey type");
  }

  return journeyType;
};

const normalizePackageMode = (value = "complete_vendor_package") => {
  const packageMode = cleanString(
    value || "complete_vendor_package",
  ).toLowerCase();

  if (!UMRAH_PACKAGE_MODES.includes(packageMode)) {
    throw createHttpError(400, "Invalid Umrah package mode");
  }

  return packageMode;
};

const normalizePaymentType = (value = "cash") => {
  const clean = cleanString(value || "cash").toLowerCase();

  const paymentType = clean === "bank" ? "online" : clean;

  if (!PAYMENT_TYPES.has(paymentType)) {
    throw createHttpError(400, "Invalid payment type");
  }

  return paymentType;
};

const normalizeReminderSettings = (value, existingSettings = null) => {
  const source = parseJsonField(value, null);

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    if (existingSettings) {
      return existingSettings.toObject ? existingSettings.toObject() : existingSettings;
    }

    return {
      inheritBusinessDefaults: true,
      enabled: true,
      leadMinutes: 24 * 60,
      emailEnabled: false,
      whatsappEnabled: true,
    };
  }

  const leadMinutes = Number(source.leadMinutes);

  return {
    inheritBusinessDefaults: source.inheritBusinessDefaults !== false,
    enabled: source.enabled !== false,
    leadMinutes:
      Number.isFinite(leadMinutes) && leadMinutes >= 0
        ? Math.floor(leadMinutes)
        : 24 * 60,
    emailEnabled: source.emailEnabled === true,
    whatsappEnabled: source.whatsappEnabled !== false,
  };
};

const normalizePaxType = (value = "adult") => {
  const paxType = cleanString(value || "adult").toLowerCase();

  if (!PAX_TYPES.includes(paxType)) {
    throw createHttpError(400, "Invalid passenger type");
  }

  return paxType;
};

const normalizePaxPricing = (rows = []) => {
  if (!Array.isArray(rows)) {
    return [];
  }

  const seenTypes = new Set();

  return rows.map((row = {}) => {
    const paxType = normalizePaxType(row.paxType);

    if (seenTypes.has(paxType)) {
      throw createHttpError(400, `Duplicate ${paxType} passenger pricing row`);
    }

    seenTypes.add(paxType);

    return {
      paxType,
      count: nonNegativeInteger(row.count, 0, "Passenger count"),
      costPrice: moneyNumber(row.costPrice),
      sellingPrice: moneyNumber(row.sellingPrice),
    };
  });
};

const normalizeQuantityPricing = (pricing) => {
  if (pricing === undefined || pricing === null || pricing === "") {
    return null;
  }

  if (typeof pricing !== "object" || Array.isArray(pricing)) {
    throw createHttpError(400, "Invalid quantity pricing");
  }

  return {
    quantity: nonNegativeInteger(pricing.quantity, 0, "Quantity"),
    unitLabel: cleanString(pricing.unitLabel),
    costPrice: moneyNumber(pricing.costPrice),
    sellingPrice: moneyNumber(pricing.sellingPrice),
  };
};

const inferRoomOccupancy = (roomType, customRoomType, suppliedOccupancy) => {
  const explicitOccupancy = nonNegativeInteger(
    suppliedOccupancy,
    0,
    "Room occupancy",
  );

  if (explicitOccupancy > 0) {
    return explicitOccupancy;
  }

  const normalizedRoomType = cleanString(roomType).toLowerCase();

  if (ROOM_OCCUPANCY_MAP[normalizedRoomType]) {
    return ROOM_OCCUPANCY_MAP[normalizedRoomType];
  }

  const searchableText = `${normalizedRoomType} ${cleanString(
    customRoomType,
  ).toLowerCase()}`;

  const sharingMatch = searchableText.match(
    /(?:^|\s)(\d+)\s*(?:sharing|share|pax|person|persons|head|heads)(?:\s|$)/,
  );

  if (sharingMatch) {
    return Number(sharingMatch[1]);
  }

  return 0;
};

const normalizeHotelRoomPricing = (rows = []) => {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row = {}) => {
    const roomType = cleanString(row.roomType);

    if (!roomType) {
      throw createHttpError(400, "Hotel room type is required");
    }

    const normalizedRoomType = roomType.toLowerCase();

    const customRoomType =
      normalizedRoomType === "custom"
        ? cleanString(row.customRoomType)
        : cleanString(row.customRoomType);

    if (normalizedRoomType === "custom" && !customRoomType) {
      throw createHttpError(400, "Custom room type is required");
    }

    return {
      roomType,
      customRoomType,
      occupancy: inferRoomOccupancy(roomType, customRoomType, row.occupancy),
      quantity: nonNegativeInteger(row.quantity, 0, "Room quantity"),
      costPrice: moneyNumber(row.costPrice),
      sellingPrice: moneyNumber(row.sellingPrice),
    };
  });
};

const calculatePaxTotals = (rows = []) =>
  rows.reduce(
    (totals, row) => {
      const count = nonNegativeInteger(row.count, 0, "Passenger count");

      totals.costTotal += count * moneyNumber(row.costPrice);

      totals.sellingTotal += count * moneyNumber(row.sellingPrice);

      return totals;
    },
    {
      costTotal: 0,
      sellingTotal: 0,
    },
  );

const calculateQuantityTotals = (pricing) => {
  if (!pricing) {
    return {
      costTotal: 0,
      sellingTotal: 0,
    };
  }

  const quantity = nonNegativeInteger(pricing.quantity, 0, "Quantity");

  return {
    costTotal: quantity * moneyNumber(pricing.costPrice),
    sellingTotal: quantity * moneyNumber(pricing.sellingPrice),
  };
};

const calculateHotelRoomTotals = (hotelDetails = {}) => {
  const rows = Array.isArray(hotelDetails.roomPricing)
    ? hotelDetails.roomPricing
    : [];

  const nights = nonNegativeInteger(hotelDetails.nights, 0, "Hotel nights");

  const chargePerRoom = hotelDetails.chargePerRoom === true;

  return rows.reduce(
    (totals, row) => {
      let multiplier = 0;

      if (chargePerRoom) {
        multiplier = nonNegativeInteger(row.quantity, 0, "Room quantity");
      } else {
        multiplier = inferRoomOccupancy(
          row.roomType,
          row.customRoomType,
          row.occupancy,
        );
      }

      totals.costTotal += multiplier * moneyNumber(row.costPrice) * nights;

      totals.sellingTotal +=
        multiplier * moneyNumber(row.sellingPrice) * nights;

      return totals;
    },
    {
      costTotal: 0,
      sellingTotal: 0,
    },
  );
};

const hasPricingValue = (value) =>
  value !== undefined && value !== null && value !== "";

const calculateUmrahHotelBreakdown = (hotelPricing = {}) => {
  const nights = nonNegativeInteger(hotelPricing.nights, 0, "Hotel nights");
  const weekendNights = nonNegativeInteger(
    hotelPricing.weekendNights,
    0,
    "Weekend nights",
  );

  if (weekendNights > nights) {
    throw createHttpError(400, "Weekend nights cannot exceed hotel nights");
  }

  const normalNights = Math.max(0, nights - weekendNights);
  const normalRate = moneyNumber(hotelPricing.normalRate);
  const weekendRate = hasPricingValue(hotelPricing.weekendRate)
    ? moneyNumber(hotelPricing.weekendRate)
    : normalRate;
  const normalSubtotal = hasPricingValue(hotelPricing.normalSubtotal)
    ? moneyNumber(hotelPricing.normalSubtotal)
    : normalNights * normalRate;
  const weekendSubtotal = hasPricingValue(hotelPricing.weekendSubtotal)
    ? moneyNumber(hotelPricing.weekendSubtotal)
    : weekendNights * weekendRate;
  const sellingSubtotal = hasPricingValue(hotelPricing.sellingSubtotal)
    ? moneyNumber(hotelPricing.sellingSubtotal)
    : normalSubtotal + weekendSubtotal;
  const costSubtotal = hasPricingValue(hotelPricing.costSubtotal)
    ? moneyNumber(hotelPricing.costSubtotal)
    : sellingSubtotal;

  return {
    nights,
    normalNights,
    weekendNights,
    normalRate,
    weekendRate,
    normalSubtotal: roundMoney(normalSubtotal),
    weekendSubtotal: roundMoney(weekendSubtotal),
    costSubtotal: roundMoney(costSubtotal),
    sellingSubtotal: roundMoney(sellingSubtotal),
  };
};

const hasExplicitUmrahHotelBreakdown = (hotelPricing = {}) =>
  [
    "normalNights",
    "weekendNights",
    "normalRate",
    "weekendRate",
    "normalSubtotal",
    "weekendSubtotal",
    "costSubtotal",
    "sellingSubtotal",
  ].some((field) => hasPricingValue(hotelPricing[field]));

const calculateUmrahHotelTotals = (hotelPricing) => {
  if (!hotelPricing) {
    return {
      costTotal: 0,
      sellingTotal: 0,
    };
  }

  if (hotelPricing.usesNightlyBreakdown === true) {
    const breakdown = calculateUmrahHotelBreakdown(hotelPricing);

    return {
      costTotal: breakdown.costSubtotal,
      sellingTotal: breakdown.sellingSubtotal,
    };
  }

  return calculateHotelRoomTotals({
    nights: hotelPricing.nights,
    chargePerRoom: hotelPricing.chargePerRoom,
    roomPricing: hotelPricing.roomPricing,
  });
};

const calculateComponentSourceTotals = (component = {}) => {
  if (
    component.hotelPricing &&
    (component.hotelPricing.usesNightlyBreakdown === true ||
      (Array.isArray(component.hotelPricing.roomPricing) &&
        component.hotelPricing.roomPricing.length > 0))
  ) {
    const totals = calculateUmrahHotelTotals(component.hotelPricing);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  if (Array.isArray(component.paxPricing) && component.paxPricing.length > 0) {
    const totals = calculatePaxTotals(component.paxPricing);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  if (component.quantityPricing) {
    const totals = calculateQuantityTotals(component.quantityPricing);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  return {
    sellingTotal: roundMoney(component.sellingPrice),
    costTotal: roundMoney(component.costPrice),
  };
};

const calculateItemSourceTotals = (item = {}) => {
  if (
    item.itemType === "hotel" &&
    Array.isArray(item.hotelDetails?.roomPricing) &&
    item.hotelDetails.roomPricing.length > 0
  ) {
    const totals = calculateHotelRoomTotals(item.hotelDetails);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  if (Array.isArray(item.paxPricing) && item.paxPricing.length > 0) {
    const totals = calculatePaxTotals(item.paxPricing);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  if (item.quantityPricing) {
    const totals = calculateQuantityTotals(item.quantityPricing);

    return {
      sellingTotal: roundMoney(totals.sellingTotal),
      costTotal: roundMoney(totals.costTotal),
    };
  }

  return {
    sellingTotal: roundMoney(item.sellingPrice),
    costTotal: roundMoney(item.costPrice),
  };
};

const createReferenceCollector = () => ({
  customerIds: new Set(),
  customerPartyIds: new Set(),
  travelerIds: new Set(),
  serviceIds: new Set(),
  hotelIds: new Set(),
  vendorIds: new Set(),
  vendorPartyIds: new Set(),
  airlineIds: new Set(),
  airportIds: new Set(),
});

const addReference = (collector, key, value) => {
  if (value) {
    collector[key].add(String(value));
  }
};

const normalizeTicketPassenger = (passenger = {}) => ({
  travelerId: ensureObjectIdString(passenger.travelerId, "traveler ID") || null,

  paxType: normalizePaxType(passenger.paxType || "adult"),

  passengerName: cleanString(passenger.passengerName),

  airline: cleanString(passenger.airline),

  airlineId: ensureObjectIdString(passenger.airlineId, "airline ID") || null,

  origin: cleanUpperString(passenger.origin),

  destination: cleanUpperString(passenger.destination),

  originAirportId:
    ensureObjectIdString(passenger.originAirportId, "origin airport ID") ||
    null,

  destinationAirportId:
    ensureObjectIdString(
      passenger.destinationAirportId,
      "destination airport ID",
    ) || null,

  departureDateTime: nullableDate(passenger.departureDateTime),

  returnOrigin: cleanUpperString(passenger.returnOrigin),

  returnDestination: cleanUpperString(passenger.returnDestination),

  returnOriginAirportId:
    ensureObjectIdString(
      passenger.returnOriginAirportId,
      "return origin airport ID",
    ) || null,

  returnDestinationAirportId:
    ensureObjectIdString(
      passenger.returnDestinationAirportId,
      "return destination airport ID",
    ) || null,

  returnDateTime: nullableDate(passenger.returnDateTime),

  pnr: cleanUpperString(passenger.pnr),

  ticketNumber: cleanUpperString(passenger.ticketNumber),

  travelClass: cleanString(passenger.travelClass),

  baggage: cleanString(passenger.baggage),
});

const normalizeTicketDetails = (details = {}) => {
  const journeyType = normalizeJourneyType(details.journeyType);

  const departureDateTime = nullableDate(details.departureDateTime);

  const returnDateTime = nullableDate(details.returnDateTime);

  if (
    journeyType === "round_trip" &&
    departureDateTime &&
    returnDateTime &&
    returnDateTime <= departureDateTime
  ) {
    throw createHttpError(
      400,
      "Ticket return date must be after departure date",
    );
  }

  const passengerTickets = Array.isArray(details.passengerTickets)
    ? details.passengerTickets.map(normalizeTicketPassenger)
    : [];

  passengerTickets.forEach((passenger) => {
    if (
      passenger.departureDateTime &&
      passenger.returnDateTime &&
      passenger.returnDateTime <= passenger.departureDateTime
    ) {
      throw createHttpError(
        400,
        "Passenger ticket return date must be after departure date",
      );
    }
  });

  return {
    journeyType,

    sameFlightForAll: details.sameFlightForAll !== false,

    airline: cleanString(details.airline),

    airlineId: ensureObjectIdString(details.airlineId, "airline ID") || null,

    origin: cleanUpperString(details.origin),

    destination: cleanUpperString(details.destination),

    originAirportId:
      ensureObjectIdString(details.originAirportId, "origin airport ID") ||
      null,

    destinationAirportId:
      ensureObjectIdString(
        details.destinationAirportId,
        "destination airport ID",
      ) || null,

    departureDateTime,

    returnOrigin: cleanUpperString(details.returnOrigin),

    returnDestination: cleanUpperString(details.returnDestination),

    returnOriginAirportId:
      ensureObjectIdString(
        details.returnOriginAirportId,
        "return origin airport ID",
      ) || null,

    returnDestinationAirportId:
      ensureObjectIdString(
        details.returnDestinationAirportId,
        "return destination airport ID",
      ) || null,

    returnDateTime,

    pnr: cleanUpperString(details.pnr),

    ticketNumber: cleanUpperString(details.ticketNumber),

    travelClass: cleanString(details.travelClass),

    baggage: cleanString(details.baggage),

    taxes: moneyNumber(details.taxes),

    passengerTickets,
  };
};

const normalizeVisaTraveler = (traveler = {}) => ({
  travelerId: ensureObjectIdString(traveler.travelerId, "traveler ID") || null,

  paxType: normalizePaxType(traveler.paxType || "adult"),

  passengerName: cleanString(traveler.passengerName),

  passportNumber: cleanUpperString(traveler.passportNumber),

  reference: cleanString(traveler.reference),
});

const normalizeVisaDetails = (details = {}) => ({
  travelerId: ensureObjectIdString(details.travelerId, "traveler ID") || null,

  country: cleanString(details.country),

  visaType: cleanString(details.visaType),

  duration: cleanString(details.duration),

  passportNumber: cleanUpperString(details.passportNumber),

  reference: cleanString(details.reference),

  governmentFee: moneyNumber(details.governmentFee),

  serviceFee: moneyNumber(details.serviceFee),

  travelerVisas: Array.isArray(details.travelerVisas)
    ? details.travelerVisas.map(normalizeVisaTraveler)
    : [],
});

const calculateNights = (checkIn, checkOut, fallback) => {
  if (checkIn && checkOut) {
    if (checkOut <= checkIn) {
      throw createHttpError(
        400,
        "Hotel checkout date must be after checkin date",
      );
    }

    return Math.max(
      Math.ceil((checkOut.getTime() - checkIn.getTime()) / ONE_DAY_MS),
      0,
    );
  }

  const fallbackNights = Number(fallback);

  return Number.isFinite(fallbackNights) && fallbackNights > 0
    ? Math.floor(fallbackNights)
    : 0;
};

const normalizeHotelDetails = (details = {}) => {
  const checkIn = nullableDate(details.checkIn);
  const checkOut = nullableDate(details.checkOut);

  return {
    hotelId: ensureObjectIdString(details.hotelId, "hotel ID") || null,

    checkIn,

    checkOut,

    nights: calculateNights(checkIn, checkOut, details.nights),

    chargePerRoom:
      details.chargePerRoom === true || details.chargePerRoom === "true",

    rooms: nonNegativeInteger(details.rooms, 1, "Room quantity"),

    roomType: cleanString(details.roomType),

    roomPricing: normalizeHotelRoomPricing(details.roomPricing),

    adults: nonNegativeInteger(details.adults, 1, "Adult count"),

    children: nonNegativeInteger(details.children, 0, "Child count"),

    confirmationNumber: cleanString(details.confirmationNumber),
  };
};

const normalizeTransportDetails = (details = {}) => ({
  pickup: cleanString(details.pickup),
  dropoff: cleanString(details.dropoff),
  dateTime: nullableDate(details.dateTime),
  vehicleType: cleanString(details.vehicleType),
});

const normalizeUmrahHotelPricing = (pricing) => {
  if (pricing === undefined || pricing === null || pricing === "") {
    return null;
  }

  if (typeof pricing !== "object" || Array.isArray(pricing)) {
    throw createHttpError(400, "Invalid Umrah hotel pricing");
  }

  const nights = nonNegativeInteger(pricing.nights, 0, "Hotel nights");
  const normalized = {
    city: cleanString(pricing.city).toLowerCase(),

    checkIn: nullableDate(pricing.checkIn),

    checkOut: nullableDate(pricing.checkOut),

    nights,

    chargePerRoom:
      pricing.chargePerRoom === true || pricing.chargePerRoom === "true",

    roomPricing: normalizeHotelRoomPricing(pricing.roomPricing),
  };
  const explicitlyGenericPricing =
    pricing.usesNightlyBreakdown === false ||
    pricing.usesNightlyBreakdown === "false";
  const usesNightlyBreakdown =
    !explicitlyGenericPricing &&
    (pricing.usesNightlyBreakdown === true ||
      pricing.usesNightlyBreakdown === "true" ||
      hasExplicitUmrahHotelBreakdown(pricing));

  if (!usesNightlyBreakdown) {
    return normalized;
  }

  const weekendNights = nonNegativeInteger(
    pricing.weekendNights,
    0,
    "Weekend nights",
  );

  if (weekendNights > nights) {
    throw createHttpError(400, "Weekend nights cannot exceed hotel nights");
  }

  const normalNights = hasPricingValue(pricing.normalNights)
    ? nonNegativeInteger(pricing.normalNights, 0, "Normal nights")
    : Math.max(0, nights - weekendNights);

  if (normalNights + weekendNights > nights) {
    throw createHttpError(
      400,
      "Normal and weekend nights cannot exceed hotel nights",
    );
  }

  const normalRate = moneyNumber(pricing.normalRate);
  const weekendRate = hasPricingValue(pricing.weekendRate)
    ? moneyNumber(pricing.weekendRate)
    : normalRate;
  const normalSubtotal = hasPricingValue(pricing.normalSubtotal)
    ? moneyNumber(pricing.normalSubtotal)
    : normalNights * normalRate;
  const weekendSubtotal = hasPricingValue(pricing.weekendSubtotal)
    ? moneyNumber(pricing.weekendSubtotal)
    : weekendNights * weekendRate;
  const sellingSubtotal = hasPricingValue(pricing.sellingSubtotal)
    ? moneyNumber(pricing.sellingSubtotal)
    : normalSubtotal + weekendSubtotal;
  const costSubtotal = hasPricingValue(pricing.costSubtotal)
    ? moneyNumber(pricing.costSubtotal)
    : sellingSubtotal;

  return {
    ...normalized,
    normalNights,

    weekendNights,

    normalRate,

    weekendRate,

    normalSubtotal: roundMoney(normalSubtotal),

    weekendSubtotal: roundMoney(weekendSubtotal),

    costSubtotal: roundMoney(costSubtotal),

    sellingSubtotal: roundMoney(sellingSubtotal),

    markWeekend: pricing.markWeekend === true || pricing.markWeekend === "true",

    usesNightlyBreakdown: true,
  };
};

const normalizeUmrahComponentType = (value = "other") => {
  const componentType = cleanString(value || "other").toLowerCase();

  if (!UMRAH_COMPONENT_TYPES.includes(componentType)) {
    throw createHttpError(400, "Invalid Umrah component type");
  }

  return componentType;
};

const normalizeUmrahComponent = (component = {}) => {
  const vendorPaidAmount = moneyNumber(component.vendorPaidAmount);

  const vendorCounterparty = normalizeVendorCounterpartyInput(component);
  const vendorId = vendorCounterparty.vendorId || null;
  const vendorPartyId = vendorCounterparty.vendorPartyId || null;

  const normalized = {
    componentType: normalizeUmrahComponentType(component.componentType),

    label: cleanString(component.label),

    vendorId,

    vendorType: vendorCounterparty.vendorType,

    vendorPartyId,

    hotelId: ensureObjectIdString(component.hotelId, "hotel ID") || null,

    serviceId: ensureObjectIdString(component.serviceId, "service ID") || null,

    sellingPrice: moneyNumber(component.sellingPrice),

    sellingCurrency: normalizeCurrency(component.sellingCurrency),

    costPrice: moneyNumber(component.costPrice),

    costCurrency: normalizeCurrency(component.costCurrency),

    paxPricing: normalizePaxPricing(component.paxPricing),

    quantityPricing: normalizeQuantityPricing(component.quantityPricing),

    hotelPricing: normalizeUmrahHotelPricing(component.hotelPricing),

    vendorPaidAmount,

    estimatedSellingBase: 0,

    estimatedCostBase: 0,

    estimatedVendorPaidBase: 0,

    notes: cleanString(component.notes),
  };

  const totals = calculateComponentSourceTotals(normalized);

  if (vendorPaidAmount > totals.costTotal) {
    throw createHttpError(
      400,
      "Vendor paid amount cannot exceed component cost",
    );
  }

  if (vendorPaidAmount > 0 && !vendorId && !vendorPartyId) {
    throw createHttpError(
      400,
      "Vendor is required when vendor payment is greater than zero",
    );
  }

  return normalized;
};

const normalizeUmrahDetails = (details = {}) => {
  const departureDate = nullableDate(details.departureDate);

  const returnDate = nullableDate(details.returnDate);

  if (departureDate && returnDate && returnDate < departureDate) {
    throw createHttpError(
      400,
      "Umrah return date cannot be before departure date",
    );
  }

  return {
    packageMode: normalizePackageMode(details.packageMode),

    packageName: cleanString(details.packageName),

    departureDate,

    returnDate,

    makkahHotelId:
      ensureObjectIdString(details.makkahHotelId, "Makkah hotel ID") || null,

    madinahHotelId:
      ensureObjectIdString(details.madinahHotelId, "Madinah hotel ID") || null,

    syncPassengerCountsToComponents:
      details.syncPassengerCountsToComponents !== false &&
      details.syncPassengerCountsToComponents !== "false",

    components: Array.isArray(details.components)
      ? details.components.map(normalizeUmrahComponent)
      : [],

    plannerInfo:
      details.plannerInfo && typeof details.plannerInfo === "object"
        ? details.plannerInfo
        : null,

    pricingSummary:
      details.pricingSummary && typeof details.pricingSummary === "object"
        ? details.pricingSummary
        : null,
  };
};

const normalizeBookingItem = (rawItem = {}, rootServiceType) => {
  const itemType = normalizeItemType(
    rawItem.itemType ||
      (rootServiceType === "mixed" ? "service" : rootServiceType),
  );

  const travelerIds = normalizeObjectIdArray(
    rawItem.travelerIds,
    "traveler ID",
  );

  const ticketDetails = normalizeTicketDetails(rawItem.ticketDetails || {});

  const visaDetails = normalizeVisaDetails(rawItem.visaDetails || {});

  if (
    visaDetails.travelerId &&
    !travelerIds.includes(String(visaDetails.travelerId))
  ) {
    travelerIds.push(String(visaDetails.travelerId));
  }

  ticketDetails.passengerTickets.forEach((passenger) => {
    if (
      passenger.travelerId &&
      !travelerIds.includes(String(passenger.travelerId))
    ) {
      travelerIds.push(String(passenger.travelerId));
    }
  });

  visaDetails.travelerVisas.forEach((traveler) => {
    if (
      traveler.travelerId &&
      !travelerIds.includes(String(traveler.travelerId))
    ) {
      travelerIds.push(String(traveler.travelerId));
    }
  });

  const vendorCounterparty = normalizeVendorCounterpartyInput(rawItem);
  const vendorId = vendorCounterparty.vendorId || null;
  const vendorPartyId = vendorCounterparty.vendorPartyId || null;

  const item = {
    itemType,

    serviceId: ensureObjectIdString(rawItem.serviceId, "service ID") || null,

    travelerIds,

    vendorId,

    vendorType: vendorCounterparty.vendorType,

    vendorPartyId,

    title: cleanString(rawItem.title),

    description: cleanString(rawItem.description),

    sellingPrice: moneyNumber(rawItem.sellingPrice),

    sellingCurrency: normalizeCurrency(rawItem.sellingCurrency),

    costPrice: moneyNumber(rawItem.costPrice),

    costCurrency: normalizeCurrency(rawItem.costCurrency),

    paxPricing: normalizePaxPricing(rawItem.paxPricing),

    quantityPricing: normalizeQuantityPricing(rawItem.quantityPricing),

    vendorPaidAmount: moneyNumber(rawItem.vendorPaidAmount),

    estimatedSellingBase: 0,

    estimatedCostBase: 0,

    estimatedVendorPaidBase: 0,

    ticketDetails,

    visaDetails,

    hotelDetails: normalizeHotelDetails(rawItem.hotelDetails || {}),

    umrahDetails: normalizeUmrahDetails(rawItem.umrahDetails || {}),

    transportDetails: normalizeTransportDetails(rawItem.transportDetails || {}),
  };

  const itemTotals = calculateItemSourceTotals(item);

  if (
    item.itemType === "umrah_package" &&
    item.umrahDetails.packageMode === "custom_component_package" &&
    item.umrahDetails.components.length > 0
  ) {
    const componentCostTotal = item.umrahDetails.components.reduce(
      (sum, component) =>
        sum + calculateComponentSourceTotals(component).costTotal,
      0,
    );

    if (item.vendorPaidAmount > roundMoney(componentCostTotal)) {
      throw createHttpError(
        400,
        "Vendor paid amount cannot exceed Umrah component cost",
      );
    }
  } else if (item.vendorPaidAmount > itemTotals.costTotal) {
    throw createHttpError(400, "Vendor paid amount cannot exceed item cost");
  }

  if (
    item.vendorPaidAmount > 0 &&
    !vendorId &&
    !vendorPartyId &&
    !(
      item.itemType === "umrah_package" &&
      item.umrahDetails.packageMode === "custom_component_package"
    )
  ) {
    throw createHttpError(
      400,
      "Vendor is required when vendor payment is greater than zero",
    );
  }

  return item;
};

const collectItemReferences = (collector, item) => {
  addReference(collector, "serviceIds", item.serviceId);

  addReference(collector, "vendorIds", item.vendorId);
  addReference(collector, "vendorPartyIds", item.vendorPartyId);

  item.travelerIds.forEach((id) => addReference(collector, "travelerIds", id));

  if (item.visaDetails?.travelerId) {
    addReference(collector, "travelerIds", item.visaDetails.travelerId);
  }

  (item.visaDetails?.travelerVisas || []).forEach((traveler) => {
    addReference(collector, "travelerIds", traveler.travelerId);
  });

  addReference(collector, "airlineIds", item.ticketDetails?.airlineId);

  addReference(collector, "airportIds", item.ticketDetails?.originAirportId);

  addReference(
    collector,
    "airportIds",
    item.ticketDetails?.destinationAirportId,
  );

  addReference(
    collector,
    "airportIds",
    item.ticketDetails?.returnOriginAirportId,
  );

  addReference(
    collector,
    "airportIds",
    item.ticketDetails?.returnDestinationAirportId,
  );

  (item.ticketDetails?.passengerTickets || []).forEach((passenger) => {
    addReference(collector, "travelerIds", passenger.travelerId);

    addReference(collector, "airlineIds", passenger.airlineId);

    addReference(collector, "airportIds", passenger.originAirportId);

    addReference(collector, "airportIds", passenger.destinationAirportId);

    addReference(collector, "airportIds", passenger.returnOriginAirportId);

    addReference(collector, "airportIds", passenger.returnDestinationAirportId);
  });

  if (item.hotelDetails?.hotelId) {
    addReference(collector, "hotelIds", item.hotelDetails.hotelId);
  }

  if (item.umrahDetails?.makkahHotelId) {
    addReference(collector, "hotelIds", item.umrahDetails.makkahHotelId);
  }

  if (item.umrahDetails?.madinahHotelId) {
    addReference(collector, "hotelIds", item.umrahDetails.madinahHotelId);
  }

  (item.umrahDetails?.components || []).forEach((component) => {
    addReference(collector, "serviceIds", component.serviceId);

    addReference(collector, "vendorIds", component.vendorId);
    addReference(collector, "vendorPartyIds", component.vendorPartyId);

    addReference(collector, "hotelIds", component.hotelId);
  });
};

const assertCountMatches = async ({ Model, query, ids, label }) => {
  if (!ids.length) {
    return;
  }

  const found = await Model.countDocuments({
    ...query,
    _id: {
      $in: ids,
    },
  });

  if (found !== ids.length) {
    throw createHttpError(400, `${label} not found for this business`);
  }
};

const assertReferencesBelongToUser = async ({ collector, userId }) => {
  const customerIds = [...collector.customerIds];

  const customerPartyIds = [...collector.customerPartyIds];

  const travelerIds = [...collector.travelerIds];

  const serviceIds = [...collector.serviceIds];

  const hotelIds = [...collector.hotelIds];

  const vendorIds = [...collector.vendorIds];

  const vendorPartyIds = [...collector.vendorPartyIds];

  const airlineIds = [...collector.airlineIds];

  const airportIds = [...collector.airportIds];

  const referenceChecks = [
    assertCountMatches({
      Model: Customer,

      query: applyModuleScopeFilter(
        {
          createdBy: userId,
          isActive: {
            $ne: false,
          },
        },
        MODULE_SCOPES.TRAVEL,
      ),

      ids: customerIds,

      label: "Customer",
    }),

    assertCountMatches({
      Model: Party,

      query: buildTravelPartyRoleQuery(userId, "customer"),

      ids: customerPartyIds,

      label: "Travel customer party",
    }),

    assertCountMatches({
      Model: Traveler,

      query: {
        userId,
        isActive: {
          $ne: false,
        },
        isDeleted: false,
      },

      ids: travelerIds,

      label: "Traveler",
    }),

    assertCountMatches({
      Model: TravelService,

      query: {
        userId,
        isActive: {
          $ne: false,
        },
        isDeleted: false,
      },

      ids: serviceIds,

      label: "Travel service",
    }),

    assertCountMatches({
      Model: TravelHotel,

      query: {
        userId,
        isActive: {
          $ne: false,
        },
        isDeleted: false,
      },

      ids: hotelIds,

      label: "Travel hotel",
    }),

    assertCountMatches({
      Model: Supplier,

      query: applySupplierModuleScopeFilter(
        {
          userId,
          isDeleted: false,
        },
        MODULE_SCOPES.TRAVEL,
      ),

      ids: vendorIds,

      label: "Travel vendor",
    }),

    assertCountMatches({
      Model: Party,

      query: buildTravelPartyRoleQuery(userId, "supplier"),

      ids: vendorPartyIds,

      label: "Travel vendor party",
    }),

    assertCountMatches({
      Model: TravelAirline,

      query: {
        userId,
        isActive: {
          $ne: false,
        },
        isDeleted: false,
      },

      ids: airlineIds,

      label: "Travel airline",
    }),
  ];

  const TravelAirport = mongoose.models.TravelAirport;

  if (TravelAirport && airportIds.length > 0) {
    referenceChecks.push(
      assertCountMatches({
        Model: TravelAirport,

        query: {
          userId,
          isActive: {
            $ne: false,
          },
          isDeleted: false,
        },

        ids: airportIds,

        label: "Travel airport",
      }),
    );
  }

  await Promise.all(referenceChecks);
};

const getCurrencySettings = async (userId) => {
  const settings = await TravelCurrencySetting.findOne({
    userId,
  }).lean();

  const baseCurrency = normalizeCurrency(
    settings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY,
  );

  const rates = settings?.rates?.length
    ? settings.rates
    : getDefaultTravelCurrencyRates();

  const rateMap = new Map([[baseCurrency, 1]]);

  rates.forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);

    const rateToBase = Number(rate?.rateToBase || 0);

    if (SUPPORTED_TRAVEL_CURRENCY_CODES.includes(currency)) {
      rateMap.set(
        currency,
        Number.isFinite(rateToBase) ? Math.max(rateToBase, 0) : 0,
      );
    }
  });

  return {
    baseCurrency,
    rateMap,
  };
};

const applyCalculatorRateSnapshot = (currencySettings, bookingItems = []) => {
  const umrahItem = bookingItems.find(
    (item) =>
      item?.itemType === "umrah_package" &&
      item?.umrahDetails?.pricingSummary?.rates,
  );

  const calculatorRates = umrahItem?.umrahDetails?.pricingSummary?.rates;

  if (!calculatorRates || currencySettings.baseCurrency !== "PKR") {
    return currencySettings;
  }

  const rateMap = new Map(currencySettings.rateMap);

  const sarToPkr = Number(calculatorRates.SAR_to_PKR || 0);
  const usdToPkr = Number(calculatorRates.USD_to_PKR || 0);

  if (Number.isFinite(sarToPkr) && sarToPkr > 0) {
    rateMap.set("SAR", sarToPkr);
  }

  if (Number.isFinite(usdToPkr) && usdToPkr > 0) {
    rateMap.set("USD", usdToPkr);
  }

  return {
    ...currencySettings,
    rateMap,
  };
};

const estimateBaseAmount = (amount, currency, settings) => {
  const numericAmount = Number(amount || 0);

  if (numericAmount === 0) {
    return 0;
  }

  const cleanCurrency = normalizeCurrency(currency);

  if (cleanCurrency === settings.baseCurrency) {
    return numericAmount;
  }

  const rate = Number(settings.rateMap.get(cleanCurrency) || 0);

  return rate > 0 ? numericAmount * rate : 0;
};

const addBreakdownAmount = (breakdown, currency, sellingPrice, costPrice) => {
  const cleanCurrency = normalizeCurrency(currency);

  const current = breakdown.get(cleanCurrency) || {
    currency: cleanCurrency,
    sellingTotal: 0,
    costTotal: 0,
  };

  current.sellingTotal += Number(sellingPrice || 0);

  current.costTotal += Number(costPrice || 0);

  breakdown.set(cleanCurrency, current);
};

const applyEstimatedTotals = (items, currencySettings) => {
  const breakdown = new Map();

  let sellingTotal = 0;
  let costTotal = 0;
  let vendorPaidTotal = 0;

  const nextItems = items.map((item) => {
    const nextItem = {
      ...item,
    };

    const useComponents =
      nextItem.itemType === "umrah_package" &&
      nextItem.umrahDetails?.packageMode === "custom_component_package" &&
      nextItem.umrahDetails?.components?.length > 0;

    if (useComponents) {
      let itemSellingBase = 0;
      let itemCostBase = 0;
      let itemVendorPaidBase = 0;

      nextItem.vendorPaidAmount = 0;
      nextItem.estimatedVendorPaidBase = 0;

      nextItem.umrahDetails = {
        ...nextItem.umrahDetails,

        components: nextItem.umrahDetails.components.map((component) => {
          const componentTotals = calculateComponentSourceTotals(component);

          const estimatedSellingBase = estimateBaseAmount(
            componentTotals.sellingTotal,
            component.sellingCurrency,
            currencySettings,
          );

          const estimatedCostBase = estimateBaseAmount(
            componentTotals.costTotal,
            component.costCurrency,
            currencySettings,
          );

          const estimatedVendorPaidBase = estimateBaseAmount(
            component.vendorPaidAmount,
            component.costCurrency,
            currencySettings,
          );

          if (estimatedVendorPaidBase > estimatedCostBase + 0.009) {
            throw createHttpError(
              400,
              "Vendor paid amount cannot exceed component cost",
            );
          }

          addBreakdownAmount(
            breakdown,
            component.sellingCurrency,
            componentTotals.sellingTotal,
            0,
          );

          addBreakdownAmount(
            breakdown,
            component.costCurrency,
            0,
            componentTotals.costTotal,
          );

          itemSellingBase += estimatedSellingBase;

          itemCostBase += estimatedCostBase;

          itemVendorPaidBase += estimatedVendorPaidBase;

          return {
            ...component,
            estimatedSellingBase: roundMoney(estimatedSellingBase),
            estimatedCostBase: roundMoney(estimatedCostBase),
            estimatedVendorPaidBase: roundMoney(estimatedVendorPaidBase),
          };
        }),
      };

      nextItem.estimatedSellingBase = roundMoney(itemSellingBase);

      nextItem.estimatedCostBase = roundMoney(itemCostBase);

      nextItem.estimatedVendorPaidBase = roundMoney(itemVendorPaidBase);

      sellingTotal += itemSellingBase;
      costTotal += itemCostBase;
      vendorPaidTotal += itemVendorPaidBase;

      return nextItem;
    }

    const itemSourceTotals = calculateItemSourceTotals(nextItem);

    const estimatedSellingBase = estimateBaseAmount(
      itemSourceTotals.sellingTotal,
      nextItem.sellingCurrency,
      currencySettings,
    );

    const estimatedCostBase = estimateBaseAmount(
      itemSourceTotals.costTotal,
      nextItem.costCurrency,
      currencySettings,
    );

    const estimatedVendorPaidBase = estimateBaseAmount(
      nextItem.vendorPaidAmount,
      nextItem.costCurrency,
      currencySettings,
    );

    if (estimatedVendorPaidBase > estimatedCostBase + 0.009) {
      throw createHttpError(400, "Vendor paid amount cannot exceed item cost");
    }

    nextItem.estimatedSellingBase = roundMoney(estimatedSellingBase);

    nextItem.estimatedCostBase = roundMoney(estimatedCostBase);

    nextItem.estimatedVendorPaidBase = roundMoney(estimatedVendorPaidBase);

    addBreakdownAmount(
      breakdown,
      nextItem.sellingCurrency,
      itemSourceTotals.sellingTotal,
      0,
    );

    addBreakdownAmount(
      breakdown,
      nextItem.costCurrency,
      0,
      itemSourceTotals.costTotal,
    );

    sellingTotal += estimatedSellingBase;
    costTotal += estimatedCostBase;
    vendorPaidTotal += estimatedVendorPaidBase;

    return nextItem;
  });

  const roundedSellingTotal = roundMoney(sellingTotal);

  const roundedCostTotal = roundMoney(costTotal);

  const roundedVendorPaidTotal = roundMoney(vendorPaidTotal);

  if (roundedVendorPaidTotal > roundedCostTotal + 0.009) {
    throw createHttpError(
      400,
      "Vendor paid amount cannot exceed total travel cost",
    );
  }

  return {
    bookingItems: nextItems,

    currencyBreakdown: [...breakdown.values()]
      .map((row) => ({
        ...row,
        sellingTotal: roundMoney(row.sellingTotal),
        costTotal: roundMoney(row.costTotal),
      }))
      .filter((row) => row.sellingTotal !== 0 || row.costTotal !== 0),

    sellingTotal: roundedSellingTotal,

    costTotal: roundedCostTotal,

    vendorPaidTotal: roundedVendorPaidTotal,

    estimatedProfit: roundMoney(roundedSellingTotal - roundedCostTotal),
  };
};

const getItemDateRange = (item) => {
  if (item.itemType === "air_ticket") {
    const passengerDates = (item.ticketDetails?.passengerTickets || [])
      .flatMap((passenger) => [
        passenger.departureDateTime,
        passenger.returnDateTime,
      ])
      .filter(Boolean);

    if (passengerDates.length > 0) {
      const sorted = passengerDates
        .map((date) => new Date(date))
        .sort((a, b) => a.getTime() - b.getTime());

      return {
        start: item.ticketDetails?.departureDateTime || sorted[0],
        end: item.ticketDetails?.returnDateTime || sorted[sorted.length - 1],
      };
    }

    return {
      start: item.ticketDetails?.departureDateTime || null,

      end:
        item.ticketDetails?.returnDateTime ||
        item.ticketDetails?.departureDateTime ||
        null,
    };
  }

  if (item.itemType === "hotel") {
    return {
      start: item.hotelDetails?.checkIn || null,
      end: item.hotelDetails?.checkOut || null,
    };
  }

  if (item.itemType === "umrah_package") {
    return {
      start: item.umrahDetails?.departureDate || null,
      end: item.umrahDetails?.returnDate || null,
    };
  }

  if (item.itemType === "transport") {
    return {
      start: item.transportDetails?.dateTime || null,
      end: item.transportDetails?.dateTime || null,
    };
  }

  return {
    start: null,
    end: null,
  };
};

const deriveTravelDates = (items, providedStartDate, providedEndDate) => {
  const ranges = items
    .map(getItemDateRange)
    .flatMap((range) => [range.start, range.end])
    .filter(Boolean)
    .map((date) => new Date(date));

  const startDate = nullableDate(providedStartDate);

  const endDate = nullableDate(providedEndDate);

  if (startDate && endDate && endDate < startDate) {
    throw createHttpError(400, "Travel end date cannot be before start date");
  }

  if (startDate || endDate || ranges.length === 0) {
    return {
      travelStartDate: startDate,
      travelEndDate: endDate,
    };
  }

  const sorted = ranges.sort((a, b) => a.getTime() - b.getTime());

  return {
    travelStartDate: sorted[0],
    travelEndDate: sorted[sorted.length - 1],
  };
};

const getPaymentAccount = async ({ userId, accountId, label }) => {
  const account = await Account.findOne(
    applyModuleScopeFilter(
      {
        _id: ensureObjectIdString(accountId, label),

        userId,

        isActive: {
          $ne: false,
        },

        type: "Asset",

        category: {
          $in: PAYMENT_ACCOUNT_CATEGORIES,
        },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id name code category type")
    .lean();

  if (!account) {
    throw createHttpError(400, `${label} not found`);
  }

  return account;
};

const buildBookingPayload = async (body = {}, req, existingBooking = null) => {
  const userId = getUserId(req);

  const serviceType = normalizeServiceType(
    body.serviceType || existingBooking?.serviceType || "mixed",
  );

  const status = normalizeStatus(
    body.status || existingBooking?.status || "draft",
  );

  const customerCounterparty = normalizeCustomerCounterpartyInput(
    body,
    existingBooking || {},
  );
  const customerId = customerCounterparty.customerId;
  const customerPartyId = customerCounterparty.customerPartyId;

  const invoiceDate =
    nullableDate(body.invoiceDate) ||
    existingBooking?.invoiceDate ||
    new Date();

  const discountAmount = moneyNumber(body.discountAmount);

  const receivedAmount = moneyNumber(body.receivedAmount || body.paidAmount);

  const paymentType =
    receivedAmount > 0
      ? normalizePaymentType(
          body.paymentType || existingBooking?.paymentType || "cash",
        )
      : "credit";

  const accountId =
    receivedAmount > 0
      ? ensureObjectIdString(
          body.accountId || existingBooking?.accountId,
          "payment account",
        )
      : null;

  if (!customerId && !customerPartyId) {
    throw createHttpError(400, "Customer is required");
  }

  const parsedItems = parseJsonField(body.bookingItems, []);

  const rawItems = Array.isArray(parsedItems) ? parsedItems : [];

  if (rawItems.length === 0) {
    throw createHttpError(400, "At least one booking item is required");
  }

  const bookingItems = rawItems.map((item) =>
    normalizeBookingItem(item, serviceType),
  );

  const rootTravelers = normalizeObjectIdArray(
    parseJsonField(body.travelers, []),
    "traveler ID",
  );

  bookingItems.forEach((item) => {
    item.travelerIds.forEach((id) => {
      if (!rootTravelers.includes(String(id))) {
        rootTravelers.push(String(id));
      }
    });
  });

  const collector = createReferenceCollector();

  addReference(collector, "customerIds", customerId);
  addReference(collector, "customerPartyIds", customerPartyId);

  rootTravelers.forEach((id) => addReference(collector, "travelerIds", id));

  bookingItems.forEach((item) => collectItemReferences(collector, item));

  await assertReferencesBelongToUser({
    collector,
    userId,
  });

  const savedCurrencySettings = await getCurrencySettings(userId);

  const currencySettings = applyCalculatorRateSnapshot(
    savedCurrencySettings,
    bookingItems,
  );

  const totals = applyEstimatedTotals(bookingItems, currencySettings);

  if (discountAmount > totals.sellingTotal) {
    throw createHttpError(400, "Discount cannot exceed gross sale");
  }

  const netSale = roundMoney(Math.max(totals.sellingTotal - discountAmount, 0));

  if (receivedAmount > netSale) {
    throw createHttpError(400, "Received amount cannot exceed net invoice");
  }

  const vendorPaidTotal = roundMoney(totals.vendorPaidTotal);

  const vendorPaymentType =
    vendorPaidTotal > 0
      ? normalizePaymentType(
          body.vendorPaymentType ||
            existingBooking?.vendorPaymentType ||
            "cash",
        )
      : "credit";

  const vendorPaymentAccountId =
    vendorPaidTotal > 0
      ? ensureObjectIdString(
          body.vendorPaymentAccountId ||
            existingBooking?.vendorPaymentAccountId,
          "vendor payment account",
        )
      : null;

  const paymentAccountPromises = [];

  if (receivedAmount > 0) {
    if (!accountId) {
      throw createHttpError(
        400,
        "Payment account is required when received amount is greater than zero",
      );
    }

    paymentAccountPromises.push(
      getPaymentAccount({
        userId,
        accountId,
        label: "Payment account",
      }),
    );
  }

  if (vendorPaidTotal > 0) {
    if (!vendorPaymentAccountId) {
      throw createHttpError(
        400,
        "Vendor payment account is required when vendor paid amount is greater than zero",
      );
    }

    paymentAccountPromises.push(
      getPaymentAccount({
        userId,
        accountId: vendorPaymentAccountId,
        label: "Vendor payment account",
      }),
    );
  }

  if (paymentAccountPromises.length) {
    await Promise.all(paymentAccountPromises);
  }

  const travelDates = deriveTravelDates(
    totals.bookingItems,
    body.travelStartDate,
    body.travelEndDate,
  );

  const now = new Date();

  const grossProfit = roundMoney(netSale - totals.costTotal);

  return {
    serviceType,

    status,

    customerType: customerCounterparty.customerType,

    customerId,

    customerPartyId,

    travelers: rootTravelers,

    bookingItems: totals.bookingItems,

    quotationDate:
      nullableDate(body.quotationDate) ||
      existingBooking?.quotationDate ||
      (status === "quotation" ? now : null),

    confirmedAt:
      nullableDate(body.confirmedAt) ||
      existingBooking?.confirmedAt ||
      (["confirmed", "processing", "completed"].includes(status) ? now : null),

    ...travelDates,

    notes: cleanString(body.notes),

    internalNotes: cleanString(body.internalNotes),

    reminderSettings: normalizeReminderSettings(
      body.reminderSettings,
      existingBooking?.reminderSettings,
    ),

    invoiceDate,

    baseCurrency: currencySettings.baseCurrency,

    currencyBreakdown: totals.currencyBreakdown,

    sellingTotal: roundMoney(totals.sellingTotal),

    costTotal: roundMoney(totals.costTotal),

    discountAmount: roundMoney(discountAmount),

    netSale,

    receivedAmount: roundMoney(receivedAmount),

    customerDue: roundMoney(Math.max(netSale - receivedAmount, 0)),

    vendorPaidTotal,

    vendorPayable: roundMoney(Math.max(totals.costTotal - vendorPaidTotal, 0)),

    grossProfit,

    estimatedProfit: grossProfit,

    paymentType,

    accountId,

    vendorPaymentType,

    vendorPaymentAccountId,

    assignedStaffId:
      ensureObjectIdString(body.assignedStaffId, "assigned staff ID") || null,

    isActive: body.isActive !== false,
  };
};

const generateBookingNumber = async (
  userId,
  date = new Date(),
  session = null,
) => generateTravelInvoiceNumber(userId, date, session);

const populateBooking = (query) =>
  query
    .populate("customerId", "name phone email moduleScope")
    .populate("customerPartyId", "name phone email role moduleScope")
    .populate("travelers", "fullName passportNumber mobile")
    .populate("bookingItems.travelerIds", "fullName passportNumber mobile")
    .populate(
      "bookingItems.ticketDetails.passengerTickets.travelerId",
      "fullName passportNumber mobile",
    )
    .populate(
      "bookingItems.visaDetails.travelerId",
      "fullName passportNumber mobile",
    )
    .populate(
      "bookingItems.visaDetails.travelerVisas.travelerId",
      "fullName passportNumber mobile",
    )
    .populate("bookingItems.serviceId", "name code defaultSellingCurrency")
    .populate(
      "bookingItems.vendorId",
      "name phone travelVendorType moduleScope",
    )
    .populate(
      "bookingItems.vendorPartyId",
      "name phone email role moduleScope",
    )
    .populate("bookingItems.hotelDetails.hotelId", "name city country")
    .populate("bookingItems.umrahDetails.makkahHotelId", "name city country")
    .populate("bookingItems.umrahDetails.madinahHotelId", "name city country")
    .populate(
      "bookingItems.umrahDetails.components.vendorId",
      "name phone travelVendorType moduleScope",
    )
    .populate(
      "bookingItems.umrahDetails.components.vendorPartyId",
      "name phone email role moduleScope",
    )
    .populate(
      "bookingItems.umrahDetails.components.hotelId",
      "name city country",
    )
    .populate("bookingItems.umrahDetails.components.serviceId", "name code")
    .populate(
      "bookingItems.ticketDetails.airlineId",
      "name iataCode icaoCode country",
    )
    .populate(
      "bookingItems.ticketDetails.passengerTickets.airlineId",
      "name iataCode icaoCode country",
    )
    .populate("accountId", "name code category type")
    .populate("vendorPaymentAccountId", "name code category type");

const serializeBooking = (booking) => {
  if (!booking) {
    return booking;
  }

  const plain = booking.toObject
    ? booking.toObject()
    : {
        ...booking,
      };

  const invoiceNumber = plain.invoiceNumber || plain.bookingNumber || "";

  const grossSale = Number(plain.sellingTotal || 0);

  const discountAmount = Number(plain.discountAmount || 0);

  const netSale = Number(
    plain.netSale ?? Math.max(grossSale - discountAmount, 0),
  );

  const receivedAmount = Number(plain.receivedAmount || 0);

  const costTotal = Number(plain.costTotal || 0);

  const vendorPaidTotal = Number(plain.vendorPaidTotal || 0);
  const customer =
    plain.customerType === "party" && plain.customerPartyId
      ? plain.customerPartyId
      : plain.customerId;

  return {
    ...plain,

    invoiceId: plain._id,

    invoiceNumber,

    customer,

    attachments: formatTravelInvoiceAttachments(plain),

    grossSale,

    netSale,

    customerDue: Number(
      plain.customerDue ?? Math.max(netSale - receivedAmount, 0),
    ),

    vendorPaidTotal,

    vendorPayable: Number(
      plain.vendorPayable ?? Math.max(costTotal - vendorPaidTotal, 0),
    ),

    grossProfit: Number(plain.grossProfit ?? netSale - costTotal),

    estimatedProfit: Number(plain.estimatedProfit ?? netSale - costTotal),
  };
};

module.exports = {
  BOOKING_STATUSES,
  SERVICE_TYPES,
  ITEM_TYPES,
  JOURNEY_TYPES,
  UMRAH_PACKAGE_MODES,
  PAX_TYPES,
  HOTEL_ROOM_TYPES,
  ONE_DAY_MS,
  buildBookingPayload,
  cleanString,
  createHttpError,
  escapeRegex,
  generateBookingNumber,
  generateTemporaryBookingNumber,
  getActorId,
  getItemDateRange,
  getUserId,
  nullableDate,
  normalizeStatus,
  populateBooking,
  sendError,
  serializeBooking,
};
