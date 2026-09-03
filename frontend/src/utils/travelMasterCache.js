const TRAVEL_CACHE_PREFIX = 'travel_master_cache_v2';

export const TRAVEL_CACHE_DOMAINS = Object.freeze({
  TRAVELERS: 'travelers',
  SERVICE_CATEGORIES: 'travelServiceCategories',
  SERVICES: 'travelServices',
  HOTELS: 'travelHotels',
  AIRLINES: 'travelAirlines',
  AIRPORTS: 'travelAirports',
  VENDORS: 'travelVendors',
  PAYMENT_ACCOUNTS: 'travelPaymentAccounts',
  CURRENCY_SETTINGS: 'travelCurrencySettings',
  TRAVEL_CUSTOMERS: 'travelCustomers',
  TRAVEL_PARTIES: 'travelParties',
  BOOKINGS: 'travelBookings',
  VENDOR_RETURNS: 'travelVendorReturns',
  DASHBOARD: 'travelDashboard',
  REPORTS: 'travelReports',
  REMINDER_SUMMARY: 'travelReminderSummary',
});

const isBrowser = () =>
  typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';

const safeParseUser = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedUser = window.localStorage?.getItem('user');

    return storedUser ? JSON.parse(storedUser) : null;
  } catch (error) {
    console.error('Travel cache user parse failed:', error);

    return null;
  }
};

const getCurrentCacheScope = () => {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const user = safeParseUser();
  const tenantId =
    user?.businessOwnerId ||
    user?.businessOwner ||
    user?.ownerId ||
    user?._id ||
    window.localStorage?.getItem('userId') ||
    'anonymous';
  const actorId = user?._id || user?.id || window.localStorage?.getItem('userId') || 'anonymous';

  return `${tenantId}:${actorId}`;
};

const getCacheKey = (domain) => `${TRAVEL_CACHE_PREFIX}:${getCurrentCacheScope()}:${domain}`;

const normalizeRecords = (records) => (Array.isArray(records) ? records : []);

const unwrapCacheRecords = (parsed) => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.records)) {
    return parsed.records;
  }

  return [];
};

const getCacheSavedAt = (parsed) => {
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    return 0;
  }

  return Number(parsed.savedAt || 0);
};

const safeParse = (value) => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);

    return normalizeRecords(unwrapCacheRecords(parsed));
  } catch (error) {
    console.error('Travel cache parse failed:', error);

    return [];
  }
};

export const getCachedTravelRecords = (domain) => {
  if (!isBrowser() || !domain) {
    return [];
  }

  try {
    return safeParse(sessionStorage.getItem(getCacheKey(domain)));
  } catch (error) {
    console.error('Travel cache read failed:', error);

    return [];
  }
};

export const hasTravelCache = (domain, options = {}) => {
  if (!isBrowser() || !domain) {
    return false;
  }

  try {
    const raw = sessionStorage.getItem(getCacheKey(domain));

    if (raw === null) {
      return false;
    }

    const parsed = JSON.parse(raw);
    const records = normalizeRecords(unwrapCacheRecords(parsed));
    const maxAgeMs = Number(options.maxAgeMs || 0);

    if (maxAgeMs > 0) {
      const savedAt = getCacheSavedAt(parsed);

      if (!savedAt || Date.now() - savedAt > maxAgeMs) {
        return false;
      }
    }

    return Array.isArray(records);
  } catch (error) {
    console.error('Travel cache check failed:', error);

    return false;
  }
};

export const setCachedTravelRecords = (domain, records = []) => {
  if (!isBrowser() || !domain) {
    return false;
  }

  try {
    sessionStorage.setItem(
      getCacheKey(domain),
      JSON.stringify({
        records: normalizeRecords(records),
        savedAt: Date.now(),
      })
    );

    return true;
  } catch (error) {
    console.error('Travel cache save failed:', error);

    return false;
  }
};

export const upsertCachedTravelRecord = (domain, record) => {
  if (!record?._id) {
    return false;
  }

  if (!hasTravelCache(domain)) {
    return false;
  }

  const records = getCachedTravelRecords(domain);
  const index = records.findIndex((item) => String(item?._id) === String(record._id));

  if (index === -1) {
    return setCachedTravelRecords(domain, [record, ...records]);
  }

  const nextRecords = [...records];
  nextRecords[index] = {
    ...nextRecords[index],
    ...record,
  };

  return setCachedTravelRecords(domain, nextRecords);
};

export const removeCachedTravelRecord = (domain, recordId) => {
  if (!recordId) {
    return false;
  }

  if (!hasTravelCache(domain)) {
    return false;
  }

  const records = getCachedTravelRecords(domain).filter(
    (record) => String(record?._id) !== String(recordId)
  );

  return setCachedTravelRecords(domain, records);
};

export const clearTravelCacheDomain = (domain) => {
  if (!isBrowser() || !domain) {
    return false;
  }

  try {
    sessionStorage.removeItem(getCacheKey(domain));

    return true;
  } catch (error) {
    console.error('Travel cache clear failed:', error);

    return false;
  }
};

export const clearTravelCacheDomainPrefix = (domain) => {
  if (!isBrowser() || !domain) {
    return false;
  }

  try {
    const prefix = getCacheKey(domain);
    const keys = [];

    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);

      if (key === prefix || key?.startsWith(`${prefix}:`)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => sessionStorage.removeItem(key));

    return true;
  } catch (error) {
    console.error('Travel cache prefix clear failed:', error);

    return false;
  }
};
