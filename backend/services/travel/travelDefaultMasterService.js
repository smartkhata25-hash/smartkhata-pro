const mongoose = require("mongoose");

const TravelAirline = require("../../models/TravelAirline");
const TravelAirport = require("../../models/TravelAirport");
const TravelHotel = require("../../models/TravelHotel");

const travelAirlines = require("../../data/travelAirlines");
const travelAirports = require("../../data/travelAirports");
const travelDefaultHotels = require("../../data/travelDefaultHotels");

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeNameKey = (value = "") => normalizeText(value).toLowerCase();

const normalizeUpper = (value = "") => normalizeText(value).toUpperCase();

const normalizeHotelKey = (name = "", city = "") =>
  `${normalizeNameKey(name)}::${normalizeNameKey(city)}`;

const normalizeAliases = (aliases = []) => {
  if (!Array.isArray(aliases)) {
    return [];
  }

  const seen = new Set();

  return aliases
    .map((alias) => normalizeText(alias))
    .filter((alias) => {
      if (!alias) {
        return false;
      }

      const key = alias.toLowerCase();

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    });
};

const ensureValidUserId = (userId) => {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    const error = new Error(
      "Valid user ID is required to initialize travel master data",
    );

    error.statusCode = 400;

    throw error;
  }

  return new mongoose.Types.ObjectId(String(userId));
};

const createEmptyResult = () => ({
  totalDefaults: 0,
  existing: 0,
  created: 0,
  skipped: 0,
});

const createResult = ({ totalDefaults, existing, created }) => ({
  totalDefaults,
  existing,
  created,
  skipped: Math.max(totalDefaults - created, 0),
});

const prepareDefaultAirlines = () => {
  const seenNames = new Set();

  const prepared = [];

  for (const sourceAirline of travelAirlines) {
    const name = normalizeText(sourceAirline?.name);

    if (!name) {
      continue;
    }

    const nameKey = normalizeNameKey(name);

    if (!nameKey || seenNames.has(nameKey)) {
      continue;
    }

    seenNames.add(nameKey);

    prepared.push({
      name,
      iataCode: normalizeUpper(sourceAirline?.iataCode),
      icaoCode: normalizeUpper(sourceAirline?.icaoCode),
      country: normalizeText(sourceAirline?.country),
      aliases: normalizeAliases(sourceAirline?.aliases),
      notes: normalizeText(sourceAirline?.notes),
      isActive: sourceAirline?.isActive !== false,
      isDefault: true,
    });
  }

  return prepared;
};

const prepareDefaultAirports = () => {
  const seenNames = new Set();

  const seenIataCodes = new Set();

  const prepared = [];

  for (const sourceAirport of travelAirports) {
    const name = normalizeText(sourceAirport?.name);

    const iataCode = normalizeUpper(sourceAirport?.iataCode);

    if (!name || !/^[A-Z]{3}$/.test(iataCode)) {
      continue;
    }

    const nameKey = normalizeNameKey(name);

    if (!nameKey) {
      continue;
    }

    if (seenNames.has(nameKey) || seenIataCodes.has(iataCode)) {
      continue;
    }

    seenNames.add(nameKey);

    seenIataCodes.add(iataCode);

    prepared.push({
      name,
      iataCode,
      icaoCode: normalizeUpper(sourceAirport?.icaoCode),
      city: normalizeText(sourceAirport?.city),
      country: normalizeText(sourceAirport?.country),
      countryCode: normalizeUpper(sourceAirport?.countryCode),
      aliases: normalizeAliases(sourceAirport?.aliases),
      notes: normalizeText(sourceAirport?.notes),
      isActive: sourceAirport?.isActive !== false,
      isDefault: true,
    });
  }

  return prepared;
};

const prepareDefaultHotels = () => {
  const seenHotels = new Set();

  const prepared = [];

  for (const sourceHotel of travelDefaultHotels) {
    const name = normalizeText(sourceHotel?.name);

    const city = normalizeText(sourceHotel?.city);

    if (!name || !city) {
      continue;
    }

    const hotelKey = normalizeHotelKey(name, city);

    if (seenHotels.has(hotelKey)) {
      continue;
    }

    seenHotels.add(hotelKey);

    const rawStarRating = Number(sourceHotel?.starRating);

    const starRating =
      Number.isInteger(rawStarRating) &&
      rawStarRating >= 1 &&
      rawStarRating <= 5
        ? rawStarRating
        : null;

    const rawRate = Number(sourceHotel?.defaultRate);

    prepared.push({
      name,
      city,
      country: normalizeText(sourceHotel?.country || "Saudi Arabia"),
      starRating,
      vendorId: null,
      distanceText: normalizeText(sourceHotel?.distanceText),
      defaultRate: Number.isFinite(rawRate) && rawRate >= 0 ? rawRate : 0,
      currency: normalizeUpper(sourceHotel?.currency || "SAR"),
      address: normalizeText(sourceHotel?.address),
      contact: normalizeText(sourceHotel?.contact),
      notes: normalizeText(sourceHotel?.notes),
      isActive: sourceHotel?.isActive !== false,
    });
  }

  return prepared;
};

const buildDefaultDocument = ({
  userId,
  data,
  now,
  includeIsDefault = true,
}) => {
  const document = {
    ...data,
    userId,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    deleteReason: "",
    createdAt: now,
    updatedAt: now,
  };

  if (includeIsDefault) {
    document.isDefault = true;
  } else {
    delete document.isDefault;
  }

  return document;
};

