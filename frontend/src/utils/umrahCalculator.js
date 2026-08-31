import { DEFAULT_TRAVEL_CURRENCY } from '../config/travelConfig';

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const safePositiveRate = (value, fallback = 0) => {
  const rate = Number(value);

  return Number.isFinite(rate) && rate > 0 ? rate : fallback;
};

export const DEFAULT_UMRAH_RATES = Object.freeze({
  SAR_to_PKR: 75,
  USD_to_PKR: 280,

  // Backward-compatible derived fallback.
  USD_to_SAR: 280 / 75,
});

export const createEmptyCalculatorHotel = (city = 'makkah') => ({
  hotelId: '',
  name: '',
  city,
  nights: city === 'makkah' ? 3 : 2,
  pricePerNight: 0,
  weekendNights: 0,
  weekendPrice: '',
});

export const getCurrencyRateToBase = (currencySettings, currency) => {
  const safeCurrency = String(currency || '').toUpperCase();
  const baseCurrency = String(
    currencySettings?.baseCurrency || DEFAULT_TRAVEL_CURRENCY
  ).toUpperCase();

  if (!safeCurrency) {
    return 0;
  }

  if (safeCurrency === baseCurrency) {
    return 1;
  }

  const rate = (currencySettings?.rates || []).find(
    (item) => String(item?.currency || '').toUpperCase() === safeCurrency
  );

  return Number(rate?.rateToBase || 0);
};

const getSarToPkrRate = (rates = DEFAULT_UMRAH_RATES) =>
  safePositiveRate(rates?.SAR_to_PKR, DEFAULT_UMRAH_RATES.SAR_to_PKR);

const getUsdToPkrRate = (rates = DEFAULT_UMRAH_RATES) => {
  const directUsdToPkr = safePositiveRate(rates?.USD_to_PKR);

  if (directUsdToPkr > 0) {
    return directUsdToPkr;
  }

  const sarToPkr = getSarToPkrRate(rates);
  const legacyUsdToSar = safePositiveRate(rates?.USD_to_SAR);

  if (legacyUsdToSar > 0) {
    return roundMoney(legacyUsdToSar * sarToPkr);
  }

  return DEFAULT_UMRAH_RATES.USD_to_PKR;
};

export const getUsdToSarRate = (rates = DEFAULT_UMRAH_RATES) => {
  const sarToPkr = getSarToPkrRate(rates);
  const usdToPkr = getUsdToPkrRate(rates);

  return sarToPkr > 0 ? roundMoney(usdToPkr / sarToPkr) : DEFAULT_UMRAH_RATES.USD_to_SAR;
};

export const getCalculatorRatesFromSettings = (currencySettings) => {
  const sarToBase =
    getCurrencyRateToBase(currencySettings, 'SAR') || DEFAULT_UMRAH_RATES.SAR_to_PKR;

  const usdToBase =
    getCurrencyRateToBase(currencySettings, 'USD') || DEFAULT_UMRAH_RATES.USD_to_PKR;

  const sarToPkr = roundMoney(sarToBase);
  const usdToPkr = roundMoney(usdToBase);

  return {
    SAR_to_PKR: sarToPkr,
    USD_to_PKR: usdToPkr,

    // Keep this derived value temporarily for compatibility
    // with any older calculator caller.
    USD_to_SAR: sarToPkr > 0 ? roundMoney(usdToPkr / sarToPkr) : DEFAULT_UMRAH_RATES.USD_to_SAR,
  };
};

export const convertAmountToSar = (amount, currency, rates = DEFAULT_UMRAH_RATES) => {
  const numericAmount = Number(amount || 0);
  const safeCurrency = String(currency || 'SAR').toUpperCase();

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return 0;
  }

  if (safeCurrency === 'SAR') {
    return roundMoney(numericAmount);
  }

  const sarToPkr = getSarToPkrRate(rates);

  if (safeCurrency === 'PKR') {
    return sarToPkr > 0 ? roundMoney(numericAmount / sarToPkr) : 0;
  }

  if (safeCurrency === 'USD') {
    const usdToPkr = getUsdToPkrRate(rates);

    if (sarToPkr <= 0 || usdToPkr <= 0) {
      return 0;
    }

    const amountInPkr = numericAmount * usdToPkr;

    return roundMoney(amountInPkr / sarToPkr);
  }

  return roundMoney(numericAmount);
};

