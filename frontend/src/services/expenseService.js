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

const clearTravelExpenseCaches = () => {
  clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
  clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
  clearAccountsCache();
};

// ✅ Create New Expense
export async function createExpense(formData) {
  const response = await axios.post(API_URL, formData, getConfig());

  if (isTravelExpenseScope(getFormValue(formData, 'moduleScope'))) {
    clearTravelExpenseCaches();
  }

  return response.data;
}

export async function getAllExpenses(params = {}) {
  const response = await axios.get(API_URL, getConfig(params));

  return Array.isArray(response.data) ? response.data : [];
}

export async function getExpenseById(id) {
  if (!id) {
    throw new Error('Expense ID is required');
  }

  const response = await axios.get(`${API_URL}/${id}`, getConfig());

  return response.data || null;
}

// ✅ Update Expense
export async function updateExpense(id, formData) {
  const response = await axios.put(`${API_URL}/${id}`, formData, getConfig());

  if (isTravelExpenseScope(getFormValue(formData, 'moduleScope'))) {
    clearTravelExpenseCaches();
  }

  return response.data;
}

// ✅ Delete Expense
export async function deleteExpense(id, options = {}) {
  const response = await axios.delete(`${API_URL}/${id}`, getConfig(options));

  if (isTravelExpenseScope(options.moduleScope || options.scope)) {
    clearTravelExpenseCaches();
  }

  return response.data;
}