const ensureDefaultTravelAirlines = async (userId) => {
  const normalizedUserId = ensureValidUserId(userId);

  const defaults = prepareDefaultAirlines();

  if (!defaults.length) {
    return createEmptyResult();
  }

  const existingAirlines = await TravelAirline.find({
    userId: normalizedUserId,
  })
    .select("name iataCode isDeleted")
    .lean();

  const existingNameKeys = new Set(
    existingAirlines
      .map((airline) => normalizeNameKey(airline.name))
      .filter(Boolean),
  );

  const missingAirlines = defaults.filter(
    (airline) => !existingNameKeys.has(normalizeNameKey(airline.name)),
  );

  if (!missingAirlines.length) {
    return createResult({
      totalDefaults: defaults.length,
      existing: existingAirlines.length,
      created: 0,
    });
  }

  const now = new Date();

  const documents = missingAirlines.map((airline) =>
    buildDefaultDocument({
      userId: normalizedUserId,
      data: airline,
      now,
    }),
  );

  let createdCount = 0;

  try {
    const createdAirlines = await TravelAirline.insertMany(documents, {
      ordered: false,
    });

    createdCount = createdAirlines.length;
  } catch (error) {
    if (error?.code !== 11000 && !error?.writeErrors?.length) {
      throw error;
    }

    const refreshedAirlines = await TravelAirline.find({
      userId: normalizedUserId,
    })
      .select("name")
      .lean();

    const refreshedKeys = new Set(
      refreshedAirlines
        .map((airline) => normalizeNameKey(airline.name))
        .filter(Boolean),
    );

    createdCount = missingAirlines.filter((airline) =>
      refreshedKeys.has(normalizeNameKey(airline.name)),
    ).length;
  }

  return createResult({
    totalDefaults: defaults.length,
    existing: existingAirlines.length,
    created: createdCount,
  });
};

const ensureDefaultTravelAirports = async (userId) => {
  const normalizedUserId = ensureValidUserId(userId);

  const defaults = prepareDefaultAirports();

  if (!defaults.length) {
    return createEmptyResult();
  }

  const existingAirports = await TravelAirport.find({
    userId: normalizedUserId,
  })
    .select("name iataCode isDeleted")
    .lean();

  const existingNameKeys = new Set();

  const existingIataCodes = new Set();

  existingAirports.forEach((airport) => {
    const nameKey = normalizeNameKey(airport.name);

    const iataCode = normalizeUpper(airport.iataCode);

    if (nameKey) {
      existingNameKeys.add(nameKey);
    }

    if (iataCode) {
      existingIataCodes.add(iataCode);
    }
  });

  const missingAirports = defaults.filter((airport) => {
    const nameKey = normalizeNameKey(airport.name);

    const iataCode = normalizeUpper(airport.iataCode);

    return !existingNameKeys.has(nameKey) && !existingIataCodes.has(iataCode);
  });

  if (!missingAirports.length) {
    return createResult({
      totalDefaults: defaults.length,
      existing: existingAirports.length,
      created: 0,
    });
  }

  const now = new Date();

  const documents = missingAirports.map((airport) =>
    buildDefaultDocument({
      userId: normalizedUserId,
      data: airport,
      now,
    }),
  );

  let createdCount = 0;

  try {
    const createdAirports = await TravelAirport.insertMany(documents, {
      ordered: false,
    });

    createdCount = createdAirports.length;
  } catch (error) {
    if (error?.code !== 11000 && !error?.writeErrors?.length) {
      throw error;
    }

    const refreshedAirports = await TravelAirport.find({
      userId: normalizedUserId,
    })
      .select("iataCode")
      .lean();

    const refreshedIataCodes = new Set(
      refreshedAirports
        .map((airport) => normalizeUpper(airport.iataCode))
        .filter(Boolean),
    );

    createdCount = missingAirports.filter((airport) =>
      refreshedIataCodes.has(normalizeUpper(airport.iataCode)),
    ).length;
  }

  return createResult({
    totalDefaults: defaults.length,
    existing: existingAirports.length,
    created: createdCount,
  });
};

const ensureDefaultTravelHotels = async (userId) => {
  const normalizedUserId = ensureValidUserId(userId);

  const defaults = prepareDefaultHotels();

  if (!defaults.length) {
    return createEmptyResult();
  }

  const existingHotels = await TravelHotel.find({
    userId: normalizedUserId,
  })
    .select("name city isDeleted")
    .lean();

  const existingHotelKeys = new Set(
    existingHotels
      .map((hotel) => normalizeHotelKey(hotel.name, hotel.city))
      .filter(Boolean),
  );

  const missingHotels = defaults.filter(
    (hotel) =>
      !existingHotelKeys.has(normalizeHotelKey(hotel.name, hotel.city)),
  );

  if (!missingHotels.length) {
    return createResult({
      totalDefaults: defaults.length,
      existing: existingHotels.length,
      created: 0,
    });
  }

  const now = new Date();

  const documents = missingHotels.map((hotel) =>
    buildDefaultDocument({
      userId: normalizedUserId,
      data: hotel,
      now,
      includeIsDefault: false,
    }),
  );

  const createdHotels = await TravelHotel.insertMany(documents, {
    ordered: false,
  });

  return createResult({
    totalDefaults: defaults.length,
    existing: existingHotels.length,
    created: createdHotels.length,
  });
};

const ensureDefaultTravelMasterData = async (userId) => {
  const normalizedUserId = ensureValidUserId(userId);

  const [airlines, airports, hotels] = await Promise.all([
    ensureDefaultTravelAirlines(normalizedUserId),
    ensureDefaultTravelAirports(normalizedUserId),
    ensureDefaultTravelHotels(normalizedUserId),
  ]);

  return {
    airlines,
    airports,
    hotels,
  };
};

module.exports = {
  ensureDefaultTravelAirlines,
  ensureDefaultTravelAirports,
  ensureDefaultTravelHotels,
  ensureDefaultTravelMasterData,
};
