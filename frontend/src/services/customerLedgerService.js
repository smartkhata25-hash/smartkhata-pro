// 📁 src/services/customerLedgerService.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getToken = () => localStorage.getItem('token');

const API_URL = `${BASE_URL}/api/customer-ledger`;

// ✅ Customer ledger screens should use Customer._id; account-id fallback stays backend-only.
export const getLedgerByCustomerId = async (customerId, start, end, options = {}) => {
  if (!customerId) {
    throw new Error('CustomerId is required for ledger');
  }

  const params = {};
  if (start && end) {
    params.startDate = start;
    params.endDate = end;
  }

  if (options.moduleScope) {
    params.moduleScope = options.moduleScope;
  }

  const res = await axios.get(`${API_URL}/${customerId}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
    params,
  });

  return res.data;
};

// Backward-compatible alias for older callers. The backend can still resolve
// account ids, but new ledger screens should pass Customer._id.
export const getLedgerByCustomerAccount = async (accountId, start, end, options = {}) =>
  getLedgerByCustomerId(accountId, start, end, options);

export const getCustomerBalance = async (accountId) => {
  if (!accountId) {
    throw new Error('AccountId is required for balance');
  }

  const res = await axios.get(`${API_URL}/balance/${accountId}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return res.data;
};
// ✅ Add new journal entry
export const addJournalEntry = async (entryData) => {
  const res = await axios.post(API_URL, entryData, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  return res.data;
};

// ✅ Update journal entry
export const updateJournalEntry = async (id, entryData) => {
  const res = await axios.put(`${API_URL}/${id}`, entryData, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  return res.data;
};

// ✅ Delete journal entry
export const deleteJournalEntry = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });
  return res.data;
};
