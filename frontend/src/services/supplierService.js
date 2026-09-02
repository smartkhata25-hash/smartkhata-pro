import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API = `${BASE_URL}/api/suppliers`;
const SUPPLIER_CACHE_PREFIX = 'suppliers_cache_v1';
const SUPPLIER_VERSION_PREFIX = 'suppliers_cache_version_v1';
const activeSupplierRequests = new Map();

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

const normalizeParams = (params = {}) =>
  Object.entries(params || {}).reduce((result, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }

    return result;
  }, {});

const safeParseJson = (value, fallback = null) => {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const getCurrentUserScope = () => {
  const user = safeParseJson(localStorage.getItem('user'), {});
  const businessId =
    user?.businessOwnerId ||
    user?.businessOwner ||
    localStorage.getItem('businessOwnerId') ||
    user?._id ||
    localStorage.getItem('userId') ||
    'anonymous';
  const actorId = user?._id || localStorage.getItem('userId') || businessId;

  return `${businessId}:${actorId}`;
};

const getParamKey = (params = {}) =>
  JSON.stringify(
    Object.keys(params)
      .sort()
      .map((key) => [key, params[key]])
  );

const getSupplierCacheKey = (params = {}) =>
  `${SUPPLIER_CACHE_PREFIX}:${getCurrentUserScope()}:${getParamKey(params)}`;

const getSupplierVersionKey = (params = {}) =>
  `${SUPPLIER_VERSION_PREFIX}:${getCurrentUserScope()}:${getParamKey(params)}`;

const getCachedSuppliers = (cacheKey) => {
  const parsed = safeParseJson(localStorage.getItem(cacheKey), null);

  return Array.isArray(parsed) ? parsed : null;
};

const setCachedSuppliers = (cacheKey, suppliers = []) => {
  if (Array.isArray(suppliers)) {
    localStorage.setItem(cacheKey, JSON.stringify(suppliers));
  }
};

const setSupplierVersion = (versionKey, version) => {
  if (version === null || version === undefined || version === '') {
    localStorage.removeItem(versionKey);
    return;
  }

  localStorage.setItem(versionKey, String(version));
};

const isSupplierVersionChanged = (versionKey, serverVersion) => {
  if (serverVersion === null || serverVersion === undefined) {
    return true;
  }

  return localStorage.getItem(versionKey) !== String(serverVersion);
};

const normalizeOptions = (options = {}) =>
  typeof options === 'boolean' ? { forceRefresh: options } : options || {};

const isSupplierListCacheable = (params = {}) => !params.search;

export const clearSupplierCaches = () => {
  Object.keys(localStorage)
    .filter(
      (key) => key.startsWith(SUPPLIER_CACHE_PREFIX) || key.startsWith(SUPPLIER_VERSION_PREFIX)
    )
    .forEach((key) => localStorage.removeItem(key));
};

export const fetchSupplierDataVersion = (params = {}) =>
  axios
    .get(`${API}/data-version`, {
      ...getConfig(),
      params: normalizeParams(params),
    })
    .then((r) => r.data);

// ✅ Supplier CRUD APIs
export const fetchSuppliers = (params = {}, options = {}) => {
  const safeParams = normalizeParams(params);
  const safeOptions = normalizeOptions(options);
  const cacheable = isSupplierListCacheable(safeParams);
  const cacheKey = getSupplierCacheKey(safeParams);
  const versionKey = getSupplierVersionKey(safeParams);

  if (!safeOptions.forceRefresh && activeSupplierRequests.has(cacheKey)) {
    return activeSupplierRequests.get(cacheKey);
  }

  const request = (async () => {
    if (!safeOptions.forceRefresh && cacheable) {
      const cached = getCachedSuppliers(cacheKey);

      if (cached) {
        try {
          const versionData = await fetchSupplierDataVersion(safeParams);
          const serverVersion = versionData?.version ?? null;

          if (!isSupplierVersionChanged(versionKey, serverVersion)) {
            return cached;
          }
        } catch (error) {
          console.error('Supplier cache/version check failed:', error);

          return cached;
        }
      }
    }

    try {
      const [response, versionData] = await Promise.all([
        axios.get(API, {
          ...getConfig(),
          params: safeParams,
        }),
        cacheable ? fetchSupplierDataVersion(safeParams).catch(() => null) : Promise.resolve(null),
      ]);
      const data = Array.isArray(response.data) ? response.data : response.data;

      if (cacheable && Array.isArray(data)) {
        setCachedSuppliers(cacheKey, data);
        setSupplierVersion(versionKey, versionData?.version ?? null);
      }

      return data;
    } catch (err) {
      console.error('❌ Error fetching suppliers:', err.response?.data || err.message);
      throw err;
    }
  })().finally(() => {
    activeSupplierRequests.delete(cacheKey);
  });

  if (!safeOptions.forceRefresh) {
    activeSupplierRequests.set(cacheKey, request);
  }

  return request;
};
export const createSupplier = (data) =>
  axios
    .post(API, data, getConfig())
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error creating supplier:', err.response?.data || err.message);
      throw err;
    });

export const updateSupplier = (id, data) =>
  axios
    .put(`${API}/${id}`, data, getConfig())
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error updating supplier:', err.response?.data || err.message);
      throw err;
    });

export const deleteSupplier = (id) =>
  axios
    .delete(`${API}/${id}`, getConfig())
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error deleting supplier:', err.response?.data || err.message);
      throw err;
    });

// ✅ Restore Hidden Supplier
export const restoreSupplier = (id) =>
  axios
    .post(`${API}/${id}/restore`, {}, getConfig())
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error restoring supplier:', err.response?.data || err.message);
      throw err;
    });

// 🔥 ✅ CONFIRM MERGE SUPPLIER (NEW – PRO LEVEL)
export const confirmMergeSupplier = (data) =>
  axios
    .post(`${API}/merge/confirm`, data, getConfig())

    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error merging suppliers:', err.response?.data || err.message);
      throw err;
    });

// ✅ Convert Supplier → Party
export const convertSupplierToParty = (id) =>
  axios
    .post(`${API}/${id}/convert-to-party`, {}, getConfig())
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error converting supplier to party:', err.response?.data || err.message);
      throw err;
    });

// ✅ Import Suppliers (with optional progress)
export const importSuppliers = (file) => {
  const fd = new FormData();
  fd.append('file', file);

  return axios
    .post(`${API}/import`, fd, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
    })
    .then((r) => {
      clearSupplierCaches();
      return r.data;
    })
    .catch((err) => {
      console.error('❌ Error importing suppliers:', err.response?.data || err.message);
      throw err;
    });
};

// ✅ Supplier Ledger with optional filters (start, end, type)
export const fetchSupplierLedger = (id, filters = {}) =>
  axios
    .get(`${BASE_URL}/api/supplier-ledger/${id}`, {
      ...getConfig(),
      params: {
        startDate: filters.startDate || filters.start || '',
        endDate: filters.endDate || filters.end || '',
        type: filters.type || '',
        ...(filters.moduleScope ? { moduleScope: filters.moduleScope } : {}),
      },
    })
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error fetching supplier ledger:', err.response?.data || err.message);
      throw err;
    });
