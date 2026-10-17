const {
  extractBusinessTime,
  formatBusinessDate,
} = require("../../utils/businessDate");
const { formatMoney: formatMoneyValue } = require("../../utils/money");
const {
  formatStayNights,
  resolveUmrahCityNights,
} = require("./umrahStayNights");

const getLogoUrl = (header = {}) =>
  header.showLogo === true && header.logoUrl ? header.logoUrl : "";

const cleanText = (value) => {
  if (value === null || value === undefined || typeof value === "object") return "";

  const clean = String(value).trim().replace(/\s+/g, " ");

  return /^(?:undefined|null|nan)$/i.test(clean) ? "" : clean;
};

const unwrapSavedDate = (value) => {
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  return value.iso || value.value || "";
};

const formatDate = (date) => {
  try {
    return formatBusinessDate(unwrapSavedDate(date)) || "";
  } catch (_) {
    return "";
  }
};

const formatTime = (date) => {
  const savedDate = unwrapSavedDate(date);

  if (typeof savedDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(savedDate.trim())) {
    return "";
  }

  const time = extractBusinessTime(savedDate);

  if (!time) return "";
  const [hour, minute] = time.split(":").map(Number);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const formatDateTime = (date) => {
  const formattedDate = formatDate(date);
  const formattedTime = formatTime(date);

  return [formattedDate, formattedTime].filter(Boolean).join(", ");
};

const safeNumber = (value) => {
  const amount = Number(value || 0);

  return Number.isFinite(amount) ? amount : 0;
};

const formatMoney = (value, currency = "PKR") =>
  `${String(currency || "PKR").toUpperCase()} ${formatMoneyValue(value)}`;

const humanize = (value = "") =>
  String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getName = (record, fallback = "") => {
  if (!record) return fallback;

  if (typeof record === "object") {
    return record.name || record.fullName || record.code || fallback;
  }

  return String(record || fallback);
};

const getDisplayName = (record, fallback = "") => {
  const name = cleanText(getName(record, fallback));

  return /^[a-f\d]{24}$/i.test(name) ? cleanText(fallback) : name;
};

const joinValues = (...values) => values.filter(Boolean).join(" - ");

const normalizeTravelerName = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const getTravelerId = (traveler) => {
  if (!traveler) return "";

  if (typeof traveler === "object") {
    return String(traveler._id || traveler.id || "");
  }

  return String(traveler);
};

const buildTopTravelerIndex = (booking = {}) => {
  const travelers = Array.isArray(booking.travelers) ? booking.travelers : [];

  return {
    hasTravelers: travelers.length > 0,
    ids: new Set(travelers.map(getTravelerId).filter(Boolean)),
    names: new Set(
      travelers.map((traveler) => normalizeTravelerName(getName(traveler))).filter(Boolean),
    ),
  };
};

const isTopTraveler = (traveler, name, topTravelerIndex) => {
  if (!topTravelerIndex?.hasTravelers) return false;

  const id = getTravelerId(traveler);
  const normalizedName = normalizeTravelerName(name || getName(traveler));

  if (id) {
    return topTravelerIndex.ids.has(id);
  }

  return Boolean(normalizedName && topTravelerIndex.names.has(normalizedName));
};

const AUTO_CURRENCY_SUMMARY_PATTERNS = {
  sar: /^(?:Total SAR|کل SAR)\s*:\s*SAR\s+-?\d[\d,]*(?:\.\d+)?$/i,
  base: /^(?:Total Base|کل بیس)\s*:\s*[A-Z]{3}\s+-?\d[\d,]*(?:\.\d+)?$/i,
  usd: /^(?:Total USD|کل USD)\s*:\s*USD\s+-?\d[\d,]*(?:\.\d+)?$/i,
};

const getAutoCurrencySummaryType = (value = "") => {
  const segment = String(value || "").trim().replace(/\s+/g, " ");

  return (
    Object.entries(AUTO_CURRENCY_SUMMARY_PATTERNS).find(([, pattern]) =>
      pattern.test(segment),
    )?.[0] || ""
  );
};

const sanitizeCustomerFacingDescription = (value = "") => {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.split(/\s*\|\s*/));
  const summaryTypes = new Set(
    lines.flatMap((segments) => segments.map(getAutoCurrencySummaryType)).filter(Boolean),
  );

  if (!["sar", "base", "usd"].every((type) => summaryTypes.has(type))) {
    return String(value || "").trim();
  }

  return lines
    .map((segments) =>
      segments
        .filter((segment) => !getAutoCurrencySummaryType(segment))
        .map((segment) => segment.trim())
        .filter(Boolean)
        .join(" | "),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

const hasNumericValue = (value) =>
  value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

const amountsReconcile = (left, right) => {
  const leftAmount = Number(left);
  const rightAmount = Number(right);
  const tolerance = Math.max(0.05, Math.abs(rightAmount) * 0.000001);

  return Math.abs(leftAmount - rightAmount) <= tolerance;
};

const buildPaxRateLines = (item = {}, baseCurrency = "PKR") => {
  const multiCitySectors =
    cleanText(item?.ticketDetails?.journeyType).toLowerCase() === "multi_city" &&
    Array.isArray(item?.ticketDetails?.sectors)
      ? item.ticketDetails.sectors
      : [];
  const sectorRows = multiCitySectors.flatMap((sector, sectorIndex) =>
    (Array.isArray(sector?.paxPricing) ? sector.paxPricing : []).map((row) => ({
      ...row,
      sectorIndex,
    })),
  );
  const rows = (sectorRows.length > 0
    ? sectorRows
    : Array.isArray(item.paxPricing)
      ? item.paxPricing
      : []
  ).filter(
    (row) => Number(row?.count) > 0,
  );

  if (
    rows.length === 0 ||
    rows.some(
      (row) =>
        !Number.isInteger(Number(row.count)) ||
        !hasNumericValue(row.sellingPrice) ||
        Number(row.sellingPrice) < 0,
    )
  ) {
    return [];
  }

  const sourceTotal = rows.reduce(
    (sum, row) => sum + Number(row.count) * Number(row.sellingPrice),
    0,
  );
  const sourceReconciles =
    hasNumericValue(item.sellingPrice) && amountsReconcile(sourceTotal, item.sellingPrice);
  const rowsHaveBaseTotals = rows.every((row) => hasNumericValue(row.estimatedSellingBase));
  const baseTotal = rows.reduce(
    (sum, row) => sum + Number(row.estimatedSellingBase || 0),
    0,
  );
  const baseReconciles =
    rowsHaveBaseTotals &&
    hasNumericValue(item.estimatedSellingBase) &&
    amountsReconcile(baseTotal, item.estimatedSellingBase);

  if (!sourceReconciles && !baseReconciles) {
    return [];
  }

  const currency = String(item.sellingCurrency || baseCurrency || "PKR").toUpperCase();

  if (sectorRows.length > 0) {
    return rows.map((row) => {
      const paxLabel = humanize(row.paxType || "adult");
      return `Sector ${row.sectorIndex + 1} ${paxLabel}: ${Number(row.count)} Ã— ${formatMoney(Number(row.sellingPrice), currency)}`;
    });
  }

  const groupedRates = new Map();

  rows.forEach((row) => {
    const rate = Number(row.sellingPrice);
    const key = `${currency}:${rate.toFixed(2)}`;
    const current = groupedRates.get(key) || { count: 0, rate };

    current.count += Number(row.count);
    groupedRates.set(key, current);
  });

  return Array.from(groupedRates.values()).map(
    ({ count, rate }) => `${count} × ${formatMoney(rate, currency)}`,
  );
};

const getAccountLabel = (account) => {
  if (!account) return "";

  if (typeof account !== "object") {
    return "";
  }

  return joinValues(account.name, account.code);
};

const buildTravelHeader = (settings = {}, headerSettings = {}) => {
  const logoUrl = getLogoUrl(headerSettings);
  const showBusinessDetails = settings.showHeader !== false;

  if (!showBusinessDetails && !logoUrl) return null;

  return {
    companyName: showBusinessDetails ? headerSettings.companyName || "" : "",
    address:
      showBusinessDetails && headerSettings.showCompanyAddress
        ? headerSettings.address || ""
        : "",
    phone:
      showBusinessDetails && headerSettings.showCompanyPhone
        ? headerSettings.phone || ""
        : "",
    taxNumber:
      showBusinessDetails && headerSettings.showTaxNumber
        ? headerSettings.taxNumber || ""
        : "",
    logoUrl,
  };
};

const buildSharedTravelPrintShell = (printSetting) => {
  if (!printSetting?.travelInvoice) {
    throw new Error("Travel print settings missing");
  }

  const doc = printSetting.travelInvoice;
  const settings = doc.settings || {};
  const headerSettings = doc.header || {};
  const layout = doc.layout || {};

  return {
    header: buildTravelHeader(settings, headerSettings),
    footer:
      settings.showFooter === false
        ? null
        : {
            message: headerSettings.footerMessage || "",
            showStamp: settings.showStamp !== false,
          },
    page: {
      pageWidth: layout.pageWidth || "standard",
    },
  };
};

const getItemTravelers = (booking, item, topTravelerIndex) => {
  const travelersById = new Map(
    (booking.travelers || []).map((traveler) => [
      String(traveler?._id || traveler),
      traveler,
    ]),
  );

  return (item.travelerIds || [])
    .map((traveler) => {
      if (traveler && typeof traveler === "object") {
        return {
          name: getName(traveler),
          traveler,
        };
      }

      const resolvedTraveler = travelersById.get(String(traveler));

      return {
        name: getName(resolvedTraveler),
        traveler: resolvedTraveler || traveler,
      };
    })
    .filter(
      ({ name, traveler }) =>
        name && !isTopTraveler(traveler, name, topTravelerIndex),
    )
    .map(({ name }) => name)
    .join(", ");
};

const summarizePassengerRows = (rows = [], topTravelerIndex) =>
  rows
    .map((row) => {
      const passengerName = row.passengerName || getName(row.travelerId);
      const displayName = isTopTraveler(
        row.travelerId,
        passengerName,
        topTravelerIndex,
      )
        ? ""
        : passengerName;

      return joinValues(
        displayName,
        row.passportNumber,
        row.pnr,
        row.ticketNumber || row.reference,
      );
    })
    .filter(Boolean);

const cleanBaggage = (value) => cleanText(value);

const buildTicketBaggageDetails = (ticket = {}) => {
  const sharedBaggage = cleanBaggage(ticket.baggage);
  const passengerTickets = Array.isArray(ticket.passengerTickets)
    ? ticket.passengerTickets
    : [];
  const passengerBaggage = passengerTickets
    .map((passenger, index) => ({
      baggage: cleanBaggage(passenger.baggage),
      index,
      passenger,
    }))
    .filter(({ baggage }) => baggage);
  const normalizedPassengerBaggage = new Set(
    passengerBaggage.map(({ baggage }) => baggage.toLowerCase()),
  );

  if (
    !sharedBaggage &&
    passengerBaggage.length > 0 &&
    passengerBaggage.length === passengerTickets.length &&
    normalizedPassengerBaggage.size === 1
  ) {
    return [`Baggage: ${passengerBaggage[0].baggage}`];
  }

  const details = sharedBaggage ? [`Baggage: ${sharedBaggage}`] : [];
  const normalizedSharedBaggage = sharedBaggage.toLowerCase();

  passengerBaggage.forEach(({ baggage, index, passenger }) => {
    if (normalizedSharedBaggage && baggage.toLowerCase() === normalizedSharedBaggage) {
      return;
    }

    const passengerLabel =
      passenger.passengerName ||
      getName(passenger.travelerId) ||
      passenger.passportNumber ||
      passenger.ticketNumber ||
      passenger.pnr ||
      `Passenger ${index + 1}`;

    details.push(`Baggage (${passengerLabel}): ${baggage}`);
  });

  return details;
};

const getLocationName = (value, populatedValue) =>
  cleanText(value) || getDisplayName(populatedValue);

const buildRoute = (origin, destination) => {
  const from = cleanText(origin);
  const to = cleanText(destination);

  if (from && to) return `${from} to ${to}`;
  return from || to;
};

const formatCount = (value, singular, plural = `${singular}s`) => {
  const count = Number(value);

  if (!Number.isFinite(count) || count <= 0) return "";
  return `${count} ${count === 1 ? singular : plural}`;
};

const getRoomType = (room = {}) =>
  cleanText(room.customRoomType) || cleanText(room.roomType);

const buildRoomLines = (roomPricing = [], fallback = {}) => {
  const rooms = Array.isArray(roomPricing) ? roomPricing : [];
  const grouped = new Map();

  rooms.forEach((room) => {
    const roomType = getRoomType(room);
    const quantity = Number(room?.quantity);
    const occupancy = Number(room?.occupancy);

    if (!roomType && !(Number.isFinite(quantity) && quantity > 0)) return;

    const key = `${roomType.toLowerCase()}|${Number.isFinite(occupancy) ? occupancy : 0}`;
    const current = grouped.get(key) || {
      roomType,
      quantity: 0,
      occupancy: Number.isFinite(occupancy) && occupancy > 0 ? occupancy : 0,
    };

    current.quantity += Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
    grouped.set(key, current);
  });

  if (grouped.size > 0) {
    return Array.from(grouped.values()).map(({ roomType, quantity, occupancy }) => {
      const parts = [];

      if (roomType) parts.push(`Room Type: ${humanize(roomType)}`);
      if (quantity > 0) parts.push(`Rooms: ${quantity}`);
      if (occupancy > 0) parts.push(`Occupancy: ${occupancy}`);

      return parts.join(" - ");
    });
  }

  const roomType = cleanText(fallback.roomType);
  const quantity = Number(fallback.rooms);
  const adults = Number(fallback.adults);
  const children = Number(fallback.children);
  const showQuantity = Number.isFinite(quantity) && quantity > 0 && (quantity > 1 || roomType);
  const occupancy = [];

  if (Number.isFinite(adults) && adults > 0 && (adults > 1 || children > 0)) {
    occupancy.push(formatCount(adults, "Adult"));
  }
  if (Number.isFinite(children) && children > 0) {
    occupancy.push(formatCount(children, "Child", "Children"));
  }

  return [
    roomType ? `Room Type: ${humanize(roomType)}` : "",
    showQuantity ? `Rooms: ${quantity}` : "",
    occupancy.length > 0 ? `Occupancy: ${occupancy.join(", ")}` : "",
  ].filter(Boolean);
};

const getPassengerLabel = (passenger, index, topTravelerIndex) => {
  const passengerName = cleanText(
    passenger?.passengerName || getName(passenger?.travelerId),
  );

  if (passengerName && !isTopTraveler(
    passenger?.travelerId,
    passengerName,
    topTravelerIndex,
  )) {
    return passengerName;
  }

  return `Passenger ${index + 1}`;
};

const buildPassengerFlightDetails = (ticket = {}, topTravelerIndex) => {
  const canShowReturn = cleanText(ticket.journeyType).toLowerCase() === "round_trip";
  const shared = {
    airline: getDisplayName(ticket.airlineId, ticket.airline),
    route: buildRoute(
      getLocationName(ticket.origin, ticket.originAirportId),
      getLocationName(ticket.destination, ticket.destinationAirportId),
    ),
    departure: formatDateTime(ticket.departureDateTime),
    returnRoute: canShowReturn
      ? buildRoute(
          getLocationName(ticket.returnOrigin, ticket.returnOriginAirportId),
          getLocationName(ticket.returnDestination, ticket.returnDestinationAirportId),
        )
      : "",
    returnDate: canShowReturn ? formatDateTime(ticket.returnDateTime) : "",
    travelClass: cleanText(ticket.travelClass),
  };

  const rows = (Array.isArray(ticket.passengerTickets) ? ticket.passengerTickets : [])
    .map((passenger, index) => {
      const passengerValues = {
        airline: getDisplayName(passenger.airlineId, passenger.airline),
        route: buildRoute(
          getLocationName(passenger.origin, passenger.originAirportId),
          getLocationName(passenger.destination, passenger.destinationAirportId),
        ),
        departure: formatDateTime(passenger.departureDateTime),
        returnRoute: canShowReturn
          ? buildRoute(
              getLocationName(passenger.returnOrigin, passenger.returnOriginAirportId),
              getLocationName(passenger.returnDestination, passenger.returnDestinationAirportId),
            )
          : "",
        returnDate: canShowReturn ? formatDateTime(passenger.returnDateTime) : "",
        travelClass: cleanText(passenger.travelClass),
      };
      const differingValues = Object.entries(passengerValues)
        .filter(([key, value]) => value && value.toLowerCase() !== shared[key].toLowerCase())
        .map(([key, value]) => {
          const labels = {
            airline: "Airline",
            route: "Route",
            departure: "Departure",
            returnRoute: "Return Route",
            returnDate: "Return",
            travelClass: "Class",
          };

          return `${labels[key]}: ${value}`;
        });

      return differingValues.length > 0
        ? {
            label: getPassengerLabel(passenger, index, topTravelerIndex),
            values: differingValues,
          }
        : null;
    })
    .filter(Boolean);
  const grouped = new Map();

  rows.forEach((row) => {
    const key = row.values.join("|").toLowerCase();
    const current = grouped.get(key) || { labels: [], values: row.values };

    current.labels.push(row.label);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map(({ labels, values }) => {
    const label = labels.length === 1
      ? labels[0]
      : labels.every((value) => /^Passenger \d+$/.test(value))
        ? `Passengers ${labels.map((value) => value.replace("Passenger ", "")).join(", ")}`
        : `Passengers ${labels.join(", ")}`;

    return `Flight (${label}): ${values.join(", ")}`;
  });
};

const normalizeDetail = (value) => cleanText(value).toLowerCase();

const dedupeDetails = (details) => {
  const seen = new Set();

  return details.filter((detail) => {
    const normalized = normalizeDetail(detail);

    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
};

const pushTextLines = (details, value, prefix = "") => {
  String(value || "")
    .split(/\r?\n/)
    .map(cleanText)
    .filter(Boolean)
    .forEach((line) => details.push(`${prefix}${line}`));
};

const getPlannerStay = (plannerInfo, city) => {
  if (!plannerInfo || typeof plannerInfo !== "object") return null;
  const stays = Array.isArray(plannerInfo.stays)
    ? plannerInfo.stays
    : Array.isArray(plannerInfo.itinerary)
      ? plannerInfo.itinerary.filter((entry) => entry?.type === "stay")
      : [];

  return stays.find(
    (stay) => cleanText(stay?.city).toLowerCase() === city.toLowerCase(),
  ) || null;
};

const getUmrahHotelComponent = (components, city) =>
  components.find((component) => {
    if (cleanText(component?.componentType).toLowerCase() !== "hotel") return false;
    const componentCity = cleanText(
      component?.hotelPricing?.city || component?.hotelId?.city,
    ).toLowerCase();

    return componentCity === city.toLowerCase();
  }) || null;

const buildUmrahStayDetails = (umrah, city) => {
  const cityLabel = humanize(city);
  const components = Array.isArray(umrah.components) ? umrah.components : [];
  const component = getUmrahHotelComponent(components, city);
  const plannerStay = getPlannerStay(umrah.plannerInfo, city);
  const topHotel = city === "makkah" ? umrah.makkahHotelId : umrah.madinahHotelId;
  const hotelName = getDisplayName(topHotel) || getDisplayName(component?.hotelId);
  const pricing = component?.hotelPricing || {};
  const checkIn = formatDate(pricing.checkIn || plannerStay?.isoCheckIn || plannerStay?.checkIn);
  const checkOut = formatDate(
    pricing.checkOut || plannerStay?.isoCheckOutDay || plannerStay?.checkOut,
  );
  const nights = formatStayNights(resolveUmrahCityNights(umrah, city));
  const details = [];

  if (hotelName) details.push(`${cityLabel} Hotel: ${hotelName}`);
  if (checkIn) details.push(`${cityLabel} Check-in: ${checkIn}`);
  if (checkOut) details.push(`${cityLabel} Check-out: ${checkOut}`);
  if (nights) details.push(`${cityLabel} Stay: ${nights}`);
  buildRoomLines(pricing.roomPricing).forEach((room) =>
    details.push(`${cityLabel} ${room}`),
  );

  return details;
};

const buildItemDetails = (booking, item) => {
  const details = [];
  const type = String(item.itemType || "").toLowerCase();
  const topTravelerIndex = buildTopTravelerIndex(booking);
  const travelers = getItemTravelers(booking, item, topTravelerIndex);

  if (travelers) {
    details.push(`Travelers: ${travelers}`);
  }

  if (type === "air_ticket") {
    const ticket = item.ticketDetails || {};
    const isMultiCity = cleanText(ticket.journeyType).toLowerCase() === "multi_city";
    const hasMultiCitySectors =
      isMultiCity && Array.isArray(ticket.sectors) && ticket.sectors.length > 0;
    const airline = getDisplayName(ticket.airlineId, ticket.airline);
    const route = buildRoute(
      getLocationName(ticket.origin, ticket.originAirportId),
      getLocationName(ticket.destination, ticket.destinationAirportId),
    );
    const returnRoute = buildRoute(
      getLocationName(ticket.returnOrigin, ticket.returnOriginAirportId),
      getLocationName(ticket.returnDestination, ticket.returnDestinationAirportId),
    );

    if (hasMultiCitySectors) {
      (ticket.sectors || []).forEach((sector, sectorIndex) => {
        const sectorAirline = getDisplayName(sector.airlineId, sector.airline);
        const sectorRoute = buildRoute(
          getLocationName(sector.origin, sector.originAirportId),
          getLocationName(sector.destination, sector.destinationAirportId),
        );
        const sectorDeparture = formatDateTime(sector.departureDateTime);
        const values = [sectorAirline, sectorRoute, sectorDeparture].filter(Boolean);
        if (values.length > 0) details.push(`Sector ${sectorIndex + 1}: ${values.join(" | ")}`);
      });
    } else {
      if (airline) details.push(`Airline: ${airline}`);
      if (route) details.push(`Route: ${route}`);
      if (formatDateTime(ticket.departureDateTime)) {
        details.push(`Departure: ${formatDateTime(ticket.departureDateTime)}`);
      }
      const canShowReturn = cleanText(ticket.journeyType).toLowerCase() === "round_trip";

      if (canShowReturn && returnRoute) details.push(`Return Route: ${returnRoute}`);
      if (canShowReturn && formatDateTime(ticket.returnDateTime)) {
        details.push(`Return: ${formatDateTime(ticket.returnDateTime)}`);
      }
    }
    if (cleanText(ticket.travelClass)) details.push(`Class: ${cleanText(ticket.travelClass)}`);
    if (cleanText(ticket.pnr)) details.push(`PNR: ${cleanText(ticket.pnr)}`);
    if (cleanText(ticket.ticketNumber)) {
      details.push(`Ticket Number: ${cleanText(ticket.ticketNumber)}`);
    }

    summarizePassengerRows(ticket.passengerTickets, topTravelerIndex).forEach((row) =>
      details.push(`Passenger Details: ${row}`),
    );

    if (!hasMultiCitySectors) {
      buildPassengerFlightDetails(ticket, topTravelerIndex).forEach((row) =>
        details.push(row),
      );
    }

    buildTicketBaggageDetails(ticket).forEach((row) => details.push(row));
  }

  if (type === "visit_visa") {
    const visa = item.visaDetails || {};

    if (cleanText(visa.country)) details.push(`Country: ${cleanText(visa.country)}`);
    if (cleanText(visa.visaType)) details.push(`Visa Type: ${cleanText(visa.visaType)}`);
    if (cleanText(visa.duration)) details.push(`Duration: ${cleanText(visa.duration)}`);
    if (cleanText(visa.passportNumber)) {
      details.push(`Passport: ${cleanText(visa.passportNumber)}`);
    }
    if (cleanText(visa.reference)) details.push(`Reference: ${cleanText(visa.reference)}`);

    summarizePassengerRows(visa.travelerVisas, topTravelerIndex).forEach((row) =>
      details.push(`Passenger Visa: ${row}`),
    );
  }

  if (type === "hotel") {
    const hotel = item.hotelDetails || {};
    const hotelName = getDisplayName(hotel.hotelId);
    const city = cleanText(hotel.city || hotel.hotelId?.city);
    const nights = safeNumber(hotel.nights);
    const stayLabel = nights > 0 ? `${nights} ${nights === 1 ? "Night" : "Nights"}` : "";

    if (hotelName) details.push(`Hotel: ${hotelName}`);
    if (city) details.push(`City: ${city}`);
    if (formatDate(hotel.checkIn)) details.push(`Check-in: ${formatDate(hotel.checkIn)}`);
    if (formatDate(hotel.checkOut)) details.push(`Check-out: ${formatDate(hotel.checkOut)}`);
    if (stayLabel) details.push(`Stay: ${stayLabel}`);
    buildRoomLines(hotel.roomPricing, hotel).forEach((room) =>
      details.push(room),
    );
    if (cleanText(hotel.confirmationNumber)) {
      details.push(`Confirmation: ${cleanText(hotel.confirmationNumber)}`);
    }
  }

  if (type === "umrah_package") {
    const umrah = item.umrahDetails || {};

    const components = Array.isArray(umrah.components) ? umrah.components : [];

    if (cleanText(umrah.packageName)) {
      details.push(`Package: ${cleanText(umrah.packageName)}`);
    }
    if (formatDate(umrah.departureDate)) {
      details.push(`Departure Date: ${formatDate(umrah.departureDate)}`);
    }
    if (formatDate(umrah.returnDate)) {
      details.push(`Return Date: ${formatDate(umrah.returnDate)}`);
    }
    buildUmrahStayDetails(umrah, "makkah").forEach((row) => details.push(row));
    buildUmrahStayDetails(umrah, "madinah").forEach((row) => details.push(row));

    components.forEach((component) => {
      const componentType = cleanText(component.componentType).toLowerCase();
      const label = cleanText(component.label) || getDisplayName(component.serviceId);
      const hotelName = getDisplayName(component.hotelId);
      const includedLabel = label || hotelName || humanize(componentType);

      if (componentType !== "hotel" && includedLabel) {
        details.push(`Included ${humanize(componentType) || "Service"}: ${includedLabel}`);
      } else if (componentType === "hotel" && label && label !== hotelName) {
        details.push(`Included Hotel: ${label}`);
      }
      if (cleanText(component.notes)) {
        pushTextLines(
          details,
          sanitizeCustomerFacingDescription(component.notes),
          `Component Notes${includedLabel ? ` (${includedLabel})` : ""}: `,
        );
      }
    });
  }

  if (type === "transport") {
    const transport = item.transportDetails || {};

    const route = buildRoute(transport.pickup, transport.dropoff);

    if (route) details.push(`Route: ${route}`);
    if (formatDateTime(transport.dateTime)) {
      details.push(`Date/Time: ${formatDateTime(transport.dateTime)}`);
    }
    if (cleanText(transport.vehicleType)) {
      details.push(`Vehicle: ${cleanText(transport.vehicleType)}`);
    }
  }

  if (item.description) {
    pushTextLines(details, sanitizeCustomerFacingDescription(item.description));
  }

  return dedupeDetails(details);
};

const buildTravelInvoicePrint = (booking, printSetting) => {
  if (!printSetting?.travelInvoice) {
    throw new Error("Travel invoice print settings missing");
  }

  const doc = printSetting.travelInvoice;
  const settings = doc.settings || {};
  const headerSettings = doc.header || {};
  const layout = doc.layout || {};
  const currency = booking.baseCurrency || "PKR";
  const customer = booking.customer || booking.customerPartyId || booking.customerId;

  return {
    documentTitle: "Travel Invoice",
    header: buildTravelHeader(settings, headerSettings),
    documentInfo: {
      invoiceNumber: booking.invoiceNumber || booking.bookingNumber || "",
      bookingNumber: booking.bookingNumber || "",
      date: formatDate(booking.invoiceDate || booking.createdAt),
      status: humanize(booking.status),
      serviceType: humanize(booking.serviceType || "mixed"),
    },
    customer: {
      name: getName(customer, "Customer"),
      phone: customer?.phone || "",
      email: customer?.email || "",
    },
    travelers: (booking.travelers || []).map((traveler) => ({
      name: getName(traveler),
      passportNumber: traveler.passportNumber || "",
      mobile: traveler.mobile || "",
    })),
    items: (booking.bookingItems || []).map((item, index) => {
      const paxRateLines = buildPaxRateLines(item, currency);

      return {
        index: index + 1,
        type: humanize(item.itemType || "service"),
        title: item.title || getName(item.serviceId) || humanize(item.itemType),
        details: buildItemDetails(booking, item),
        paxRateLines: paxRateLines.length > 0 ? paxRateLines : ["—"],
        amount: formatMoney(
          item.estimatedSellingBase ?? item.sellingPrice,
          item.estimatedSellingBase !== undefined
            ? currency
            : item.sellingCurrency || currency,
        ),
      };
    }),
    ledgerDescription: String(booking.ledgerDescription || "").trim(),
    totals: {
      sale: formatMoney(booking.sellingTotal, currency),
      discount:
        safeNumber(booking.discountAmount) > 0
          ? formatMoney(booking.discountAmount, currency)
          : null,
      netSale: formatMoney(booking.netSale, currency),
      received: settings.showPaid === false ? null : formatMoney(booking.receivedAmount, currency),
      due: settings.showBalance === false ? null : formatMoney(booking.customerDue, currency),
      refunded:
        safeNumber(booking.customerRefundedAmount || booking.refundedAmount) > 0
          ? formatMoney(
              booking.customerRefundedAmount || booking.refundedAmount,
              currency,
            )
          : null,
    },
    notes: booking.notes || "",
    footer:
      settings.showFooter === false
        ? null
        : {
            message: headerSettings.footerMessage || "",
            showStamp: settings.showStamp !== false,
          },
    page: {
      pageWidth: layout.pageWidth || "standard",
    },
  };
};

const buildTravelPaymentReceiptPrint = (payment, printSetting) => {
  const isVendor = payment.documentType === "vendor";
  const currency = payment.currency || "PKR";

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: isVendor
      ? "Travel Vendor Payment Receipt"
      : "Travel Customer Payment Receipt",
    documentInfo: {
      number: payment.receiptNumber || payment.referenceNo || "",
      date: formatDate(payment.date),
      time: payment.time || "",
      relatedInvoice: payment.invoiceNo || "",
    },
    party: {
      label: isVendor ? "Vendor" : "Customer",
      name: getName(payment.party, isVendor ? "Vendor" : "Customer"),
      phone: payment.party?.phone || "",
      email: payment.party?.email || "",
    },
    payment: {
      amount: formatMoney(payment.amount, currency),
      method: humanize(payment.paymentMethod),
      account: getAccountLabel(payment.paymentAccount),
      reference: payment.referenceNo || payment.receiptNumber || "",
      notes: payment.notes || "",
      handledBy: payment.handledBy || "",
    },
  };
};

const buildTravelRefundPrint = (refund, printSetting) => {
  const currency = refund.baseCurrency || refund.originalInvoiceId?.baseCurrency || "PKR";
  const customer = refund.customer || refund.customerPartyId || refund.customerId;

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: "Travel Refund",
    documentInfo: {
      number: refund.refundNumber || "",
      date: formatDate(refund.refundDate),
      time: refund.refundTime || "",
      originalInvoice:
        refund.originalInvoiceNumber ||
        refund.originalInvoiceId?.invoiceNumber ||
        refund.originalInvoiceId?.bookingNumber ||
        "",
    },
    customer: {
      name: getName(customer, "Customer"),
      phone: customer?.phone || "",
      email: customer?.email || "",
    },
    items: (refund.refundItems || []).map((item, index) => ({
      index: index + 1,
      title: item.title || humanize(item.itemType || "service"),
      type: humanize(item.itemType || "service"),
      originalAmount: formatMoney(item.originalAmount, currency),
      refundAmount: formatMoney(item.refundAmount, currency),
    })),
    totals: {
      grossRefundAmount: formatMoney(refund.grossRefundAmount, currency),
      penaltyAmount:
        safeNumber(refund.penaltyAmount) > 0
          ? formatMoney(refund.penaltyAmount, currency)
          : null,
      customerRefundAmount: formatMoney(refund.customerRefundAmount, currency),
      paidBackAmount:
        safeNumber(refund.paidBackAmount) > 0
          ? formatMoney(refund.paidBackAmount, currency)
          : null,
    },
    payment: {
      method: humanize(refund.paymentType),
      account: getAccountLabel(refund.accountId),
    },
    notes: refund.notes || "",
  };
};

const buildTravelVendorReturnPrint = (vendorReturn, printSetting) => {
  const currency =
    vendorReturn.baseCurrency || vendorReturn.originalInvoiceId?.baseCurrency || "PKR";
  const vendor = vendorReturn.vendor || vendorReturn.vendorPartyId || vendorReturn.vendorId;

  return {
    ...buildSharedTravelPrintShell(printSetting),
    documentTitle: "Travel Vendor Return",
    documentInfo: {
      number: vendorReturn.returnNumber || "",
      date: formatDate(vendorReturn.returnDate),
      time: vendorReturn.returnTime || "",
      originalInvoice:
        vendorReturn.originalInvoiceNumber ||
        vendorReturn.originalInvoiceId?.invoiceNumber ||
        vendorReturn.originalInvoiceId?.bookingNumber ||
        "",
    },
    vendor: {
      name: getName(vendor, "Vendor"),
      phone: vendor?.phone || "",
      email: vendor?.email || "",
    },
    service: {
      label: vendorReturn.serviceLabel || "Travel service",
      originalCost: formatMoney(vendorReturn.originalCost, currency),
      vendorReturnAmount: formatMoney(vendorReturn.vendorReturnAmount, currency),
      vendorPenaltyAmount:
        safeNumber(vendorReturn.vendorPenaltyAmount) > 0
          ? formatMoney(vendorReturn.vendorPenaltyAmount, currency)
          : null,
      amountReceivedNow:
        safeNumber(vendorReturn.amountReceivedNow) > 0
          ? formatMoney(vendorReturn.amountReceivedNow, currency)
          : null,
      paymentMethod: humanize(vendorReturn.paymentType),
      paymentAccount: getAccountLabel(vendorReturn.accountId),
    },
    notes: vendorReturn.notes || "",
  };
};

module.exports = {
  buildTravelInvoicePrint,
  buildTravelPaymentReceiptPrint,
  buildTravelRefundPrint,
  buildTravelVendorReturnPrint,
};
