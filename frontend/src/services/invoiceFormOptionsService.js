import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/invoices/form-options`;

const CACHE_PREFIX = 'invoice_form_options_cache_v2';

let activeRequest = null;

const getToken = () => localStorage.getItem('token');

const getCacheKey = () => {
  const userId = localStorage.getItem('userId') || 'default';
  return `${CACHE_PREFIX}_${userId}`;
};

const emptyData = () => ({
  customers: [],
  parties: [],
  products: [],
  paymentAccounts: [],
});

const emptyVersions = () => ({
  customers: '',
  parties: '',
  products: '',
  paymentAccounts: '',
});

const safeParse = (value, fallback = null) => {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const normalizeData = (data = {}) => ({
  customers: Array.isArray(data.customers) ? data.customers : [],
  parties: Array.isArray(data.parties) ? data.parties : [],
  products: Array.isArray(data.products) ? data.products : [],
  paymentAccounts: Array.isArray(data.paymentAccounts) ? data.paymentAccounts : [],
});

const normalizeVersions = (versions = {}) => ({
  customers: String(versions.customers || ''),
  parties: String(versions.parties || ''),
  products: String(versions.products || ''),
  paymentAccounts: String(versions.paymentAccounts || ''),
});

const getCache = () => {
  try {
    const parsed = safeParse(localStorage.getItem(getCacheKey()), null);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      data: normalizeData(parsed.data),
      versions: normalizeVersions(parsed.versions),
    };
  } catch {
    return null;
  }
};

const saveCache = ({ data, versions }) => {
  const payload = {
    data: normalizeData(data),
    versions: normalizeVersions(versions),
  };

  localStorage.setItem(getCacheKey(), JSON.stringify(payload));

  return payload;
};

export const getCachedInvoiceFormOptions = () => {
  return getCache()?.data || null;
};

export const clearInvoiceFormOptionsCache = () => {
  localStorage.removeItem(getCacheKey());
};

export const invalidateInvoiceFormOptionsSections = (sections = []) => {
  const cache = getCache();

  if (!cache) return;

  const nextVersions = {
    ...cache.versions,
  };

  sections.forEach((section) => {
    if (Object.prototype.hasOwnProperty.call(nextVersions, section)) {
      nextVersions[section] = '';
    }
  });

  saveCache({
    data: cache.data,
    versions: nextVersions,
  });
};

const requestInvoiceFormOptions = async ({ forceRefresh = false } = {}) => {
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token missing');
  }

  const cached = getCache();

  const cachedData = cached?.data || emptyData();
  const cachedVersions = cached?.versions || emptyVersions();

  const params = {};

  if (!forceRefresh) {
    if (cachedVersions.customers) {
      params.customersVersion = cachedVersions.customers;
    }

    if (cachedVersions.parties) {
      params.partiesVersion = cachedVersions.parties;
    }

    if (cachedVersions.products) {
      params.productsVersion = cachedVersions.products;
    }

    if (cachedVersions.paymentAccounts) {
      params.paymentAccountsVersion = cachedVersions.paymentAccounts;
    }
  }

  const response = await axios.get(API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params,
  });

  const payload = response.data;

  if (!payload?.success) {
    throw new Error(payload?.message || 'Failed to load invoice form options');
  }

  const serverVersions = normalizeVersions(payload.versions);

  if (payload.notModified === true && cached) {
    saveCache({
      data: cachedData,
      versions: serverVersions,
    });

    return {
      ...cachedData,
      versions: serverVersions,
      fromCache: true,
      changed: payload.changed || {},
    };
  }

  const changedData = payload?.data || {};

  const mergedData = {
    customers: Array.isArray(changedData.customers) ? changedData.customers : cachedData.customers,

    parties: Array.isArray(changedData.parties) ? changedData.parties : cachedData.parties,

    products: Array.isArray(changedData.products) ? changedData.products : cachedData.products,

    paymentAccounts: Array.isArray(changedData.paymentAccounts)
      ? changedData.paymentAccounts
      : cachedData.paymentAccounts,
  };

  saveCache({
    data: mergedData,
    versions: serverVersions,
  });

  return {
    ...mergedData,
    versions: serverVersions,
    fromCache: false,
    changed: payload.changed || {},
  };
};

export const fetchInvoiceFormOptions = async (options = {}) => {
  if (activeRequest && !options.forceRefresh) {
    return activeRequest;
  }

  activeRequest = requestInvoiceFormOptions(options);

  try {
    return await activeRequest;
  } finally {
    activeRequest = null;
  }
};
