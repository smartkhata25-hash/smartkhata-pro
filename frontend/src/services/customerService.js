// ✅ src/services/customerService.js

import axios from 'axios';

import {
  getCachedCustomers,
  setCachedCustomers,
  hasCustomerCache,
  setCustomerVersion,
  isCustomerVersionChanged,
} from '../utils/customerCache';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/customers`;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = (token = null) => ({
  headers: {
    Authorization: `Bearer ${token || getToken()}`,
  },
});

export const getCustomers = async (token = null, params = {}) => {
  const response = await axios.get(API_URL, {
    ...getAuthHeaders(token),
    params,
  });

  return response.data;
};

export const fetchCustomerDataVersion = async (token = null) => {
  const response = await axios.get(`${API_URL}/data-version`, getAuthHeaders(token));

  return response.data;
};

export const fetchCustomers = async (token = null, params = {}, forceRefresh = false) => {
  const safeParams = params || {};

  const cacheableAllRequest = Object.keys(safeParams).length === 1 && safeParams.status === 'all';

  const hasNonCacheableParams = Object.keys(safeParams).length > 0 && !cacheableAllRequest;

  if (hasNonCacheableParams) {
    return await getCustomers(token, safeParams);
  }

  if (forceRefresh) {
    const [data, versionData] = await Promise.all([
      getCustomers(token, safeParams),
      fetchCustomerDataVersion(token),
    ]);

    setCachedCustomers(data);

    if (versionData?.version !== null && versionData?.version !== undefined) {
      setCustomerVersion(versionData.version);
    }

    return data;
  }

  const cacheExists = hasCustomerCache();

  if (!cacheExists) {
    const [data, versionData] = await Promise.all([
      getCustomers(token),
      fetchCustomerDataVersion(token),
    ]);

    setCachedCustomers(data);

    if (versionData?.version !== null && versionData?.version !== undefined) {
      setCustomerVersion(versionData.version);
    }

    return data;
  }

  const cachedCustomers = getCachedCustomers();

  try {
    const versionData = await fetchCustomerDataVersion(token);

    const serverVersion = versionData?.version ?? null;

    if (!isCustomerVersionChanged(serverVersion)) {
      return cachedCustomers;
    }

    const freshCustomers = await getCustomers(token);

    setCachedCustomers(freshCustomers);

    if (serverVersion !== null && serverVersion !== undefined) {
      setCustomerVersion(serverVersion);
    }

    return freshCustomers;
  } catch (error) {
    console.error('Customer cache/version check failed:', error);

    return cachedCustomers;
  }
};

export const addCustomer = async (customerData, token = null) => {
  const response = await axios.post(API_URL, customerData, getAuthHeaders(token));

  return response.data;
};

export const updateCustomer = async (id, customerData, token = null) => {
  const response = await axios.put(`${API_URL}/${id}`, customerData, getAuthHeaders(token));

  return response.data;
};

export const deleteCustomer = async (id, token = null) => {
  const response = await axios.delete(`${API_URL}/${id}`, getAuthHeaders(token));

  return response.data;
};

export const restoreCustomer = async (id, token = null) => {
  const response = await axios.post(`${API_URL}/${id}/restore`, {}, getAuthHeaders(token));

  return response.data;
};

export const fetchCustomerByName = async (name, token = null) => {
  const response = await axios.get(
    `${API_URL}/search?name=${encodeURIComponent(name)}`,
    getAuthHeaders(token)
  );

  return response.data;
};

export const confirmMergeCustomers = async (payload, token = null) => {
  const response = await axios.post(`${API_URL}/merge/confirm`, payload, getAuthHeaders(token));

  return response.data;
};

export const convertCustomerToParty = async (id, token = null) => {
  const response = await axios.post(`${API_URL}/${id}/convert-to-party`, {}, getAuthHeaders(token));

  return response.data;
};
