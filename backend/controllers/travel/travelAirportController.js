const TravelAirport = require("../../models/TravelAirport");

const { logActivity } = require("../../utils/activityLogger");

const {
  applySoftDeleteFields,
  getSoftDeleteReason,
} = require("../../services/travel/travelSoftDeleteService");

const {
  applyActiveFilter,
  cleanString,
  cleanUpperString,
  createHttpError,
  ensureObjectId,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  sendControllerError,
} = require("./travelMasterHelpers");

const {
  ensureDefaultTravelAirports,
} = require("../../services/travel/travelDefaultMasterService");

const AIRPORT_LIST_FIELDS = [
  "name",
  "iataCode",
  "icaoCode",
  "city",
  "country",
  "countryCode",
  "aliases",
  "notes",
  "isActive",
  "isDefault",
  "isDeleted",
  "deletedAt",
  "deletedBy",
  "deleteReason",
  "createdAt",
  "updatedAt",
].join(" ");

const normalizeAliases = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set();

  return value
    .map((alias) => cleanString(alias))
    .filter((alias) => {
      if (!alias) {
        return false;
      }

      const normalized = alias.toLowerCase();

      if (seen.has(normalized)) {
        return false;
      }

      seen.add(normalized);

      return true;
    });
};

const normalizeBoolean = (value, fallback = false) => {
  if (value === true || value === "true") {
    return true;
  }

  if (value === false || value === "false") {
    return false;
  }

  return fallback;
};

const validateIataCode = (value) => {
  const iataCode = cleanUpperString(value);

  if (!iataCode) {
    throw createHttpError(400, "Airport IATA code is required");
  }

  if (!/^[A-Z]{3}$/.test(iataCode)) {
    throw createHttpError(
      400,
      "Airport IATA code must contain exactly 3 letters",
    );
  }

  return iataCode;
};

const validateIcaoCode = (value) => {
  const icaoCode = cleanUpperString(value);

  if (!icaoCode) {
    return "";
  }

  if (!/^[A-Z0-9]{3,4}$/.test(icaoCode)) {
    throw createHttpError(
      400,
      "Airport ICAO code must contain 3 to 4 letters or numbers",
    );
  }

  return icaoCode;
};

const validateCountryCode = (value) => {
  const countryCode = cleanUpperString(value);

  if (!countryCode) {
    return "";
  }

  if (!/^[A-Z]{2,3}$/.test(countryCode)) {
    throw createHttpError(400, "Country code must contain 2 or 3 letters");
  }

  return countryCode;
};

const getAirportPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = cleanString(body.name);

    if (!name) {
      throw createHttpError(400, "Airport name is required");
    }

    if (name.length > 180) {
      throw createHttpError(400, "Airport name must be maximum 180 characters");
    }

    payload.name = name;
  }

  if (!partial || hasOwn(body, "iataCode")) {
    payload.iataCode = validateIataCode(body.iataCode);
  }

  if (hasOwn(body, "icaoCode")) {
    payload.icaoCode = validateIcaoCode(body.icaoCode);
  }

  if (hasOwn(body, "city")) {
    const city = cleanString(body.city);

    if (city.length > 120) {
      throw createHttpError(400, "Airport city must be maximum 120 characters");
    }

    payload.city = city;
  }

  if (hasOwn(body, "country")) {
    const country = cleanString(body.country);

    if (country.length > 120) {
      throw createHttpError(
        400,
        "Airport country must be maximum 120 characters",
      );
    }

    payload.country = country;
  }

  if (hasOwn(body, "countryCode")) {
    payload.countryCode = validateCountryCode(body.countryCode);
  }

  if (hasOwn(body, "aliases")) {
    payload.aliases = normalizeAliases(body.aliases);
  }

  if (hasOwn(body, "notes")) {
    const notes = cleanString(body.notes);

    if (notes.length > 1000) {
      throw createHttpError(
        400,
        "Airport notes must be maximum 1000 characters",
      );
    }

    payload.notes = notes;
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = normalizeBoolean(body.isActive, true);
  }

  if (hasOwn(body, "isDefault")) {
    payload.isDefault = normalizeBoolean(body.isDefault, false);
  }

  return payload;
};

