const TravelCity = require("../../models/TravelCity");
const { logActivity } = require("../../utils/activityLogger");
const {
  applySoftDeleteFields,
  getSoftDeleteReason,
} = require("../../services/travel/travelSoftDeleteService");
const {
  applyActiveFilter,
  cleanString,
  createHttpError,
  ensureObjectId,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  sendControllerError,
} = require("./travelMasterHelpers");

const DEFAULT_CITY_NAMES = Object.freeze(["Makkah", "Madinah", "Jeddah", "Taif"]);
const normalizeCityName = (value = "") => cleanString(value).replace(/\s+/g, " ");
const getNormalizedName = (value = "") => normalizeCityName(value).toLocaleLowerCase();

const ensureDefaultTravelCities = async (userId) => {
  const existingCount = await TravelCity.countDocuments({ userId });
  if (existingCount > 0) return;

  try {
    await TravelCity.insertMany(
      DEFAULT_CITY_NAMES.map((name) => ({
        userId,
        name,
        normalizedName: getNormalizedName(name),
      })),
      { ordered: false },
    );
  } catch (error) {
    if (error?.code !== 11000 && !error?.writeErrors?.every((entry) => entry?.code === 11000)) {
      throw error;
    }
  }
};

const getCityPayload = (body = {}, { partial = false } = {}) => {
  const payload = {};

  if (!partial || hasOwn(body, "name")) {
    const name = normalizeCityName(body.name);
    if (!name) throw createHttpError(400, "City name is required");
    payload.name = name;
    payload.normalizedName = getNormalizedName(name);
  }
  if (hasOwn(body, "country")) payload.country = cleanString(body.country);
  if (hasOwn(body, "isActive")) payload.isActive = body.isActive !== false;

  return payload;
};

exports.getTravelCities = async (req, res) => {
  try {
    const userId = getUserId(req);
    await ensureDefaultTravelCities(userId);

    const query = applyActiveFilter({ userId }, req.query);
    const search = normalizeCityName(req.query.search);
    if (search) {
      const regex = { $regex: escapeRegex(search), $options: "i" };
      query.$or = [{ name: regex }, { country: regex }];
    }

    const cities = await TravelCity.find(query)
      .select("name normalizedName country isActive isDeleted createdAt updatedAt")
      .sort({ name: 1 })
      .limit(getListLimit(req.query.limit))
      .lean();

    return res.json(cities);
  } catch (error) {
    return sendControllerError(res, error, "Travel cities fetch failed");
  }
};

exports.createTravelCity = async (req, res) => {
  try {
    const userId = getUserId(req);
    const payload = getCityPayload(req.body);
    const existing = await TravelCity.findOne({
      userId,
      normalizedName: payload.normalizedName,
    });

    if (existing) {
      if (existing.isDeleted || existing.isActive === false) {
        existing.name = payload.name;
        existing.country = payload.country || existing.country;
        existing.isActive = true;
        existing.isDeleted = false;
        existing.deletedAt = null;
        existing.deletedBy = null;
        existing.deleteReason = "";
        await existing.save();
      }
      return res.json(existing);
    }

    const city = await TravelCity.create({ ...payload, userId });
    await logActivity({
      req,
      action: "create",
      module: "travel.hotels",
      entityType: "TravelCity",
      entityId: city._id,
      title: `Travel city ${city.name}`,
      description: `Travel city ${city.name} created`,
      after: city,
    });
    return res.status(201).json(city);
  } catch (error) {
    return sendControllerError(res, error, "Travel city create failed");
  }
};

exports.updateTravelCity = async (req, res) => {
  try {
    const userId = getUserId(req);
    ensureObjectId(req.params.id, "city ID");
    const city = await TravelCity.findOne({ _id: req.params.id, userId, isDeleted: false });
    if (!city) return res.status(404).json({ message: "Travel city not found" });

    const payload = getCityPayload(req.body, { partial: true });
    if (payload.normalizedName) {
      const duplicate = await TravelCity.exists({
        userId,
        normalizedName: payload.normalizedName,
        _id: { $ne: city._id },
      });
      if (duplicate) throw createHttpError(409, "A City with this name already exists");
    }
    Object.assign(city, payload);
    await city.save();
    return res.json(city);
  } catch (error) {
    return sendControllerError(res, error, "Travel city update failed");
  }
};

exports.updateTravelCityStatus = async (req, res) => {
  try {
    const userId = getUserId(req);
    ensureObjectId(req.params.id, "city ID");
    const city = await TravelCity.findOne({ _id: req.params.id, userId, isDeleted: false });
    if (!city) return res.status(404).json({ message: "Travel city not found" });
    city.isActive = req.body?.isActive !== false;
    await city.save();
    return res.json(city);
  } catch (error) {
    return sendControllerError(res, error, "Travel city status update failed");
  }
};

exports.deleteTravelCity = async (req, res) => {
  try {
    const userId = getUserId(req);
    ensureObjectId(req.params.id, "city ID");
    const city = await TravelCity.findOne({ _id: req.params.id, userId, isDeleted: false });
    if (!city) return res.status(404).json({ message: "Travel city not found" });
    applySoftDeleteFields(city, {
      actorId: req.actorId || userId,
      reason: getSoftDeleteReason(req, "Travel city archived by user"),
    });
    await city.save();
    return res.json({ message: "Travel city archived successfully", city });
  } catch (error) {
    return sendControllerError(res, error, "Travel city archive failed");
  }
};

exports.DEFAULT_CITY_NAMES = DEFAULT_CITY_NAMES;
exports.ensureDefaultTravelCities = ensureDefaultTravelCities;
exports.getNormalizedName = getNormalizedName;
