import axios from 'axios';

import { clearAccountsCache } from './accountService';
import { clearTravelReminderCache } from './travelReminderService';
import {
  getCachedTravelRecords,
  hasTravelCache,
  clearTravelCacheDomainPrefix,
  clearTravelCacheDomain,
  removeCachedTravelRecord,
  setCachedTravelRecords,
  upsertCachedTravelRecord,
  TRAVEL_CACHE_DOMAINS,
} from '../utils/travelMasterCache';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const TRAVEL_API = `${BASE_URL}/api/travel`;
const SUPPLIER_API = `${BASE_URL}/api/suppliers`;
const CUSTOMER_API = `${BASE_URL}/api/customers`;
const TRAVEL_DASHBOARD_CACHE_MAX_AGE_MS = 30 * 1000;
const TRAVEL_REPORT_CACHE_MAX_AGE_MS = 30 * 1000;

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
  params,
});

const isFileLike = (value) => typeof File !== 'undefined' && value instanceof File;

const hasUploadFiles = (data = {}) =>
  Array.isArray(data.attachments) && data.attachments.some((file) => isFileLike(file));

const buildMultipartPayload = (data = {}) => {
  const formData = new FormData();

  Object.entries(data || {}).forEach(([key, value]) => {
    if (key === 'attachments') {
      (value || []).filter(isFileLike).forEach((file) => {
        formData.append('attachments', file);
      });

      return;
    }

    if (value === undefined || value === null || value === '') {
      return;
    }

    if (Array.isArray(value) || typeof value === 'object') {
      formData.append(key, JSON.stringify(value));

      return;
    }

    formData.append(key, value);
  });

  return formData;
};

const prepareUploadPayload = (data = {}) => (hasUploadFiles(data) ? buildMultipartPayload(data) : data);

const normalizeParams = (params = {}) =>
  Object.entries(params || {}).reduce((result, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }

    return result;
  }, {});

const isCacheableListRequest = (params = {}) => {
  const safeParams = normalizeParams(params);
  const nonCacheKeys = ['search', 'categoryId', 'city', 'country', 'vendorId', 'vendorType'];

  return !nonCacheKeys.some((key) => safeParams[key]);
};

const fetchList = async (domain, url, params = {}, options = {}) => {
  const safeParams = normalizeParams(params);
  const cacheable = isCacheableListRequest(safeParams);

  if (!options.forceRefresh && cacheable && hasTravelCache(domain)) {
    return getCachedTravelRecords(domain);
  }

  const response = await axios.get(url, getConfig(safeParams));
  const data = Array.isArray(response.data) ? response.data : [];

  if (cacheable) {
    setCachedTravelRecords(domain, data);
  }

  return data;
};

const createRecord = async (domain, url, data) => {
  const response = await axios.post(url, data, getConfig());

  upsertCachedTravelRecord(domain, response.data);

  return response.data;
};

const updateRecord = async (domain, url, data) => {
  const response = await axios.put(url, data, getConfig());

  upsertCachedTravelRecord(domain, response.data);

  return response.data;
};

const updateStatus = async (domain, url, isActive) => {
  const response = await axios.patch(url, { isActive }, getConfig());

  upsertCachedTravelRecord(domain, response.data);

  return response.data;
};

const deleteRecord = async (domain, url, options = {}) => {
  const response = await axios.delete(url, getConfig(normalizeParams(options)));

  removeCachedTravelRecord(domain, options.recordId);

  return response.data;
};

const fetchReferenceRecord = async (domain, url, options = {}) => {
  if (!options.forceRefresh && hasTravelCache(domain)) {
    return getCachedTravelRecords(domain)[0] || null;
  }

  const response = await axios.get(url, getConfig());
  setCachedTravelRecords(domain, response.data ? [response.data] : []);

  return response.data;
};

