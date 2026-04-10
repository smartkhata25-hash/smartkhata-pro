import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/accounts`;

const getToken = () => localStorage.getItem('token');

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
});

// ✅ تمام اکاؤنٹس لائیں (unfiltered)
export const getAccounts = async () => {
  const res = await axios.get(API_URL, authHeaders());
  return res.data;
};

// ✅ filtered اکاؤنٹس لائیں جو صرف invoice payment کے لیے valid ہوں
export const getValidPaymentAccounts = async () => {
  const res = await axios.get(`${API_URL}?filter=payment`, authHeaders());
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
  return res.data;
};

export const updateAccount = async (id, data) => {
  const res = await axios.put(`${API_URL}/${id}`, data, authHeaders());
  return res.data;
};

export const deleteAccount = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, authHeaders());
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