export const normalizeHotelForCalculator = (
  hotel,
  city,
  rates = DEFAULT_UMRAH_RATES,
  existing = createEmptyCalculatorHotel(city)
) => {
  if (!hotel) {
    return {
      ...existing,
      city,
    };
  }

  return {
    ...existing,
    hotelId: hotel._id || '',
    name: hotel.name || '',
    city,
    pricePerNight: roundMoney(
      convertAmountToSar(hotel.defaultRate, hotel.currency || 'SAR', rates)
    ),
  };
};

export const clampWeekendNights = (weekendNights, nights) =>
  Math.max(0, Math.min(Number(weekendNights || 0), Math.max(0, Number(nights || 0))));

export const getHotelNightBreakdown = (hotel = {}, { markWeekend = false } = {}) => {
  const nights = Math.max(0, Number(hotel.nights || 0));
  const price = Math.max(0, Number(hotel.pricePerNight || 0));

  const weekendNights = markWeekend ? clampWeekendNights(hotel.weekendNights, nights) : 0;

  const normalNights = Math.max(0, nights - weekendNights);

  const weekendPrice =
    hotel.weekendPrice === '' || hotel.weekendPrice === null || hotel.weekendPrice === undefined
      ? price
      : Math.max(0, Number(hotel.weekendPrice || price));

  const normalSubtotal = roundMoney(normalNights * price);

  const weekendSubtotal = roundMoney(weekendNights * weekendPrice);

  return {
    totalNights: nights,
    normalNights,
    weekendNights,
    normalRate: price,
    weekendRate: weekendPrice,
    normalSubtotal,
    weekendSubtotal,
    subtotalSar: roundMoney(normalSubtotal + weekendSubtotal),
  };
};

export const getHotelSubtotalSar = (hotel = {}, options = {}) =>
  getHotelNightBreakdown(hotel, options).subtotalSar;

export const getTicketPriceInSar = (ticketPrice, ticketCurrency, rates = DEFAULT_UMRAH_RATES) =>
  convertAmountToSar(ticketPrice, ticketCurrency || 'SAR', rates);

export const calculateUmrahPackage = ({
  makkah,
  madinah,
  pax = 1,
  ticketPrice = 0,
  ticketCurrency = 'SAR',
  visaMode = 'auto',
  defaultVisaSAR = 300,
  manualVisaSAR = 0,
  rates = DEFAULT_UMRAH_RATES,
  markWeekend = false,
} = {}) => {
  const safePax = Math.max(1, Number(pax || 1));

  const makkahTotalSAR = getHotelSubtotalSar(makkah, { markWeekend });

  const madinahTotalSAR = getHotelSubtotalSar(madinah, { markWeekend });

  const ticketPriceInSAR = getTicketPriceInSar(ticketPrice, ticketCurrency, rates);

  const visaSAR = Number(visaMode === 'auto' ? defaultVisaSAR : manualVisaSAR) || 0;

  const ticketTotalSAR = roundMoney(ticketPriceInSAR * safePax);

  const totalSAR = roundMoney(makkahTotalSAR + madinahTotalSAR + ticketTotalSAR + visaSAR);

  const sarToPkr = getSarToPkrRate(rates);
  const usdToPkr = getUsdToPkrRate(rates);

  const totalPKR = roundMoney(totalSAR * sarToPkr);

  const totalUSD = usdToPkr > 0 ? roundMoney(totalPKR / usdToPkr) : 0;

  return {
    makkahTotalSAR,
    madinahTotalSAR,
    ticketPriceInSAR: roundMoney(ticketPriceInSAR),
    ticketTotalSAR,
    visaSAR: roundMoney(visaSAR),
    totalSAR,
    totalPKR,
    totalUSD,

    rates: {
      SAR_to_PKR: sarToPkr,
      USD_to_PKR: usdToPkr,
      USD_to_SAR: getUsdToSarRate(rates),
    },
  };
};

export const splitHotelsByUmrahCity = (hotels = []) => {
  const activeHotels = (Array.isArray(hotels) ? hotels : []).filter(
    (hotel) => hotel?.isDeleted !== true && hotel?.isActive !== false
  );

  const matchesCity = (hotel, keywords) => {
    const city = String(hotel?.city || '').toLowerCase();

    const country = String(hotel?.country || '').toLowerCase();

    const searchable = `${city} ${country}`;

    return keywords.some((keyword) => searchable.includes(keyword));
  };

  const makkahHotels = activeHotels.filter((hotel) => matchesCity(hotel, ['makkah', 'mecca']));

  const madinahHotels = activeHotels.filter((hotel) =>
    matchesCity(hotel, ['madinah', 'madina', 'medina'])
  );

  return {
    makkahHotels,
    madinahHotels,
  };
};