const ensureDuplicateAirportDoesNotExist = async ({
  userId,
  name,
  iataCode,
  excludeId = null,
}) => {
  const orConditions = [];

  const cleanName = cleanString(name);

  const cleanIataCode = cleanUpperString(iataCode);

  if (cleanName) {
    orConditions.push({
      name: {
        $regex: `^${escapeRegex(cleanName)}$`,
        $options: "i",
      },
    });
  }

  if (cleanIataCode) {
    orConditions.push({
      iataCode: cleanIataCode,
    });
  }

  if (!orConditions.length) {
    return;
  }

  const query = {
    userId,
    isDeleted: false,
    $or: orConditions,
  };

  if (excludeId) {
    query._id = {
      $ne: excludeId,
    };
  }

  const duplicate = await TravelAirport.findOne(query)
    .select("_id name iataCode")
    .lean();

  if (!duplicate) {
    return;
  }

  const sameName =
    cleanName &&
    cleanString(duplicate.name).toLowerCase() === cleanName.toLowerCase();

  const sameIataCode =
    cleanIataCode && cleanUpperString(duplicate.iataCode) === cleanIataCode;

  if (sameIataCode) {
    throw createHttpError(
      409,
      `Airport code "${cleanIataCode}" already exists`,
    );
  }

  if (sameName) {
    throw createHttpError(409, `Airport "${duplicate.name}" already exists`);
  }

  throw createHttpError(409, "A similar airport already exists");
};

exports.getTravelAirports = async (req, res) => {
  try {
    const userId = getUserId(req);

    await ensureDefaultTravelAirports(userId);

    const {
      search = "",
      country = "",
      countryCode = "",
      city = "",
      iataCode = "",
      icaoCode = "",
      isDefault = "",
      limit,
    } = req.query;

    const query = applyActiveFilter(
      {
        userId,
      },
      req.query,
    );

    const cleanCountry = cleanString(country);

    if (cleanCountry) {
      query.country = {
        $regex: escapeRegex(cleanCountry),
        $options: "i",
      };
    }

    const cleanCountryCode = cleanUpperString(countryCode);

    if (cleanCountryCode) {
      query.countryCode = cleanCountryCode;
    }

    const cleanCity = cleanString(city);

    if (cleanCity) {
      query.city = {
        $regex: escapeRegex(cleanCity),
        $options: "i",
      };
    }

    const cleanIataCode = cleanUpperString(iataCode);

    if (cleanIataCode) {
      query.iataCode = cleanIataCode;
    }

    const cleanIcaoCode = cleanUpperString(icaoCode);

    if (cleanIcaoCode) {
      query.icaoCode = cleanIcaoCode;
    }

    if (isDefault === "true") {
      query.isDefault = true;
    }

    if (isDefault === "false") {
      query.isDefault = false;
    }

    const cleanSearch = cleanString(search);

    if (cleanSearch) {
      const safeSearch = escapeRegex(cleanSearch);

      query.$or = [
        {
          name: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          iataCode: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          icaoCode: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          city: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          country: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          countryCode: {
            $regex: safeSearch,
            $options: "i",
          },
        },
        {
          aliases: {
            $elemMatch: {
              $regex: safeSearch,
              $options: "i",
            },
          },
        },
      ];
    }

    const airports = await TravelAirport.find(query)
      .select(AIRPORT_LIST_FIELDS)
      .sort({
        isActive: -1,
        country: 1,
        city: 1,
        name: 1,
      })
      .limit(getListLimit(limit))
      .lean();

    return res.json(airports);
  } catch (error) {
    return sendControllerError(res, error, "Travel airport fetch failed");
  }
};

exports.getTravelAirportById = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "airport ID");

    const airport = await TravelAirport.findOne({
      _id: id,
      userId,
    })
      .select(AIRPORT_LIST_FIELDS)
      .lean();

    if (!airport) {
      return res.status(404).json({
        message: "Travel airport not found",
      });
    }

    return res.json(airport);
  } catch (error) {
    return sendControllerError(res, error, "Travel airport fetch failed");
  }
};

exports.createTravelAirport = async (req, res) => {
  try {
    const userId = getUserId(req);

    const payload = getAirportPayload(req.body);

    await ensureDuplicateAirportDoesNotExist({
      userId,
      name: payload.name,
      iataCode: payload.iataCode,
    });

    const airport = await TravelAirport.create({
      ...payload,
      userId,
    });

    await logActivity({
      req,
      action: "create",
      module: "travel.airports",
      entityType: "TravelAirport",
      entityId: airport._id,
      title: `Travel airport ${airport.name}`,
      description: `Travel airport ${airport.name} created`,
      after: airport,
    });

    return res.status(201).json(airport);
  } catch (error) {
    return sendControllerError(res, error, "Travel airport create failed");
  }
};

