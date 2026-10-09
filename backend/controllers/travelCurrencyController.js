const TravelCurrencySetting = require("../models/TravelCurrencySetting");
const {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCIES,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
  TRAVEL_CURRENCY_RATE_CODES,
  getDefaultTravelCurrencyRates,
  isSupportedTravelCurrency,
  normalizeCurrencyCode,
} = require("../config/travelConfig");

const getUserId = (req) => req.user?.id || req.userId;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sendError = (res, error, fallbackMessage) => {
  if (error?.statusCode) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error?.name === "ValidationError" || error?.code === 11000) {
    return res.status(400).json({ message: error.message });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({ message: fallbackMessage });
};

const resolveLegacyRate = (rate = {}) => {
  const numeric = Number(rate?.rateToBase);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

const resolveRateSide = (rate = {}, field) => {
  const numeric = Number(rate?.[field]);
  return rate?.[field] !== undefined && rate?.[field] !== null && Number.isFinite(numeric)
    ? Math.max(numeric, 0)
    : resolveLegacyRate(rate);
};

const normalizeRates = (rates = []) => {
  const sourceRates = Array.isArray(rates) ? rates : [];
  const byCurrency = new Map();

  sourceRates.forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);

    if (!TRAVEL_CURRENCY_RATE_CODES.includes(currency)) {
      return;
    }

    const costRateToBase = resolveRateSide(rate, "costRateToBase");
    const saleRateToBase = resolveRateSide(rate, "saleRateToBase");
    byCurrency.set(currency, {
      currency,
      costRateToBase,
      saleRateToBase,
      rateToBase: resolveLegacyRate(rate) || costRateToBase,
    });
  });

  return TRAVEL_CURRENCY_RATE_CODES.map((currency) =>
    byCurrency.get(currency) || {
      currency,
      costRateToBase: 0,
      saleRateToBase: 0,
      rateToBase: 0,
    },
  );
};

const validateRates = (rates = []) => {
  if (!Array.isArray(rates)) {
    throw createHttpError(400, "Currency rates must be an array");
  }

  const seen = new Set();
  rates.forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);
    if (!TRAVEL_CURRENCY_RATE_CODES.includes(currency) || seen.has(currency)) {
      throw createHttpError(400, "Unsupported or duplicate travel currency rate");
    }
    seen.add(currency);

    ["costRateToBase", "saleRateToBase"].forEach((field) => {
      const value = rate?.[field] ?? rate?.rateToBase;
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric < 0) {
        throw createHttpError(400, `Invalid ${field} for ${currency}`);
      }
    });
  });

  return normalizeRates(rates);
};

const serializeSettings = (settings = null) => ({
  _id: settings?._id || null,
  userId: settings?.userId || null,
  baseCurrency: settings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY,
  defaultCurrency: DEFAULT_TRAVEL_CURRENCY,
  supportedCurrencies: SUPPORTED_TRAVEL_CURRENCIES,
  rates: settings?.rates?.length
    ? normalizeRates(settings.rates)
    : getDefaultTravelCurrencyRates(),
  updatedAt: settings?.updatedAt || null,
});

exports.getTravelCurrencySettings = async (req, res) => {
  try {
    const userId = getUserId(req);
    const settings = await TravelCurrencySetting.findOne({ userId }).lean();

    return res.json(serializeSettings(settings));
  } catch (error) {
    return sendError(res, error, "Travel currency settings fetch failed");
  }
};

exports.updateTravelCurrencySettings = async (req, res) => {
  try {
    const userId = getUserId(req);
    const baseCurrency =
      normalizeCurrencyCode(req.body?.baseCurrency) || DEFAULT_TRAVEL_CURRENCY;

    if (!isSupportedTravelCurrency(baseCurrency)) {
      throw createHttpError(400, "Unsupported travel base currency");
    }

    const settings = await TravelCurrencySetting.findOneAndUpdate(
      { userId },
      {
        $set: {
          baseCurrency,
          rates: validateRates(req.body?.rates),
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return res.json(serializeSettings(settings));
  } catch (error) {
    return sendError(res, error, "Travel currency settings update failed");
  }
};

exports.updateTravelCurrencyRate = async (req, res) => {
  try {
    const userId = getUserId(req);
    const currency = normalizeCurrencyCode(req.params.currency);
    const side = String(req.body?.side || "").trim().toLowerCase();
    const value = Number(req.body?.rateToBase);

    if (!TRAVEL_CURRENCY_RATE_CODES.includes(currency)) {
      throw createHttpError(400, "Unsupported travel currency");
    }
    if (!["cost", "sale"].includes(side)) {
      throw createHttpError(400, "Rate side must be cost or sale");
    }
    if (!Number.isFinite(value) || value < 0) {
      throw createHttpError(400, "Conversion rate must be a finite non-negative number");
    }

    const field = side === "cost" ? "costRateToBase" : "saleRateToBase";
    await TravelCurrencySetting.updateOne(
      { userId },
      {
        $setOnInsert: {
          baseCurrency: DEFAULT_TRAVEL_CURRENCY,
          rates: getDefaultTravelCurrencyRates(),
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    );

    const updated = await TravelCurrencySetting.findOneAndUpdate(
      { userId, "rates.currency": currency },
      { $set: { [`rates.$.${field}`]: value } },
      { new: true, runValidators: true },
    ).lean();

    const settings = updated || await TravelCurrencySetting.findOneAndUpdate(
      { userId, "rates.currency": { $ne: currency } },
      {
        $push: {
          rates: {
            currency,
            costRateToBase: side === "cost" ? value : 0,
            saleRateToBase: side === "sale" ? value : 0,
            rateToBase: 0,
          },
        },
      },
      { new: true, runValidators: true },
    ).lean();

    return res.json(serializeSettings(settings));
  } catch (error) {
    return sendError(res, error, "Travel currency rate update failed");
  }
};

exports.SUPPORTED_TRAVEL_CURRENCY_CODES = SUPPORTED_TRAVEL_CURRENCY_CODES;
exports._test = { normalizeRates, validateRates };
