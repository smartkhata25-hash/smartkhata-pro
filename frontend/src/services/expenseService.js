import axios from 'axios';

import { clearAccountsCache } from './accountService';
import {
  clearTravelCacheDomain,
  clearTravelCacheDomainPrefix,
  TRAVEL_CACHE_DOMAINS,
} from '../utils/travelMasterCache';
import {
  cachedInstallmentsRequest,
  INSTALLMENTS_CACHE_DOMAINS as INSTALLMENTS_D,
  INSTALLMENTS_STALE_TIME as INSTALLMENTS_TTL,
  invalidateInstallmentsExpenseData,
} from '../utils/installmentsMasterCache';

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

const isInstallmentsExpenseScope = (value) => String(value || '').trim().toLowerCase() === 'installments';

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
  if (isInstallmentsExpenseScope(moduleScope)) invalidateInstallmentsExpenseData();

  return response.data;
}

export async function getAllExpenses(params = {}) {
  if (isInstallmentsExpenseScope(params.moduleScope || params.scope)) {
    return cachedInstallmentsRequest(
      INSTALLMENTS_D.EXPENSES,
      params,
      async () => {
        const response = await axios.get(API_URL, getConfig(params));
        return Array.isArray(response.data) ? response.data : response.data?.rows ? response.data : [];
      },
      { staleTime: INSTALLMENTS_TTL.FINANCIAL }
    );
  }
  const response = await axios.get(API_URL, getConfig(params));

  return Array.isArray(response.data) ? response.data : response.data?.rows ? response.data : [];
}

export async function getExpenseById(id, params = {}) {
  if (!id) {
    throw new Error('Expense ID is required');
  }

  if (isInstallmentsExpenseScope(params.moduleScope || params.scope)) {
    return cachedInstallmentsRequest(
      INSTALLMENTS_D.EXPENSE_DETAIL,
      { id, ...params },
      async () => {
        const response = await axios.get(`${API_URL}/${id}`, getConfig(params));
        return response.data || null;
      },
      { staleTime: INSTALLMENTS_TTL.FINANCIAL }
    );
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
  if (isInstallmentsExpenseScope(moduleScope)) invalidateInstallmentsExpenseData();

  return response.data;
}

// ✅ Delete Expense
export async function deleteExpense(id, options = {}) {
  const response = await axios.delete(`${API_URL}/${id}`, getConfig(options));

  clearExpenseCaches(options.moduleScope || options.scope);
  if (isInstallmentsExpenseScope(options.moduleScope || options.scope)) invalidateInstallmentsExpenseData();

  return response.data;
}