const fetchBookingList = async (params = {}, options = {}) => {
  const safeParams = normalizeParams(params);
  const cacheable =
    Object.keys(safeParams).length === 0 ||
    Object.keys(safeParams).every((key) =>
      ['page', 'limit'].includes(key) && String(safeParams[key]) === (key === 'page' ? '1' : '50')
    );

  if (!options.forceRefresh && cacheable && hasTravelCache(TRAVEL_CACHE_DOMAINS.BOOKINGS)) {
    return {
      data: getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.BOOKINGS),
      total: getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.BOOKINGS).length,
      page: 1,
      limit: 50,
    };
  }

  const response = await axios.get(`${TRAVEL_API}/bookings`, getConfig(safeParams));
  const payload = response.data || {};
  const bookings = Array.isArray(payload.data) ? payload.data : [];

  if (cacheable) {
    setCachedTravelRecords(TRAVEL_CACHE_DOMAINS.BOOKINGS, bookings);
  }

  return {
    data: bookings,
    total: Number(payload.total || bookings.length),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || 50),
  };
};

const clearTravelBookingFinancialCaches = () => {
  clearAccountsCache();
  clearTravelReminderCache();
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.BOOKINGS);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.VENDORS);
  clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
};

const clearTravelCustomerFinancialCaches = () => {
  clearAccountsCache();
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS);
  clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
};

const clearTravelVendorFinancialCaches = () => {
  clearAccountsCache();
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.VENDORS);
  clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
};

const clearTravelRefundFinancialCaches = () => {
  clearTravelBookingFinancialCaches();
};

const clearTravelVendorReturnFinancialCaches = () => {
  clearAccountsCache();
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.VENDORS);
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.VENDOR_RETURNS);
  clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
};

const getTravelReportCacheDomain = (params = {}) => {
  const safeParams = normalizeParams(params);
  const searchParams = new URLSearchParams();

  Object.keys(safeParams)
    .sort()
    .forEach((key) => {
      searchParams.set(key, safeParams[key]);
    });

  return `${TRAVEL_CACHE_DOMAINS.REPORTS}:${searchParams.toString()}`;
};

const updateReferenceRecord = async (domain, url, data) => {
  const response = await axios.put(url, data, getConfig());
  setCachedTravelRecords(domain, response.data ? [response.data] : []);

  return response.data;
};

export const fetchTravelers = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.TRAVELERS,
    `${TRAVEL_API}/travelers`,
    { status: 'all', limit: 500, ...params },
    options
  );

export const createTraveler = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.TRAVELERS, `${TRAVEL_API}/travelers`, data);

export const updateTraveler = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.TRAVELERS, `${TRAVEL_API}/travelers/${id}`, data);

export const updateTravelerStatus = (id, isActive) =>
  updateStatus(TRAVEL_CACHE_DOMAINS.TRAVELERS, `${TRAVEL_API}/travelers/${id}/status`, isActive);

export const deleteTraveler = (id, options = {}) =>
  deleteRecord(TRAVEL_CACHE_DOMAINS.TRAVELERS, `${TRAVEL_API}/travelers/${id}`, {
    ...options,
    recordId: id,
  });

export const fetchTravelServiceCategories = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES,
    `${TRAVEL_API}/service-categories`,
    { status: 'all', limit: 500, ...params },
    options
  );

export const createTravelServiceCategory = (data) =>
  createRecord(
    TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES,
    `${TRAVEL_API}/service-categories`,
    data
  );

export const updateTravelServiceCategory = (id, data) =>
  updateRecord(
    TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES,
    `${TRAVEL_API}/service-categories/${id}`,
    data
  );

export const updateTravelServiceCategoryStatus = (id, isActive) =>
  updateStatus(
    TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES,
    `${TRAVEL_API}/service-categories/${id}/status`,
    isActive
  );

export const deleteTravelServiceCategory = (id, options = {}) =>
  deleteRecord(
    TRAVEL_CACHE_DOMAINS.SERVICE_CATEGORIES,
    `${TRAVEL_API}/service-categories/${id}`,
    {
      ...options,
      recordId: id,
    }
  );

