// 📁 src/services/customerLedgerService.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/journal`;

const getToken = () => localStorage.getItem('token');

// ✅ Get ledger by customer’s accountId
export const getLedgerByCustomerAccount = async (accountId, start, end) => {
  let url = `${API_URL}/ledger/${accountId}`;
  if (start && end) {
    url += `?startDate=${start}&endDate=${end}`;
  }

  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });

  return res.data;
};

// ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅
// ✅ نیا فنکشن: Get ledger by customerId (NOT accountId)
export const getLedgerByCustomerId = async (customerId, start, end) => {
  const res = await axios.get(`${BASE_URL}/api/customer-ledger/${customerId}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    params: {
      startDate: start,
      endDate: end,
    },
  });
  return res.data;
};
// ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅ ✅

// ✅ Add new journal entry (e.g. payment, adjustment)
export const addJournalEntry = async (entryData) => {
  const res = await axios.post(API_URL, entryData, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.data;
};

// ✅ Update journal entry
export const updateJournalEntry = async (id, entryData) => {
  const res = await axios.put(`${API_URL}/${id}`, entryData, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.data;
};

// ✅ Delete journal entry
export const deleteJournalEntry = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  return res.data;
};
