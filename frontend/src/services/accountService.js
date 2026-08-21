import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/accounts`;

const getToken = () => localStorage.getItem('token');

const ACCOUNTS_CACHE_KEY = 'accounts_cache_v1';

const getCachedAccounts = () => {
  try {
    const cached = localStorage.getItem(ACCOUNTS_CACHE_KEY);

    if (!cached) return null;

    const parsed = JSON.parse(cached);

    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const setCachedAccounts = (accounts) => {
  if (!Array.isArray(accounts)) return;

  localStorage.setItem(ACCOUNTS_CACHE_KEY, JSON.stringify(accounts));
};

export const clearAccountsCache = () => {
  localStorage.removeItem(ACCOUNTS_CACHE_KEY);
};

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
});

export const getAccounts = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = getCachedAccounts();

    if (cached) {
      return cached;
    }
  }

  const res = await axios.get(API_URL, authHeaders());

  const data = Array.isArray(res.data) ? res.data : [];

  setCachedAccounts(data);

  return data;
};

// ✅ filtered اکاؤنٹس لائیں جو صرف invoice payment کے لیے valid ہوں
export const getValidPaymentAccounts = async (forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = localStorage.getItem('paymentAccounts');

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
  }

  const res = await axios.get(`${API_URL}?filter=payment`, authHeaders());

  localStorage.setItem('paymentAccounts', JSON.stringify(res.data));

  return res.data;
};

// ✅ category کے مطابق اکاؤنٹس لائیں
export const getAccountsByCategory = async (category) => {
  if (!category) return [];
  const res = await axios.get(`${API_URL}?category=${category}`, authHeaders());
  return res.data;
};

export const createAccount = async (data) => {
  const res = await axios.post(API_URL, data, authHeaders());

  clearAccountsCache();

  return res.data;
};

export const updateAccount = async (id, data) => {
  const res = await axios.put(`${API_URL}/${id}`, data, authHeaders());

  clearAccountsCache();

  return res.data;
};

export const deleteAccount = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, authHeaders());

  clearAccountsCache();

  return res.data;
};

export const getCashSummary = async () => {
  const res = await axios.get(`${API_URL}/cash-summary`, authHeaders());
  return res.data;
};

export const getBankSummary = async () => {
  const res = await axios.get(`${API_URL}/bank-summary`, authHeaders());
  return res.data;
};

export const getAccountTransactions = async (accountId) => {
  if (!accountId) return [];
  const res = await axios.get(`${API_URL}/${accountId}/transactions`, authHeaders());
  return res.data;
};

// ✅ alias for consistency
export const getAllAccounts = getAccounts;