export const fetchTravelServices = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.SERVICES,
    `${TRAVEL_API}/services`,
    { status: 'all', limit: 500, ...params },
    options
  );

export const createTravelService = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.SERVICES, `${TRAVEL_API}/services`, data);

export const updateTravelService = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.SERVICES, `${TRAVEL_API}/services/${id}`, data);

export const updateTravelServiceStatus = (id, isActive) =>
  updateStatus(TRAVEL_CACHE_DOMAINS.SERVICES, `${TRAVEL_API}/services/${id}/status`, isActive);

export const deleteTravelService = (id, options = {}) =>
  deleteRecord(TRAVEL_CACHE_DOMAINS.SERVICES, `${TRAVEL_API}/services/${id}`, {
    ...options,
    recordId: id,
  });

export const fetchTravelHotels = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.HOTELS,
    `${TRAVEL_API}/hotels`,
    { status: 'all', limit: 500, ...params },
    options
  );

export const createTravelHotel = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.HOTELS, `${TRAVEL_API}/hotels`, data);

export const updateTravelHotel = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.HOTELS, `${TRAVEL_API}/hotels/${id}`, data);

export const updateTravelHotelStatus = (id, isActive) =>
  updateStatus(TRAVEL_CACHE_DOMAINS.HOTELS, `${TRAVEL_API}/hotels/${id}/status`, isActive);

export const deleteTravelHotel = (id, options = {}) =>
  deleteRecord(TRAVEL_CACHE_DOMAINS.HOTELS, `${TRAVEL_API}/hotels/${id}`, {
    ...options,
    recordId: id,
  });

export const fetchTravelAirlines = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.AIRLINES,
    `${TRAVEL_API}/airlines`,
    { status: 'all', limit: 500, ...params },
    options
  );

export const createTravelAirline = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.AIRLINES, `${TRAVEL_API}/airlines`, data);

export const updateTravelAirline = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.AIRLINES, `${TRAVEL_API}/airlines/${id}`, data);

export const updateTravelAirlineStatus = (id, isActive) =>
  updateStatus(TRAVEL_CACHE_DOMAINS.AIRLINES, `${TRAVEL_API}/airlines/${id}/status`, isActive);

export const deleteTravelAirline = (id, options = {}) =>
  deleteRecord(TRAVEL_CACHE_DOMAINS.AIRLINES, `${TRAVEL_API}/airlines/${id}`, {
    ...options,
    recordId: id,
  });

export const fetchTravelAirports = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.AIRPORTS,
    `${TRAVEL_API}/airports`,
    { status: 'all', limit: 800, ...params },
    options
  );

export const createTravelAirport = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.AIRPORTS, `${TRAVEL_API}/airports`, data);

export const updateTravelAirport = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.AIRPORTS, `${TRAVEL_API}/airports/${id}`, data);

export const updateTravelAirportStatus = (id, isActive) =>
  updateStatus(TRAVEL_CACHE_DOMAINS.AIRPORTS, `${TRAVEL_API}/airports/${id}/status`, isActive);

export const deleteTravelAirport = (id, options = {}) =>
  deleteRecord(TRAVEL_CACHE_DOMAINS.AIRPORTS, `${TRAVEL_API}/airports/${id}`, {
    ...options,
    recordId: id,
  });

export const fetchTravelVendors = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.VENDORS,
    `${SUPPLIER_API}/travel-vendors`,
    { status: 'active', limit: 500, ...params },
    options
  );

export const createTravelVendor = (data) =>
  createRecord(TRAVEL_CACHE_DOMAINS.VENDORS, `${SUPPLIER_API}/travel-vendors`, data);

export const updateTravelVendor = (id, data) =>
  updateRecord(TRAVEL_CACHE_DOMAINS.VENDORS, `${SUPPLIER_API}/travel-vendors/${id}`, data);

export const deleteTravelVendor = async (id, options = {}) => {
  const response = await axios.delete(
    `${SUPPLIER_API}/travel-vendors/${id}`,
    getConfig(normalizeParams(options))
  );

  removeCachedTravelRecord(TRAVEL_CACHE_DOMAINS.VENDORS, id);
  clearTravelVendorFinancialCaches();

  return response.data;
};

