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

const normalizeRates = (rates = []) => {
  const sourceRates = Array.isArray(rates) ? rates : [];
  const byCurrency = new Map();

  sourceRates.forEach((rate) => {
    const currency = normalizeCurrencyCode(rate?.currency);

    if (!TRAVEL_CURRENCY_RATE_CODES.includes(currency)) {
      return;
    }

    const numericRate = Number(rate?.rateToBase);
    byCurrency.set(currency, Number.isFinite(numericRate) ? Math.max(numericRate, 0) : 0);
  });

  return TRAVEL_CURRENCY_RATE_CODES.map((currency) => ({
    currency,
    rateToBase: byCurrency.get(currency) || 0,
  }));
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
          rates: normalizeRates(req.body?.rates),
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

exports.SUPPORTED_TRAVEL_CURRENCY_CODES = SUPPORTED_TRAVEL_CURRENCY_CODES;
