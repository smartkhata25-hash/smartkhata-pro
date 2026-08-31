const TravelAirline = require("../../models/TravelAirline");
const {
  ensureDefaultTravelAirlines,
} = require("../../services/travel/travelDefaultMasterService");
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

const normalizeAliases = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.map((alias) => cleanString(alias)).filter(Boolean))];
};

const getAirlinePayload = (body, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = cleanString(body.name);

    if (!name) {
      throw createHttpError(400, "Airline name is required");
    }

    payload.name = name;
  }

  if (hasOwn(body, "iataCode")) {
    const iataCode = cleanUpperString(body.iataCode);

    if (iataCode && iataCode.length > 3) {
      throw createHttpError(
        400,
        "Airline IATA code must be maximum 3 characters",
      );
    }

    payload.iataCode = iataCode;
  }

  if (hasOwn(body, "icaoCode")) {
    const icaoCode = cleanUpperString(body.icaoCode);

    if (icaoCode && icaoCode.length > 4) {
      throw createHttpError(
        400,
        "Airline ICAO code must be maximum 4 characters",
      );
    }

    payload.icaoCode = icaoCode;
  }

  if (hasOwn(body, "country")) {
    payload.country = cleanString(body.country);
  }

  if (hasOwn(body, "aliases")) {
    payload.aliases = normalizeAliases(body.aliases);
  }

  if (hasOwn(body, "notes")) {
    payload.notes = cleanString(body.notes);
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = body.isActive !== false;
  }

  if (hasOwn(body, "isDefault")) {
    payload.isDefault = body.isDefault === true;
  }

  return payload;
};

const ensureDuplicateAirlineDoesNotExist = async ({
  userId,
  name,
  iataCode = "",
  excludeId = null,
}) => {
  const orConditions = [];

  if (name) {
    orConditions.push({
      name: {
        $regex: `^${escapeRegex(cleanString(name))}$`,
        $options: "i",
      },
    });
  }

  if (iataCode) {
    orConditions.push({
      iataCode: cleanUpperString(iataCode),
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
    query._id = { $ne: excludeId };
  }

  const duplicate = await TravelAirline.findOne(query)
    .select("_id name iataCode")
    .lean();

  if (!duplicate) {
    return;
  }

  const sameName =
    name &&
    cleanString(duplicate.name).toLowerCase() ===
      cleanString(name).toLowerCase();

  const sameCode =
    iataCode &&
    cleanUpperString(duplicate.iataCode) === cleanUpperString(iataCode);

  if (sameName) {
    throw createHttpError(409, `Airline "${duplicate.name}" already exists`);
  }

  if (sameCode) {
    throw createHttpError(
      409,
      `Airline code "${cleanUpperString(iataCode)}" already exists`,
    );
  }

  throw createHttpError(409, "A similar airline already exists");
};

exports.getTravelAirlines = async (req, res) => {
  try {
    const userId = getUserId(req);

    await ensureDefaultTravelAirlines(userId);

    const {
      search = "",
      country = "",
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
          country: {
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

    const airlines = await TravelAirline.find(query)
      .select(
        [
          "name",
          "iataCode",
          "icaoCode",
          "country",
          "aliases",
          "notes",
          "isActive",
          "isDefault",
          "isDeleted",
          "deletedAt",
          "deleteReason",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .sort({
        isActive: -1,
        name: 1,
      })
      .limit(getListLimit(limit))
      .lean();

    return res.json(airlines);
  } catch (error) {
    return sendControllerError(res, error, "Travel airline fetch failed");
  }
};

exports.getTravelAirlineById = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "airline ID");

    const airline = await TravelAirline.findOne({
      _id: id,
      userId,
    })
      .select(
        [
          "name",
          "iataCode",
          "icaoCode",
          "country",
          "aliases",
          "notes",
          "isActive",
          "isDefault",
          "isDeleted",
          "deletedAt",
          "deleteReason",
          "createdAt",
          "updatedAt",
        ].join(" "),
      )
      .lean();

    if (!airline) {
      return res.status(404).json({
        message: "Travel airline not found",
      });
    }

    return res.json(airline);
  } catch (error) {
    return sendControllerError(res, error, "Travel airline fetch failed");
  }
};

exports.createTravelAirline = async (req, res) => {
  try {
    const userId = getUserId(req);

    const payload = getAirlinePayload(req.body);

    await ensureDuplicateAirlineDoesNotExist({
      userId,
      name: payload.name,
      iataCode: payload.iataCode,
    });

    const airline = await TravelAirline.create({
      ...payload,
      userId,
    });

    await logActivity({
      req,
      action: "create",
      module: "travel.airlines",
      entityType: "TravelAirline",
      entityId: airline._id,
      title: `Travel airline ${airline.name}`,
      description: `Travel airline ${airline.name} created`,
      after: airline,
    });

    return res.status(201).json(airline);
  } catch (error) {
    return sendControllerError(res, error, "Travel airline create failed");
  }
};

exports.updateTravelAirline = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "airline ID");

    const airline = await TravelAirline.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airline) {
      return res.status(404).json({
        message: "Travel airline not found",
      });
    }

    const before = airline.toObject();

    const payload = getAirlinePayload(req.body, {
      partial: true,
    });

    const nextName = hasOwn(payload, "name") ? payload.name : airline.name;

    const nextIataCode = hasOwn(payload, "iataCode")
      ? payload.iataCode
      : airline.iataCode;

    await ensureDuplicateAirlineDoesNotExist({
      userId,
      name: nextName,
      iataCode: nextIataCode,
      excludeId: airline._id,
    });

    Object.assign(airline, payload);

    await airline.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airlines",
      entityType: "TravelAirline",
      entityId: airline._id,
      title: `Travel airline ${airline.name}`,
      description: `Travel airline ${airline.name} updated`,
      before,
      after: airline,
    });

    return res.json(airline);
  } catch (error) {
    return sendControllerError(res, error, "Travel airline update failed");
  }
};