export const fetchTravelCustomers = (params = {}, options = {}) =>
  fetchList(
    TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS,
    `${CUSTOMER_API}/travel-options`,
    { status: 'active', limit: 500, ...params },
    options
  );

export const createTravelCustomer = async (data) => {
  const response = await axios.post(`${CUSTOMER_API}/travel-quick-add`, data, getConfig());

  if (response.data?._id) {
    upsertCachedTravelRecord(TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS, response.data);
  }

  return response.data;
};

export const updateTravelCustomer = async (id, data) => {
  const response = await axios.put(`${CUSTOMER_API}/travel-options/${id}`, data, getConfig());

  if (response.data?._id) {
    upsertCachedTravelRecord(TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS, response.data);
  }

  return response.data;
};

export const deleteTravelCustomer = async (id, options = {}) => {
  const response = await axios.delete(
    `${CUSTOMER_API}/travel-options/${id}`,
    getConfig(normalizeParams(options))
  );

  removeCachedTravelRecord(TRAVEL_CACHE_DOMAINS.TRAVEL_CUSTOMERS, id);
  clearTravelCustomerFinancialCaches();

  return response.data;
};

export const fetchTravelBookings = fetchBookingList;

export const fetchTravelBookingById = async (id) => {
  const response = await axios.get(`${TRAVEL_API}/bookings/${id}`, getConfig());

  return response.data;
};

export const getTravelBookingPreviewUrl = (id) => `${TRAVEL_API}/print/bookings/${id}/preview`;

export const getTravelBookingPrintUrl = (id) => `${TRAVEL_API}/print/bookings/${id}/print`;

export const getTravelBookingPdfUrl = (id) => `${TRAVEL_API}/print/bookings/${id}/pdf`;

export const getTravelReceivePaymentPrintUrl = (id) =>
  `${TRAVEL_API}/print/payments/received/${id}/print`;

export const getTravelReceivePaymentPreviewUrl = (id) =>
  `${TRAVEL_API}/print/payments/received/${id}/preview`;

export const getTravelReceivePaymentPdfUrl = (id) =>
  `${TRAVEL_API}/print/payments/received/${id}/pdf`;

export const getTravelVendorPaymentPrintUrl = (id) =>
  `${TRAVEL_API}/print/payments/vendors/${id}/print`;

export const getTravelVendorPaymentPreviewUrl = (id) =>
  `${TRAVEL_API}/print/payments/vendors/${id}/preview`;

export const getTravelVendorPaymentPdfUrl = (id) =>
  `${TRAVEL_API}/print/payments/vendors/${id}/pdf`;

export const getTravelRefundPreviewUrl = (id) => `${TRAVEL_API}/print/refunds/${id}/preview`;

export const getTravelRefundPrintUrl = (id) => `${TRAVEL_API}/print/refunds/${id}/print`;

export const getTravelRefundPdfUrl = (id) => `${TRAVEL_API}/print/refunds/${id}/pdf`;

export const getTravelVendorReturnPreviewUrl = (id) =>
  `${TRAVEL_API}/print/vendor-returns/${id}/preview`;

export const getTravelVendorReturnPrintUrl = (id) =>
  `${TRAVEL_API}/print/vendor-returns/${id}/print`;

export const getTravelVendorReturnPdfUrl = (id) =>
  `${TRAVEL_API}/print/vendor-returns/${id}/pdf`;

