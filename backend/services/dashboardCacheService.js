// services/dashboardCacheService.js

const DEFAULT_MAX_CACHE_ENTRIES = 500;

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

const enforceCacheLimit = () => {
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
  const key = buildDashboardCacheKey({
    userId,
    filterType,
    startDate,
    endDate,
  });

  if (!key) {
    return false;
  }

  return dashboardCache.has(key);
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
  return {
    entries: dashboardCache.size,
    maxEntries: DEFAULT_MAX_CACHE_ENTRIES,
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
