import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/accounts`;
const ACCOUNT_CACHE_PREFIX = 'accounts_cache_v2';
const PAYMENT_ACCOUNT_CACHE_PREFIX = 'payment_accounts_cache_v2';
const MODULE_SCOPES = Object.freeze({
  TRADING: 'trading',
  TRAVEL: 'travel',
  BOTH: 'both',
});

const getToken = () => localStorage.getItem('token');

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
  const actorId =
    user?._id ||
    localStorage.getItem('userId') ||
    businessId;

  return `${businessId}:${actorId}`;
};

const normalizeModuleScope = (moduleScope = MODULE_SCOPES.TRADING) => {
  const cleanScope = String(moduleScope || '').trim().toLowerCase();

  return Object.values(MODULE_SCOPES).includes(cleanScope)
    ? cleanScope
    : MODULE_SCOPES.TRADING;
};

const normalizeOptions = (forceRefreshOrOptions = false, maybeOptions = {}) => {
  if (
    forceRefreshOrOptions &&
    typeof forceRefreshOrOptions === 'object' &&
    !Array.isArray(forceRefreshOrOptions)
  ) {
    return {
      forceRefresh: false,
      ...forceRefreshOrOptions,
      moduleScope: normalizeModuleScope(forceRefreshOrOptions.moduleScope),
    };
  }

  return {
    forceRefresh: Boolean(forceRefreshOrOptions),
    ...maybeOptions,
    moduleScope: normalizeModuleScope(maybeOptions.moduleScope),
  };
};

const getCacheKey = (prefix, options = {}) =>
  `${prefix}:${getCurrentUserScope()}:${normalizeModuleScope(options.moduleScope)}:${
    options.filter || 'all'
  }`;

const getCachedAccounts = (options = {}) => {
  try {
    const cached = localStorage.getItem(getCacheKey(ACCOUNT_CACHE_PREFIX, options));

    if (!cached) return null;

    const parsed = JSON.parse(cached);

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const setCachedAccounts = (accounts, options = {}) => {
  if (!Array.isArray(accounts)) return;

  localStorage.setItem(getCacheKey(ACCOUNT_CACHE_PREFIX, options), JSON.stringify(accounts));
};

export const clearAccountsCache = () => {
  Object.keys(localStorage)
    .filter(
      (key) =>
        key.startsWith(ACCOUNT_CACHE_PREFIX) ||
        key.startsWith(PAYMENT_ACCOUNT_CACHE_PREFIX) ||
        key === 'accounts_cache_v1' ||
        key === 'paymentAccounts'
    )
    .forEach((key) => localStorage.removeItem(key));
};

const authHeaders = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  params,
});

export const getAccounts = async (forceRefreshOrOptions = false, maybeOptions = {}) => {
  const options = normalizeOptions(forceRefreshOrOptions, maybeOptions);
  const params = {
    moduleScope: options.moduleScope,
  };

  if (options.filter) params.filter = options.filter;
  if (options.category) params.category = options.category;
  if (options.type) params.type = options.type;

  if (!options.forceRefresh) {
    const cached = getCachedAccounts(options);

    if (cached) {
      return cached;
    }
  }

  const res = await axios.get(API_URL, authHeaders(params));
  const data = Array.isArray(res.data) ? res.data : [];

  setCachedAccounts(data, options);

  return data;
};

export const getValidPaymentAccounts = async (forceRefreshOrOptions = false, maybeOptions = {}) => {
  const options = {
    ...normalizeOptions(forceRefreshOrOptions, maybeOptions),
    filter: 'payment',
  };
  const cacheKey = getCacheKey(PAYMENT_ACCOUNT_CACHE_PREFIX, options);

  if (!options.forceRefresh) {
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      const parsed = safeParseJson(cached, null);

      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  }

  const res = await axios.get(
    API_URL,
    authHeaders({ moduleScope: options.moduleScope, filter: 'payment' })
  );
  const data = Array.isArray(res.data) ? res.data : [];

  localStorage.setItem(cacheKey, JSON.stringify(data));

  return data;
};

export const getAccountsByCategory = async (category, options = {}) => {
  if (!category) return [];

  const normalizedOptions = normalizeOptions({
    ...options,
    category,
  });
  const res = await axios.get(
    API_URL,
    authHeaders({
      moduleScope: normalizedOptions.moduleScope,
      category,
    })
  );

  return Array.isArray(res.data) ? res.data : [];
};

export const createAccount = async (data, options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const res = await axios.post(
    API_URL,
    {
      ...data,
      moduleScope: normalizeModuleScope(data?.moduleScope || normalizedOptions.moduleScope),
    },
    authHeaders({ moduleScope: normalizedOptions.moduleScope })
  );

  clearAccountsCache();

  return res.data;
};

export const updateAccount = async (id, data, options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const res = await axios.put(
    `${API_URL}/${id}`,
    {
      ...data,
      moduleScope: normalizeModuleScope(data?.moduleScope || normalizedOptions.moduleScope),
    },
    authHeaders({ moduleScope: normalizedOptions.moduleScope })
  );

  clearAccountsCache();

  return res.data;
};

export const deleteAccount = async (id, options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const res = await axios.delete(
    `${API_URL}/${id}`,
    authHeaders({ moduleScope: normalizedOptions.moduleScope })
  );

  clearAccountsCache();

  return res.data;
};

export const getCashSummary = async (options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const res = await axios.get(
    `${API_URL}/cash-summary`,
    authHeaders({ moduleScope: normalizedOptions.moduleScope })
  );

  return res.data;
};

export const getBankSummary = async (options = {}) => {
  const normalizedOptions = normalizeOptions(options);
  const res = await axios.get(
    `${API_URL}/bank-summary`,
    authHeaders({ moduleScope: normalizedOptions.moduleScope })
  );

  return res.data;
};

export const getAccountTransactions = async (accountId, params = {}) => {
  if (!accountId) return [];

  const normalizedParams = {
    ...params,
    moduleScope: normalizeModuleScope(params.moduleScope),
  };
  const res = await axios.get(`${API_URL}/${accountId}/transactions`, authHeaders(normalizedParams));

  return Array.isArray(res.data) ? res.data : [];
};

export const getAllAccounts = getAccounts;
