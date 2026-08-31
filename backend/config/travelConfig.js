const DEFAULT_TRAVEL_CURRENCY = "PKR";

const SUPPORTED_TRAVEL_CURRENCIES = Object.freeze([
  { code: "PKR", name: "Pakistani Rupee" },
  { code: "SAR", name: "Saudi Riyal" },
  { code: "AED", name: "UAE Dirham" },
  { code: "USD", name: "US Dollar" },
]);

const SUPPORTED_TRAVEL_CURRENCY_CODES = Object.freeze(
  SUPPORTED_TRAVEL_CURRENCIES.map((currency) => currency.code),
);

const OPTIONAL_TRAVEL_CURRENCY_CODES = Object.freeze([
  "",
  ...SUPPORTED_TRAVEL_CURRENCY_CODES,
]);

const TRAVEL_CURRENCY_RATE_CODES = Object.freeze(
  SUPPORTED_TRAVEL_CURRENCY_CODES.filter(
    (currency) => currency !== DEFAULT_TRAVEL_CURRENCY,
  ),
);

const TRAVEL_VENDOR_TYPES = Object.freeze([
  "airline_agent",
  "hotel",
  "visa_provider",
  "umrah_operator",
  "transport",
  "insurance",
  "local_agent",
  "other",
]);

const OPTIONAL_TRAVEL_VENDOR_TYPES = Object.freeze(["", ...TRAVEL_VENDOR_TYPES]);

const TRAVEL_HOTEL_STAR_RATINGS = Object.freeze([1, 2, 3, 4, 5]);

const normalizeCurrencyCode = (value = "") =>
  String(value || "").trim().toUpperCase();

const isSupportedTravelCurrency = (value = "") =>
  SUPPORTED_TRAVEL_CURRENCY_CODES.includes(normalizeCurrencyCode(value));

const getDefaultTravelCurrencyRates = () =>
  TRAVEL_CURRENCY_RATE_CODES.map((currency) => ({
    currency,
    rateToBase: 0,
  }));

module.exports = {
  DEFAULT_TRAVEL_CURRENCY,
  SUPPORTED_TRAVEL_CURRENCIES,
  SUPPORTED_TRAVEL_CURRENCY_CODES,
  OPTIONAL_TRAVEL_CURRENCY_CODES,
  TRAVEL_CURRENCY_RATE_CODES,
  TRAVEL_VENDOR_TYPES,
  OPTIONAL_TRAVEL_VENDOR_TYPES,
  TRAVEL_HOTEL_STAR_RATINGS,
  getDefaultTravelCurrencyRates,
  isSupportedTravelCurrency,
  normalizeCurrencyCode,
};