exports.updateTravelAirport = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "airport ID");

    const airport = await TravelAirport.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airport) {
      return res.status(404).json({
        message: "Travel airport not found",
      });
    }

    const before = airport.toObject();

    const payload = getAirportPayload(req.body, {
      partial: true,
    });

    const nextName = hasOwn(payload, "name") ? payload.name : airport.name;

    const nextIataCode = hasOwn(payload, "iataCode")
      ? payload.iataCode
      : airport.iataCode;

    await ensureDuplicateAirportDoesNotExist({
      userId,
      name: nextName,
      iataCode: nextIataCode,
      excludeId: airport._id,
    });

    Object.assign(airport, payload);

    await airport.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airports",
      entityType: "TravelAirport",
      entityId: airport._id,
      title: `Travel airport ${airport.name}`,
      description: `Travel airport ${airport.name} updated`,
      before,
      after: airport,
    });

    return res.json(airport);
  } catch (error) {
    return sendControllerError(res, error, "Travel airport update failed");
  }
};

exports.updateTravelAirportStatus = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "airport ID");

    if (
      req.body?.isActive !== true &&
      req.body?.isActive !== false &&
      req.body?.isActive !== "true" &&
      req.body?.isActive !== "false"
    ) {
      throw createHttpError(400, "Airport active status must be true or false");
    }

    const airport = await TravelAirport.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airport) {
      return res.status(404).json({
        message: "Travel airport not found",
      });
    }

    const before = {
      isActive: airport.isActive,
    };

    airport.isActive = normalizeBoolean(req.body.isActive, true);

    await airport.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airports",
      entityType: "TravelAirport",
      entityId: airport._id,
      title: `Travel airport ${airport.name}`,
      description: `Travel airport ${airport.name} status updated`,
      before,
      after: {
        isActive: airport.isActive,
      },
    });

    return res.json(airport);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel airport status update failed",
    );
  }
};

exports.deleteTravelAirport = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "airport ID");

    const airport = await TravelAirport.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airport) {
      return res.status(404).json({
        message: "Travel airport not found",
      });
    }

    const before = airport.toObject();

    applySoftDeleteFields(airport, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await airport.save();

    await logActivity({
      req,
      action: "delete",
      module: "travel.airports",
      entityType: "TravelAirport",
      entityId: airport._id,
      title: `Travel airport ${airport.name}`,
      description: `Travel airport ${airport.name} archived`,
      before,
      after: {
        isDeleted: airport.isDeleted,
        isActive: airport.isActive,
        deletedAt: airport.deletedAt,
        deletedBy: airport.deletedBy,
        deleteReason: airport.deleteReason,
      },
    });

    return res.json({
      message: "Travel airport archived successfully",
      airport,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel airport delete failed");
  }
};

exports.restoreTravelAirport = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "airport ID");

    const airport = await TravelAirport.findOne({
      _id: id,
      userId,
      isDeleted: true,
    });

    if (!airport) {
      return res.status(404).json({
        message: "Archived travel airport not found",
      });
    }

    await ensureDuplicateAirportDoesNotExist({
      userId,
      name: airport.name,
      iataCode: airport.iataCode,
      excludeId: airport._id,
    });

    const before = {
      isDeleted: airport.isDeleted,
      isActive: airport.isActive,
      deletedAt: airport.deletedAt,
      deletedBy: airport.deletedBy,
      deleteReason: airport.deleteReason,
    };

    airport.isDeleted = false;
    airport.isActive = true;
    airport.deletedAt = null;
    airport.deletedBy = null;
    airport.deleteReason = "";

    await airport.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airports",
      entityType: "TravelAirport",
      entityId: airport._id,
      title: `Travel airport ${airport.name}`,
      description: `Travel airport ${airport.name} restored`,
      before,
      after: {
        isDeleted: airport.isDeleted,
        isActive: airport.isActive,
      },
    });

    return res.json({
      message: "Travel airport restored successfully",
      airport,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel airport restore failed");
  }
};
