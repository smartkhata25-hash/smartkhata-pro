const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_MAX_CACHE_ENTRIES = 300;

const reportCache = new Map();
const activeRequests = new Map();

const normalizeValue = (value) => {
  if (value === undefined || value === null) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value).trim();
};

const normalizeUserId = (userId) => {
  if (!userId) {
    return "";
  }

  return String(userId).trim();
};

const normalizeFilters = (filters = {}) => {
  return {
    view: normalizeValue(filters.view),
    page: normalizeValue(filters.page),
    limit: normalizeValue(filters.limit),
    sortBy: normalizeValue(filters.sortBy),
    sortOrder: normalizeValue(filters.sortOrder),
    deadAfterDays: normalizeValue(filters.deadAfterDays),
    hideZeroStock: normalizeValue(filters.hideZeroStock),
    inStockOnly: normalizeValue(filters.inStockOnly),
    includeNegativeStock: normalizeValue(filters.includeNegativeStock),
    search: normalizeValue(filters.search).toLowerCase(),
    categoryId: normalizeValue(filters.categoryId),
    startDate: normalizeValue(filters.startDate),
    endDate: normalizeValue(filters.endDate),
  };
};

const buildProductPerformanceCacheKey = ({ userId, filters = {} } = {}) => {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return null;
  }

  const normalizedFilters = normalizeFilters(filters);

  return [
    normalizedUserId,
    normalizedFilters.view,
    normalizedFilters.page,
    normalizedFilters.limit,
    normalizedFilters.sortBy,
    normalizedFilters.sortOrder,
    normalizedFilters.deadAfterDays,
    normalizedFilters.hideZeroStock,
    normalizedFilters.inStockOnly,
    normalizedFilters.includeNegativeStock,
    normalizedFilters.search,
    normalizedFilters.categoryId,
    normalizedFilters.startDate,
    normalizedFilters.endDate,
  ].join("::");
};

const isExpired = (entry) => {
  if (!entry?.createdAt) {
    return true;
  }

  const createdAt = Number(entry.createdAt);

  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return Date.now() - createdAt >= DEFAULT_CACHE_TTL_MS;
};

const deleteExpiredEntries = () => {
  let deletedCount = 0;

  for (const [key, entry] of reportCache.entries()) {
    if (isExpired(entry)) {
      reportCache.delete(key);
      deletedCount += 1;
    }
  }

  return deletedCount;
};

const enforceCacheLimit = () => {
  deleteExpiredEntries();

  while (reportCache.size > DEFAULT_MAX_CACHE_ENTRIES) {
    const oldestKey = reportCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    reportCache.delete(oldestKey);
  }
};

const getProductPerformanceCache = ({ userId, filters = {} } = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key) {
    return null;
  }

  const entry = reportCache.get(key);

  if (!entry) {
    return null;
  }

  if (isExpired(entry)) {
    reportCache.delete(key);
    return null;
  }

  return {
    data: entry.data,
    createdAt: new Date(entry.createdAt),
  };
};

const setProductPerformanceCache = ({ userId, filters = {}, data } = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key || data === undefined) {
    return false;
  }

  reportCache.delete(key);

  reportCache.set(key, {
    data,
    createdAt: Date.now(),
  });

  enforceCacheLimit();

  return true;
};

const hasProductPerformanceCache = ({ userId, filters = {} } = {}) => {
  return Boolean(
    getProductPerformanceCache({
      userId,
      filters,
    }),
  );
};

const clearProductPerformanceCache = ({ userId, filters = {} } = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key) {
    return false;
  }

  return reportCache.delete(key);
};

const clearUserProductPerformanceCache = (userId) => {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    return 0;
  }

  const prefix = `${normalizedUserId}::`;

  let deletedCount = 0;

  for (const key of reportCache.keys()) {
    if (key.startsWith(prefix)) {
      reportCache.delete(key);
      deletedCount += 1;
    }
  }

  for (const key of activeRequests.keys()) {
    if (key.startsWith(prefix)) {
      activeRequests.delete(key);
    }
  }

  return deletedCount;
};

const clearAllProductPerformanceCache = () => {
  const deletedCount = reportCache.size;

  reportCache.clear();
  activeRequests.clear();

  return deletedCount;
};

const getActiveProductPerformanceRequest = ({ userId, filters = {} } = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key) {
    return null;
  }

  return activeRequests.get(key) || null;
};

const setActiveProductPerformanceRequest = ({
  userId,
  filters = {},
  promise,
} = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key || !promise || typeof promise.then !== "function") {
    return false;
  }

  activeRequests.set(key, promise);

  return true;
};

const clearActiveProductPerformanceRequest = ({
  userId,
  filters = {},
} = {}) => {
  const key = buildProductPerformanceCacheKey({
    userId,
    filters,
  });

  if (!key) {
    return false;
  }

  return activeRequests.delete(key);
};

const executeProductPerformanceCached = async ({
  userId,
  filters = {},
  forceRefresh = false,
  executor,
} = {}) => {
  if (typeof executor !== "function") {
    throw new Error("Product performance cache executor is required");
  }

  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    throw new Error("Valid userId is required");
  }

  if (!forceRefresh) {
    const cached = getProductPerformanceCache({
      userId: normalizedUserId,
      filters,
    });

    if (cached) {
      return {
        data: cached.data,
        fromCache: true,
        createdAt: cached.createdAt,
      };
    }

    const existingRequest = getActiveProductPerformanceRequest({
      userId: normalizedUserId,
      filters,
    });

    if (existingRequest) {
      const data = await existingRequest;

      return {
        data,
        fromCache: false,
        sharedRequest: true,
        createdAt: new Date(),
      };
    }
  }

  const executionPromise = Promise.resolve().then(() => executor());

  setActiveProductPerformanceRequest({
    userId: normalizedUserId,
    filters,
    promise: executionPromise,
  });

  try {
    const data = await executionPromise;

    setProductPerformanceCache({
      userId: normalizedUserId,
      filters,
      data,
    });

    return {
      data,
      fromCache: false,
      sharedRequest: false,
      createdAt: new Date(),
    };
  } finally {
    clearActiveProductPerformanceRequest({
      userId: normalizedUserId,
      filters,
    });
  }
};

const getProductPerformanceCacheStats = () => {
  deleteExpiredEntries();

  return {
    entries: reportCache.size,
    activeRequests: activeRequests.size,
    maxEntries: DEFAULT_MAX_CACHE_ENTRIES,
    ttlMs: DEFAULT_CACHE_TTL_MS,
  };
};

module.exports = {
  buildProductPerformanceCacheKey,

  getProductPerformanceCache,
  setProductPerformanceCache,
  hasProductPerformanceCache,

  clearProductPerformanceCache,
  clearUserProductPerformanceCache,
  clearAllProductPerformanceCache,

  getActiveProductPerformanceRequest,
  setActiveProductPerformanceRequest,
  clearActiveProductPerformanceRequest,

  executeProductPerformanceCached,

  getProductPerformanceCacheStats,
};
