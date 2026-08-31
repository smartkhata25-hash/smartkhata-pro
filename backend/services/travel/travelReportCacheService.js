const REPORT_CACHE_TTL_MS = 30 * 1000;
const reportCache = new Map();

const normalizeUserId = (userId = "") => String(userId || "");

const getTravelReportCacheKey = ({ userId, filters = {} }) =>
  [
    normalizeUserId(userId),
    filters.preset || "all_time",
    filters.startDate || "",
    filters.endDate || "",
  ].join(":");

const getCachedTravelReport = (cacheKey) => {
  if (!cacheKey) {
    return null;
  }

  const cached = reportCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.savedAt > REPORT_CACHE_TTL_MS) {
    reportCache.delete(cacheKey);

    return null;
  }

  return cached.payload;
};

const setCachedTravelReport = (cacheKey, payload) => {
  if (!cacheKey || !payload) {
    return;
  }

  reportCache.set(cacheKey, {
    savedAt: Date.now(),
    payload,
  });
};

const clearTravelReportCache = (userId = "") => {
  const normalizedUserId = normalizeUserId(userId);

  if (!normalizedUserId) {
    reportCache.clear();

    return;
  }

  for (const cacheKey of reportCache.keys()) {
    if (cacheKey.startsWith(`${normalizedUserId}:`)) {
      reportCache.delete(cacheKey);
    }
  }
};

module.exports = {
  REPORT_CACHE_TTL_MS,
  clearTravelReportCache,
  getCachedTravelReport,
  getTravelReportCacheKey,
  setCachedTravelReport,
};
