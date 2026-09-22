import axios from 'axios';

import { clearAccountsCache } from './accountService';
import {
  clearTravelCacheDomain,
  clearTravelCacheDomainPrefix,
  TRAVEL_CACHE_DOMAINS,
} from '../utils/travelMasterCache';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/expense`;

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
  params,
});

const getFormValue = (formData, key) => {
  if (formData && typeof formData.get === 'function') {
    return formData.get(key);
  }

  return formData?.[key];
};

const isTravelExpenseScope = (value) => {
  const scope = String(value || '').trim().toLowerCase();

  return scope === 'travel' || scope === 'both';
};

const clearExpenseCaches = (moduleScope) => {
  clearAccountsCache();

  if (isTravelExpenseScope(moduleScope)) {
    clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
    clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
  }
};

// ✅ Create New Expense
export async function createExpense(formData, options = {}) {
  const moduleScope = options.moduleScope || getFormValue(formData, 'moduleScope');
  const response = await axios.post(
    API_URL,
    formData,
    getConfig(moduleScope ? { moduleScope } : {})
  );

  clearExpenseCaches(moduleScope);

  return response.data;
}

export async function getAllExpenses(params = {}) {
  const response = await axios.get(API_URL, getConfig(params));

  return Array.isArray(response.data) ? response.data : [];
}

export async function getExpenseById(id, params = {}) {
  if (!id) {
    throw new Error('Expense ID is required');
  }

  const response = await axios.get(`${API_URL}/${id}`, getConfig(params));

  return response.data || null;
}

// ✅ Update Expense
export async function updateExpense(id, formData, options = {}) {
  const moduleScope = options.moduleScope || getFormValue(formData, 'moduleScope');
  const response = await axios.put(
    `${API_URL}/${id}`,
    formData,
    getConfig(moduleScope ? { moduleScope } : {})
  );

  clearExpenseCaches(moduleScope);

  return response.data;
}

// ✅ Delete Expense
export async function deleteExpense(id, options = {}) {
  const response = await axios.delete(`${API_URL}/${id}`, getConfig(options));

  clearExpenseCaches(options.moduleScope || options.scope);

  return response.data;
}
