const DEFAULT_MAX_CACHE_ENTRIES = 500;
const DEFAULT_CACHE_TTL_MS = 60 * 1000;

const dashboardCache = new Map();

const normalizeUserId = (userId) => {
  if (!userId) {
    return "";
  }

  return String(userId).trim();
};

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value).trim();
};

const buildDashboardCacheKey = ({
  userId,
  filterType = "",
  startDate = "",
  endDate = "",
} = {}) => {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return null;
  }

  return [
    normalizedUserId,
    normalizeValue(filterType),
    normalizeValue(startDate),
    normalizeValue(endDate),
  ].join("::");
};

const isExpired = (entry) => {
  if (!entry?.createdAt) {
    return true;
  }

  const createdAt = new Date(entry.createdAt).getTime();

  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt >= DEFAULT_CACHE_TTL_MS;
};

const removeExpiredEntries = () => {
  for (const [key, entry] of dashboardCache.entries()) {
    if (isExpired(entry)) {
      dashboardCache.delete(key);
    }
  }
};

const enforceCacheLimit = () => {
  removeExpiredEntries();

  while (dashboardCache.size > DEFAULT_MAX_CACHE_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    dashboardCache.delete(oldestKey);
  }
};

const setDashboardCache = ({
  userId,
  filterType = "",
  startDate = "",
  endDate = "",
  data,
} = {}) => {
  const key = buildDashboardCacheKey({
    userId,
    filterType,
    startDate,
    endDate,
  });

  if (!key || data === undefined) {
    return false;
  }

  dashboardCache.delete(key);

  dashboardCache.set(key, {
    data,
    createdAt: new Date(),
  });

  enforceCacheLimit();

  return true;
};

const getDashboardCache = ({
  userId,
  filterType = "",
  startDate = "",
  endDate = "",
} = {}) => {
  const key = buildDashboardCacheKey({
    userId,
    filterType,
    startDate,
    endDate,
  });

  if (!key) {
    return null;
  }

  const cachedEntry = dashboardCache.get(key);

  if (!cachedEntry) {
    return null;
  }

  if (isExpired(cachedEntry)) {
    dashboardCache.delete(key);
    return null;
  }

  return {
    data: cachedEntry.data,
    createdAt: cachedEntry.createdAt,
  };
};

const hasDashboardCache = ({
  userId,
  filterType = "",
  startDate = "",
  endDate = "",
} = {}) => {
  return Boolean(
    getDashboardCache({
      userId,
      filterType,
      startDate,
      endDate,
    }),
  );
};

const clearDashboardCache = ({
  userId,
  filterType = "",
  startDate = "",
  endDate = "",
} = {}) => {
  const key = buildDashboardCacheKey({
    userId,
    filterType,
    startDate,
    endDate,
  });

  if (!key) {
    return false;
  }

  return dashboardCache.delete(key);
};

const clearUserDashboardCache = (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return 0;
  }

  const prefix = `${normalizedUserId}::`;

  let deletedCount = 0;

  for (const key of dashboardCache.keys()) {
    if (key.startsWith(prefix)) {
      dashboardCache.delete(key);
      deletedCount += 1;
    }
  }

  return deletedCount;
};

const clearAllDashboardCache = () => {
  const deletedCount = dashboardCache.size;

  dashboardCache.clear();

  return deletedCount;
};

const getDashboardCacheStats = () => {
  removeExpiredEntries();

  return {
    entries: dashboardCache.size,
    maxEntries: DEFAULT_MAX_CACHE_ENTRIES,
    ttlMs: DEFAULT_CACHE_TTL_MS,
  };
};

module.exports = {
  buildDashboardCacheKey,
  getDashboardCache,
  setDashboardCache,
  hasDashboardCache,
  clearDashboardCache,
  clearUserDashboardCache,
  clearAllDashboardCache,
  getDashboardCacheStats,
};
