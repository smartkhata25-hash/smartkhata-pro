// ✅ src/services/journalService.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/journal`;

const getToken = () => localStorage.getItem('token');
const authHeaders = () => ({
  headers: { Authorization: `Bearer ${getToken()}` },
});

// ✅ Create journal entry
export const createJournalEntry = async (entryData) => {
  const res = await axios.post(API_URL, entryData, authHeaders());
  return res.data;
};

// ✅ Get journal entries (with optional date filter)
export const getJournalEntries = async (startDate, endDate) => {
  let url = API_URL;
  if (startDate && endDate) {
    url += `?startDate=${startDate}&endDate=${endDate}`;
  }

  const res = await axios.get(url, authHeaders());
  return res.data;
};

// ✅ Update entry
export const updateJournalEntry = async (id, updatedData) => {
  const res = await axios.put(`${API_URL}/${id}`, updatedData, authHeaders());
  return res.data;
};

// ✅ Delete entry
export const deleteJournalEntry = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, authHeaders());
  return res.data;
};

// ✅ Trial Balance
export const getTrialBalance = async (startDate, endDate) => {
  let url = `${API_URL}/trial-balance`;
  if (startDate && endDate) {
    url += `?startDate=${startDate}&endDate=${endDate}`;
  }

  const res = await axios.get(url, authHeaders());
  return res.data;
};

// ✅ General Ledger by Account with Date Filter
export const getLedgerByAccount = async (accountId, startDate, endDate) => {
  let url = `${API_URL}/ledger/${accountId}`;
  if (startDate && endDate) {
    url += `?startDate=${startDate}&endDate=${endDate}`;
  }

  const res = await axios.get(url, authHeaders());
  return res.data;
};

// ✅ Get Income Statement
export const fetchIncomeStatement = async (startDate, endDate) => {
  try {
    const url = `${API_URL}/income-statement?startDate=${startDate}&endDate=${endDate}`;
    const res = await axios.get(url, authHeaders());
    return res.data;
  } catch (err) {
    console.error('Income Statement fetch error:', err);
    return null;
  }
};