export const createTravelBooking = async (data) => {
  const response = await axios.post(`${TRAVEL_API}/bookings`, prepareUploadPayload(data), getConfig());
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const updateTravelBooking = async (id, data) => {
  const response = await axios.put(`${TRAVEL_API}/bookings/${id}`, prepareUploadPayload(data), getConfig());
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const updateTravelBookingStatus = async (id, status, note = '') => {
  const response = await axios.patch(`${TRAVEL_API}/bookings/${id}/status`, { status, note }, getConfig());
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const cancelTravelBooking = async (id, note = '') => {
  const response = await axios.patch(`${TRAVEL_API}/bookings/${id}/cancel`, { note }, getConfig());
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const deleteTravelBooking = async (id, options = {}) => {
  const response = await axios.delete(
    `${TRAVEL_API}/bookings/${id}`,
    getConfig(normalizeParams(options))
  );
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const voidTravelBooking = async (id, data = {}) => {
  const response = await axios.post(`${TRAVEL_API}/bookings/${id}/void`, data, getConfig());
  clearTravelBookingFinancialCaches();

  return response.data;
};

export const fetchTravelPaymentAccounts = async () => {
  const response = await axios.get(`${TRAVEL_API}/bookings/payment-accounts`, getConfig());

  return Array.isArray(response.data) ? response.data : [];
};

export const fetchTravelRefundableInvoices = async (params = {}) => {
  const response = await axios.get(
    `${TRAVEL_API}/refunds/refundable-invoices`,
    getConfig(normalizeParams(params))
  );

  return Array.isArray(response.data) ? response.data : [];
};

export const fetchTravelRefunds = async (params = {}) => {
  const response = await axios.get(`${TRAVEL_API}/refunds`, getConfig(normalizeParams(params)));
  const payload = response.data || {};
  const refunds = Array.isArray(payload.data) ? payload.data : [];

  return {
    data: refunds,
    total: Number(payload.total || refunds.length),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || 50),
  };
};

export const fetchTravelRefundById = async (id) => {
  const response = await axios.get(`${TRAVEL_API}/refunds/${id}`, getConfig());

  return response.data;
};

export const createTravelRefund = async (data) => {
  const response = await axios.post(`${TRAVEL_API}/refunds`, prepareUploadPayload(data), getConfig());
  clearTravelRefundFinancialCaches();

  return response.data;
};

export const deleteTravelRefund = async (id, options = {}) => {
  const response = await axios.delete(
    `${TRAVEL_API}/refunds/${id}`,
    getConfig(normalizeParams(options))
  );
  clearTravelRefundFinancialCaches();

  return response.data;
};

export const createTravelReceivePayment = async (data) => {
  const response = await axios.post(`${TRAVEL_API}/payments/receive`, data, getConfig());
  clearTravelCustomerFinancialCaches();

  return response.data;
};

export const fetchTravelReceivePayments = async (params = {}) => {
  const response = await axios.get(
    `${TRAVEL_API}/payments/received`,
    getConfig(normalizeParams(params))
  );
  const payload = response.data || {};
  const records = Array.isArray(payload.data) ? payload.data : [];

  return {
    data: records,
    total: Number(payload.total || records.length),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || 50),
  };
};

export const deleteTravelReceivePayment = async (id, options = {}) => {
  const response = await axios.delete(
    `${TRAVEL_API}/payments/received/${id}`,
    getConfig(normalizeParams(options))
  );
  clearTravelCustomerFinancialCaches();

  return response.data;
};

export const createTravelVendorPayment = async (data) => {
  const response = await axios.post(`${TRAVEL_API}/payments/vendor`, data, getConfig());
  clearTravelVendorFinancialCaches();

  return response.data;
};

export const fetchTravelVendorPayments = async (params = {}) => {
  const response = await axios.get(
    `${TRAVEL_API}/payments/vendors`,
    getConfig(normalizeParams(params))
  );
  const payload = response.data || {};
  const records = Array.isArray(payload.data) ? payload.data : [];

  return {
    data: records,
    total: Number(payload.total || records.length),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || 50),
  };
};

export const deleteTravelVendorPayment = async (id, options = {}) => {
  const response = await axios.delete(
    `${TRAVEL_API}/payments/vendors/${id}`,
    getConfig(normalizeParams(options))
  );
  clearTravelVendorFinancialCaches();

  return response.data;
};

export const fetchTravelVendorReturnInvoices = async (params = {}) => {
  const response = await axios.get(
    `${TRAVEL_API}/vendor-returns/eligible-invoices`,
    getConfig(normalizeParams(params))
  );

  return Array.isArray(response.data) ? response.data : [];
};

export const fetchTravelVendorReturns = async (params = {}, options = {}) => {
  const safeParams = normalizeParams(params);
  const cacheable = Object.keys(safeParams).length === 0;

  if (!options.forceRefresh && cacheable && hasTravelCache(TRAVEL_CACHE_DOMAINS.VENDOR_RETURNS)) {
    const cached = getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.VENDOR_RETURNS);

    return {
      data: cached,
      total: cached.length,
      page: 1,
      limit: 50,
    };
  }

  const response = await axios.get(`${TRAVEL_API}/vendor-returns`, getConfig(safeParams));
  const payload = response.data || {};
  const records = Array.isArray(payload.data) ? payload.data : [];

  if (cacheable) {
    setCachedTravelRecords(TRAVEL_CACHE_DOMAINS.VENDOR_RETURNS, records);
  }

  return {
    data: records,
    total: Number(payload.total || records.length),
    page: Number(payload.page || 1),
    limit: Number(payload.limit || 50),
  };
};

export const fetchTravelVendorReturnById = async (id) => {
  const response = await axios.get(`${TRAVEL_API}/vendor-returns/${id}`, getConfig());

  return response.data;
};

export const createTravelVendorReturn = async (data) => {
  const response = await axios.post(
    `${TRAVEL_API}/vendor-returns`,
    prepareUploadPayload(data),
    getConfig()
  );
  clearTravelVendorReturnFinancialCaches();

  return response.data;
};

export const deleteTravelVendorReturn = async (id, options = {}) => {
  const response = await axios.delete(
    `${TRAVEL_API}/vendor-returns/${id}`,
    getConfig(normalizeParams(options))
  );
  clearTravelVendorReturnFinancialCaches();

  return response.data;
};

export const fetchTravelDashboardSummary = async (options = {}) => {
  if (
    !options.forceRefresh &&
    hasTravelCache(TRAVEL_CACHE_DOMAINS.DASHBOARD, {
      maxAgeMs: TRAVEL_DASHBOARD_CACHE_MAX_AGE_MS,
    })
  ) {
    return getCachedTravelRecords(TRAVEL_CACHE_DOMAINS.DASHBOARD)[0] || null;
  }

  const response = await axios.get(
    `${TRAVEL_API}/dashboard-summary`,
    getConfig(options.forceRefresh ? { refresh: 'true' } : {})
  );
  setCachedTravelRecords(TRAVEL_CACHE_DOMAINS.DASHBOARD, response.data ? [response.data] : []);

  return response.data;
};

export const fetchTravelReportSummary = async (params = {}, options = {}) => {
  const safeParams = normalizeParams(params);
  const cacheDomain = getTravelReportCacheDomain(safeParams);

  if (
    !options.forceRefresh &&
    hasTravelCache(cacheDomain, {
      maxAgeMs: TRAVEL_REPORT_CACHE_MAX_AGE_MS,
    })
  ) {
    return getCachedTravelRecords(cacheDomain)[0] || null;
  }

  const response = await axios.get(
    `${TRAVEL_API}/reports/summary`,
    getConfig({
      ...safeParams,
      ...(options.forceRefresh ? { refresh: 'true' } : {}),
    })
  );

  setCachedTravelRecords(cacheDomain, response.data ? [response.data] : []);

  return response.data;
};

export const fetchTravelCurrencySettings = (options = {}) =>
  fetchReferenceRecord(
    TRAVEL_CACHE_DOMAINS.CURRENCY_SETTINGS,
    `${TRAVEL_API}/currency-settings`,
    options
  );

export const updateTravelCurrencySettings = (data) =>
  updateReferenceRecord(
    TRAVEL_CACHE_DOMAINS.CURRENCY_SETTINGS,
    `${TRAVEL_API}/currency-settings`,
    data
  );
