import { t } from '../i18n/i18n';

export const DEFAULT_TRAVEL_CURRENCY = 'PKR';

export const SUPPORTED_TRAVEL_CURRENCIES = Object.freeze([
  { code: 'PKR', labelKey: 'travel.currency.PKR', nameKey: 'travel.currencyNames.PKR' },
  { code: 'SAR', labelKey: 'travel.currency.SAR', nameKey: 'travel.currencyNames.SAR' },
  { code: 'AED', labelKey: 'travel.currency.AED', nameKey: 'travel.currencyNames.AED' },
  { code: 'USD', labelKey: 'travel.currency.USD', nameKey: 'travel.currencyNames.USD' },
]);

export const TRAVEL_VENDOR_TYPES = Object.freeze([
  'airline_agent',
  'hotel',
  'visa_provider',
  'umrah_operator',
  'transport',
  'insurance',
  'local_agent',
  'other',
]);

export const HOTEL_STAR_RATINGS = Object.freeze([1, 2, 3, 4, 5]);

export const getTravelCurrencyOptions = ({ includeBlank = false } = {}) => {
  const options = SUPPORTED_TRAVEL_CURRENCIES.map((currency) => ({
    value: currency.code,
    labelKey: currency.labelKey,
  }));

  return includeBlank
    ? [{ value: '', labelKey: 'travel.placeholders.currency' }, ...options]
    : options;
};

export const getTravelVendorTypeOptions = () =>
  TRAVEL_VENDOR_TYPES.map((value) => ({
    value,
    labelKey: `travel.vendorTypes.${value}`,
  }));

export const getHotelStarRatingOptions = () =>
  HOTEL_STAR_RATINGS.map((rating) => ({
    value: rating,
    labelKey: `travel.starRating.${rating}`,
  }));

export const getTravelCurrencyLabel = (currency = '') => {
  const code = String(currency || DEFAULT_TRAVEL_CURRENCY).toUpperCase();
  const supported = SUPPORTED_TRAVEL_CURRENCIES.find((item) => item.code === code);

  return supported ? t(supported.labelKey) : code;
};

export const getHotelStarRatingLabel = (rating) => {
  const numericRating = Number(rating);

  if (!HOTEL_STAR_RATINGS.includes(numericRating)) {
    return '-';
  }

  return t(`travel.starRating.${numericRating}`);
};
