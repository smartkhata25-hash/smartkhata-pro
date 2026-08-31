const TravelHotel = require("../../models/TravelHotel");
const { logActivity } = require("../../utils/activityLogger");
const {
  applySoftDeleteFields,
  getSoftDeleteReason,
} = require("../../services/travel/travelSoftDeleteService");
const {
  ensureDefaultTravelHotels,
} = require("../../services/travel/travelDefaultMasterService");
const {
  applyActiveFilter,
  cleanString,
  ensureObjectId,
  ensureSupplierBelongsToUser,
  ensureTravelCurrency,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  moneyNumber,
  normalizeHotelStarRating,
  sendControllerError,
} = require("./travelMasterHelpers");

const getHotelPayload = async (body, userId, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = cleanString(body.name);

    if (!name) {
      const error = new Error("Hotel name is required");
      error.statusCode = 400;
      throw error;
    }

    payload.name = name;
  }

  if (!partial || hasOwn(body, "city")) {
    const city = cleanString(body.city);

    if (!city) {
      const error = new Error("Hotel city is required");
      error.statusCode = 400;
      throw error;
    }

    payload.city = city;
  }

  if (hasOwn(body, "country")) {
    payload.country = cleanString(body.country);
  }

  if (hasOwn(body, "starRating")) {
    payload.starRating = normalizeHotelStarRating(body.starRating);
  }

  if (hasOwn(body, "vendorId")) {
    payload.vendorId = await ensureSupplierBelongsToUser(body.vendorId, userId);
  }

  if (hasOwn(body, "distanceText")) {
    payload.distanceText = cleanString(body.distanceText);
  }

  if (hasOwn(body, "defaultRate")) {
    payload.defaultRate = moneyNumber(body.defaultRate);
  }

  if (hasOwn(body, "currency")) {
    payload.currency = ensureTravelCurrency(body.currency);
  }

  if (hasOwn(body, "address")) {
    payload.address = cleanString(body.address);
  }

  if (hasOwn(body, "contact")) {
    payload.contact = cleanString(body.contact);
  }

  if (hasOwn(body, "notes")) {
    payload.notes = cleanString(body.notes);
  }

  if (hasOwn(body, "isActive")) {
    payload.isActive = body.isActive !== false;
  }

  return payload;
};

exports.getTravelHotels = async (req, res) => {
  try {
    const userId = getUserId(req);

    await ensureDefaultTravelHotels(userId);

    const {
      search = "",
      city = "",
      country = "",
      vendorId = "",
      limit,
    } = req.query;

    const query = applyActiveFilter({ userId }, req.query);

    if (city) {
      query.city = {
        $regex: escapeRegex(city),
        $options: "i",
      };
    }

    if (country) {
      query.country = {
        $regex: escapeRegex(country),
        $options: "i",
      };
    }

    if (vendorId) {
      ensureObjectId(vendorId, "vendor ID");
      query.vendorId = vendorId;
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
          contact: {
            $regex: safeSearch,
            $options: "i",
          },
        },
      ];
    }

    const hotels = await TravelHotel.find(query)
      .select(
        "name city country starRating vendorId distanceText defaultRate currency address contact notes isActive createdAt updatedAt",
      )
      .populate("vendorId", "name phone travelVendorType isTravelVendor")
      .sort({
        updatedAt: -1,
        name: 1,
      })
      .limit(getListLimit(limit))
      .lean();

    return res.json(hotels);
  } catch (error) {
    return sendControllerError(res, error, "Travel hotel fetch failed");
  }
};

exports.createTravelHotel = async (req, res) => {
  try {
    const userId = getUserId(req);

    const payload = await getHotelPayload(req.body, userId);

    const hotel = await TravelHotel.create({
      ...payload,
      userId,
    });

    await hotel.populate(
      "vendorId",
      "name phone travelVendorType isTravelVendor",
    );

    await logActivity({
      req,
      action: "create",
      module: "travel.hotels",
      entityType: "TravelHotel",
      entityId: hotel._id,
      title: `Travel hotel ${hotel.name}`,
      description: `Travel hotel ${hotel.name} created`,
      after: hotel,
    });

    return res.status(201).json(hotel);
  } catch (error) {
    return sendControllerError(res, error, "Travel hotel create failed");
  }
};

exports.updateTravelHotel = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "hotel ID");

    const hotel = await TravelHotel.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!hotel) {
      return res.status(404).json({
        message: "Travel hotel not found",
      });
    }

    const before = hotel.toObject();

    const payload = await getHotelPayload(req.body, userId, {
      partial: true,
    });

    Object.assign(hotel, payload);

    await hotel.save();

    await hotel.populate(
      "vendorId",
      "name phone travelVendorType isTravelVendor",
    );

    await logActivity({
      req,
      action: "update",
      module: "travel.hotels",
      entityType: "TravelHotel",
      entityId: hotel._id,
      title: `Travel hotel ${hotel.name}`,
      description: `Travel hotel ${hotel.name} updated`,
      before,
      after: hotel,
    });

    return res.json(hotel);
  } catch (error) {
    return sendControllerError(res, error, "Travel hotel update failed");
  }
};

exports.updateTravelHotelStatus = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "hotel ID");

    const hotel = await TravelHotel.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!hotel) {
      return res.status(404).json({
        message: "Travel hotel not found",
      });
    }

    const before = {
      isActive: hotel.isActive,
    };

    hotel.isActive = req.body?.isActive !== false;

    await hotel.save();

    await hotel.populate(
      "vendorId",
      "name phone travelVendorType isTravelVendor",
    );

    await logActivity({
      req,
      action: "update",
      module: "travel.hotels",
      entityType: "TravelHotel",
      entityId: hotel._id,
      title: `Travel hotel ${hotel.name}`,
      description: `Travel hotel ${hotel.name} status updated`,
      before,
      after: {
        isActive: hotel.isActive,
      },
    });

    return res.json(hotel);
  } catch (error) {
    return sendControllerError(res, error, "Travel hotel status update failed");
  }
};

exports.deleteTravelHotel = async (req, res) => {
  try {
    const userId = getUserId(req);

    const { id } = req.params;

    ensureObjectId(id, "hotel ID");

    const hotel = await TravelHotel.findOne({
      _id: id,
      userId,
      isDeleted: false,
    });

    if (!hotel) {
      return res.status(404).json({
        message: "Travel hotel not found",
      });
    }

    const before = hotel.toObject();

    applySoftDeleteFields(hotel, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req),
    });

    await hotel.save();

    await hotel.populate(
      "vendorId",
      "name phone travelVendorType isTravelVendor",
    );

    await logActivity({
      req,
      action: "delete",
      module: "travel.hotels",
      entityType: "TravelHotel",
      entityId: hotel._id,
      title: `Travel hotel ${hotel.name}`,
      description: `Travel hotel ${hotel.name} archived`,
      before,
      after: {
        isDeleted: hotel.isDeleted,
        isActive: hotel.isActive,
        deleteReason: hotel.deleteReason,
      },
    });

    return res.json({
      message: "Travel hotel archived successfully",
      hotel,
    });
  } catch (error) {
    return sendControllerError(res, error, "Travel hotel delete failed");
  }
};
