import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/purchase-invoices`;

const CACHE_PREFIX = 'purchase_invoice_form_options_cache_v1';

let activeFormOptionsRequest = null;

const getToken = () => localStorage.getItem('token');

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
});

const getFormOptionsCacheKey = () => {
  const userId = localStorage.getItem('userId') || 'default';
  return `${CACHE_PREFIX}_${userId}`;
};

const emptyFormOptions = () => ({
  suppliers: [],
  parties: [],
  products: [],
  paymentAccounts: [],
});

const emptyVersions = () => ({
  suppliers: '',
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

const normalizeFormOptions = (data = {}) => ({
  suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
  parties: Array.isArray(data.parties) ? data.parties : [],
  products: Array.isArray(data.products) ? data.products : [],
  paymentAccounts: Array.isArray(data.paymentAccounts) ? data.paymentAccounts : [],
});

const normalizeVersions = (versions = {}) => ({
  suppliers: String(versions.suppliers || ''),
  parties: String(versions.parties || ''),
  products: String(versions.products || ''),
  paymentAccounts: String(versions.paymentAccounts || ''),
});

const getFormOptionsCache = () => {
  try {
    const parsed = safeParse(localStorage.getItem(getFormOptionsCacheKey()), null);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      data: normalizeFormOptions(parsed.data),
      versions: normalizeVersions(parsed.versions),
    };
  } catch {
    return null;
  }
};

const saveFormOptionsCache = ({ data, versions }) => {
  const payload = {
    data: normalizeFormOptions(data),
    versions: normalizeVersions(versions),
  };

  try {
    localStorage.setItem(getFormOptionsCacheKey(), JSON.stringify(payload));
  } catch (error) {
    console.error('Purchase invoice options cache save failed:', error);
  }

  return payload;
};

export const getCachedPurchaseInvoiceFormOptions = () => {
  return getFormOptionsCache()?.data || null;
};

export const clearPurchaseInvoiceFormOptionsCache = () => {
  localStorage.removeItem(getFormOptionsCacheKey());
};

export const invalidatePurchaseInvoiceFormOptionsSections = (sections = []) => {
  const cache = getFormOptionsCache();

  if (!cache || !Array.isArray(sections)) {
    return;
  }

  const nextVersions = {
    ...cache.versions,
  };

  sections.forEach((section) => {
    if (Object.prototype.hasOwnProperty.call(nextVersions, section)) {
      nextVersions[section] = '';
    }
  });

  saveFormOptionsCache({
    data: cache.data,
    versions: nextVersions,
  });
};

const requestPurchaseInvoiceFormOptions = async ({ forceRefresh = false } = {}) => {
  const token = getToken();

  if (!token) {
    throw new Error('Authentication token missing');
  }

  const cached = getFormOptionsCache();

  const cachedData = cached?.data || emptyFormOptions();
  const cachedVersions = cached?.versions || emptyVersions();

  const params = {};

  if (!forceRefresh) {
    if (cachedVersions.suppliers) {
      params.suppliersVersion = cachedVersions.suppliers;
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

  const response = await axios.get(`${API_URL}/form-options`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params,
  });

  const payload = response.data;

  if (!payload?.success) {
    throw new Error(payload?.message || 'Failed to load purchase invoice form options');
  }

  const serverVersions = normalizeVersions(payload.versions);

  if (payload.notModified === true && cached) {
    saveFormOptionsCache({
      data: cachedData,
      versions: serverVersions,
    });

    return {
      ...cachedData,
      versions: serverVersions,
      changed: payload.changed || {},
      fromCache: true,
    };
  }

  const changedData = payload?.data || {};

  const mergedData = {
    suppliers: Array.isArray(changedData.suppliers) ? changedData.suppliers : cachedData.suppliers,

    parties: Array.isArray(changedData.parties) ? changedData.parties : cachedData.parties,

    products: Array.isArray(changedData.products) ? changedData.products : cachedData.products,

    paymentAccounts: Array.isArray(changedData.paymentAccounts)
      ? changedData.paymentAccounts
      : cachedData.paymentAccounts,
  };

  saveFormOptionsCache({
    data: mergedData,
    versions: serverVersions,
  });

  return {
    ...mergedData,
    versions: serverVersions,
    changed: payload.changed || {},
    fromCache: false,
  };
};

export const fetchPurchaseInvoiceFormOptions = async (options = {}) => {
  if (activeFormOptionsRequest && !options.forceRefresh) {
    return activeFormOptionsRequest;
  }

  activeFormOptionsRequest = requestPurchaseInvoiceFormOptions(options);

  try {
    return await activeFormOptionsRequest;
  } finally {
    activeFormOptionsRequest = null;
  }
};

const addPurchaseInvoice = async (invoiceData) => {
  try {
    const response = await axios.post(API_URL, invoiceData, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
    });

    invalidatePurchaseInvoiceFormOptionsSections(['products']);

    return response.data;
  } catch (err) {
    console.error('Error adding invoice:', err.response?.data || err.message);
    throw err;
  }
};

const getAllPurchaseInvoices = async (params = {}) => {
  try {
    const response = await axios.get(API_URL, {
      ...getConfig(),

      params: {
        page: params.page || 1,
        limit: params.limit || 50,
        search: params.search || '',
        status: params.status || '',
        dateFilter: params.dateFilter || '',
        fromDate: params.fromDate || '',
        toDate: params.toDate || '',
      },
    });

    return response.data;
  } catch (err) {
    console.error('Error fetching invoices:', err.response?.data || err.message);
    throw err;
  }
};

const getPurchaseInvoiceById = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/${id}`, getConfig());

    return response.data;
  } catch (err) {
    console.error('Error fetching invoice by ID:', err.response?.data || err.message);
    throw err;
  }
};

const updatePurchaseInvoice = async (id, invoiceData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, invoiceData, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
    });

    invalidatePurchaseInvoiceFormOptionsSections(['products']);

    return response.data;
  } catch (err) {
    console.error('Error updating invoice:', err.response?.data || err.message);
    throw err;
  }
};

const deletePurchaseInvoice = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/${id}`, getConfig());

    invalidatePurchaseInvoiceFormOptionsSections(['products']);

    return response.data;
  } catch (err) {
    console.error('Error deleting invoice:', err.response?.data || err.message);
    throw err;
  }
};

export const searchPurchaseInvoices = async (query, limit = 25) => {
  try {
    const response = await axios.get(`${API_URL}/search`, {
      ...getConfig(),
      params: {
        query,
        limit,
      },
    });

    return response.data;
  } catch (err) {
    console.error('Error searching purchase invoices:', err.response?.data || err.message);
    throw err;
  }
};

const getPurchaseInvoices = getAllPurchaseInvoices;

const getItemPurchaseHistory = async (productId, filters = {}) => {
  try {
    const response = await axios.get(`${API_URL}/item-history/${productId}`, {
      ...getConfig(),
      params: {
        supplierId: filters.supplierId || '',
        partyId: filters.partyId || '',
      },
    });

    return response.data;
  } catch (err) {
    console.error('Error fetching item purchase history:', err.response?.data || err.message);
    throw err;
  }
};

const purchaseInvoiceService = {
  addPurchaseInvoice,
  getPurchaseInvoices,
  getAllPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  searchPurchaseInvoices,
  getItemPurchaseHistory,
  fetchPurchaseInvoiceFormOptions,
  getCachedPurchaseInvoiceFormOptions,
  clearPurchaseInvoiceFormOptionsCache,
  invalidatePurchaseInvoiceFormOptionsSections,
};

export default purchaseInvoiceService;