exports.updateTravelAirlineStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "airline ID");

    const airline = await TravelAirline.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airline) {
      return res.status(404).json({
        message: "Travel airline not found",
      });
    }

    const before = {
      isActive: airline.isActive,
    };

    airline.isActive = req.body?.isActive !== false;

    await airline.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airlines",
      entityType: "TravelAirline",
      entityId: airline._id,
      title: `Travel airline ${airline.name}`,
      description: `Travel airline ${airline.name} status updated`,
      before,
      after: {
        isActive: airline.isActive,
      },
    });

    return res.json(airline);
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Travel airline status update failed",
    );
  }
};

exports.deleteTravelAirline = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "airline ID");

    const airline = await TravelAirline.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!airline) {
      return res.status(404).json({
        message: "Travel airline not found",
      });
    }

    const before = airline.toObject();

    applySoftDeleteFields(airline, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await airline.save();

    await logActivity({
      req,
      action: "delete",
      module: "travel.airlines",
      entityType: "TravelAirline",
      entityId: airline._id,
      title: `Travel airline ${airline.name}`,
      description: `Travel airline ${airline.name} archived`,
      before,
      after: {
        isDeleted: airline.isDeleted,
        isActive: airline.isActive,
        deletedAt: airline.deletedAt,
        deleteReason: airline.deleteReason,
      },
    });

    return res.json({
      message: "Travel airline archived successfully",
      airline,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel airline delete failed");
  }
};

exports.restoreTravelAirline = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    ensureObjectId(id, "airline ID");

    const airline = await TravelAirline.findOne({
      _id: id,
      userId,
      isDeleted: true,
    });

    if (!airline) {
      return res.status(404).json({
        message: "Archived travel airline not found",
      });
    }

    await ensureDuplicateAirlineDoesNotExist({
      userId,
      name: airline.name,
      iataCode: airline.iataCode,
      excludeId: airline._id,
    });

    const before = {
      isDeleted: airline.isDeleted,
      isActive: airline.isActive,
      deletedAt: airline.deletedAt,
      deletedBy: airline.deletedBy,
      deleteReason: airline.deleteReason,
    };

    airline.isDeleted = false;
    airline.isActive = true;
    airline.deletedAt = null;
    airline.deletedBy = null;
    airline.deleteReason = "";

    await airline.save();

    await logActivity({
      req,
      action: "update",
      module: "travel.airlines",
      entityType: "TravelAirline",
      entityId: airline._id,
      title: `Travel airline ${airline.name}`,
      description: `Travel airline ${airline.name} restored`,
      before,
      after: {
        isDeleted: airline.isDeleted,
        isActive: airline.isActive,
      },
    });

    return res.json({
      message: "Travel airline restored successfully",
      airline,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel airline restore failed");
  }
};
