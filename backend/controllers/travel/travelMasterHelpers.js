const mongoose = require("mongoose");

const Customer = require("../../models/Customer");
const Supplier = require("../../models/Supplier");
const TravelServiceCategory = require("../../models/TravelServiceCategory");
const {
  DEFAULT_TRAVEL_CURRENCY,
  TRAVEL_HOTEL_STAR_RATINGS,
  isSupportedTravelCurrency,
  normalizeCurrencyCode,
} = require("../../config/travelConfig");
const {
  MODULE_SCOPES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
} = require("../../utils/moduleScope");

const escapeRegex = (text = "") =>
  String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object || {}, key);

const cleanString = (value = "") => String(value || "").trim();

const cleanUpperString = (value = "") => cleanString(value).toUpperCase();

const nullableDate = (value) => {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  return value;
};

const moneyNumber = (value) => {
  if (value === "" || value === undefined || value === null) {
    return 0;
  }

  const numericValue = Number(value);

  return Number.isFinite(numericValue) ? numericValue : 0;
};

const getUserId = (req) => req.user?.id || req.userId;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

const ensureTravelCurrency = (value) => {
  const currency = normalizeCurrencyCode(value) || DEFAULT_TRAVEL_CURRENCY;

  if (!isSupportedTravelCurrency(currency)) {
    throw createHttpError(400, "Unsupported travel currency");
  }

  return currency;
};

const normalizeHotelStarRating = (value) => {
  if (value === "" || value === undefined || value === null) {
    return null;
  }

  const rating = Number(value);

  if (
    !Number.isInteger(rating) ||
    !TRAVEL_HOTEL_STAR_RATINGS.includes(rating)
  ) {
    throw createHttpError(400, "Hotel star rating must be between 1 and 5");
  }

  return rating;
};

const ensureObjectId = (id, label = "ID") => {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    throw createHttpError(400, `Invalid ${label}`);
  }

  return id;
};

const getListLimit = (limit) => {
  const parsed = Number(limit);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 300;
  }

  return Math.min(Math.floor(parsed), 500);
};

const applyActiveFilter = (
  query,
  { status = "", isActive = "", includeDeleted = "" } = {},
) => {
  const cleanStatus = String(status || "").toLowerCase();

  if (cleanStatus === "deleted" || cleanStatus === "archived") {
    query.isDeleted = true;
  } else if (includeDeleted !== "true") {
    query.isDeleted = false;
  }

  if (cleanStatus === "active" || isActive === "true") {
    query.isActive = true;
  }

  if (
    cleanStatus === "inactive" ||
    cleanStatus === "hidden" ||
    isActive === "false"
  ) {
    query.isActive = false;
  }

  return query;
};

const sendControllerError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error?.code === 11000) {
    return res.status(409).json({
      message: "Duplicate record exists for this business",
      keyValue: error.keyValue || null,
    });
  }

  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({
      message: error.message || fallbackMessage,
    });
  }

  console.error(fallbackMessage, error);

  return res.status(500).json({
    message: fallbackMessage,
  });
};

const ensureCustomerBelongsToUser = async (customerId, userId) => {
  if (!customerId) {
    return null;
  }

  ensureObjectId(customerId, "customer ID");

  const customer = await Customer.findOne(
    applyModuleScopeFilter(
      {
        _id: customerId,
        createdBy: userId,
        isActive: { $ne: false },
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .lean();

  if (!customer) {
    throw createHttpError(400, "Customer not found for this business");
  }

  return customer._id;
};

const ensureTravelCategoryBelongsToUser = async (categoryId, userId) => {
  ensureObjectId(categoryId, "category ID");

  const category = await TravelServiceCategory.findOne({
    _id: categoryId,
    userId,
    isActive: { $ne: false },
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!category) {
    throw createHttpError(400, "Travel service category not found");
  }

  return category._id;
};

const ensureSupplierBelongsToUser = async (supplierId, userId) => {
  if (!supplierId) {
    return null;
  }

  ensureObjectId(supplierId, "vendor ID");

  const supplier = await Supplier.findOne(
    applySupplierModuleScopeFilter(
      {
        _id: supplierId,
        userId,
        isDeleted: false,
      },
      MODULE_SCOPES.TRAVEL,
    ),
  )
    .select("_id")
    .lean();

  if (!supplier) {
    throw createHttpError(400, "Vendor not found for this business");
  }

  return supplier._id;
};

module.exports = {
  applyActiveFilter,
  cleanString,
  cleanUpperString,
  createHttpError,
  ensureCustomerBelongsToUser,
  ensureObjectId,
  ensureSupplierBelongsToUser,
  ensureTravelCategoryBelongsToUser,
  ensureTravelCurrency,
  escapeRegex,
  getListLimit,
  getUserId,
  hasOwn,
  moneyNumber,
  normalizeHotelStarRating,
  nullableDate,
  sendControllerError,
};
