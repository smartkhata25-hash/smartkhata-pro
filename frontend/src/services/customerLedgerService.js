// 📁 src/services/customerLedgerService.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/journal`;

const getToken = () => localStorage.getItem('token');

// ✅ ONLY & FINAL: Get ledger by CUSTOMER ACCOUNT (CORRECT ACCOUNTING)
export const getLedgerByCustomerAccount = async (accountId, start, end) => {
  if (!accountId) {
    throw new Error('AccountId is required for ledger');
  }

  let url = `${API_URL}/ledger/${accountId}`;

  if (start && end) {
    url += `?startDate=${start}&endDate=${end}`;
  }

  const res = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  });

  return res.data;
};

// ❌ REMOVED ON PURPOSE
// ❌ getLedgerByCustomerId (customer-based ledger is WEAK & WRONG)

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
