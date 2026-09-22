import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/journal`;

const getToken = () => localStorage.getItem('token');
const authHeaders = (params = {}) => ({
  headers: { Authorization: `Bearer ${getToken()}` },
  params,
});

const getScopedParams = (options = {}) => {
  const moduleScope = options.moduleScope || options.scope;

  return moduleScope ? { moduleScope } : {};
};

const getDateParams = (startDate, endDate, options = {}) => {
  const params = {
    ...getScopedParams(options),
  };

  if (startDate && endDate) {
    params.startDate = startDate;
    params.endDate = endDate;
  }

  return params;
};

export const createJournalEntry = async (entryData, options = {}) => {
  const moduleScope = options.moduleScope || entryData?.moduleScope || options.scope;
  const res = await axios.post(
    API_URL,
    {
      ...entryData,
      ...(moduleScope ? { moduleScope } : {}),
    },
    authHeaders(getScopedParams({ moduleScope }))
  );

  return res.data;
};

export const getJournalEntries = async (startDate, endDate, options = {}) => {
  const res = await axios.get(API_URL, authHeaders(getDateParams(startDate, endDate, options)));

  return res.data;
};

export const updateJournalEntry = async (id, updatedData, options = {}) => {
  const moduleScope = options.moduleScope || updatedData?.moduleScope || options.scope;
  const res = await axios.put(
    `${API_URL}/${id}`,
    {
      ...updatedData,
      ...(moduleScope ? { moduleScope } : {}),
    },
    authHeaders(getScopedParams({ moduleScope }))
  );

  return res.data;
};

export const deleteJournalEntry = async (id, options = {}) => {
  const res = await axios.delete(`${API_URL}/${id}`, authHeaders(getScopedParams(options)));

  return res.data;
};

export const getTrialBalance = async (startDate, endDate, options = {}) => {
  const res = await axios.get(
    `${API_URL}/trial-balance`,
    authHeaders(getDateParams(startDate, endDate, options))
  );

  return res.data;
};

export const getLedgerByAccount = async (accountId, startDate, endDate, options = {}) => {
  const res = await axios.get(
    `${API_URL}/ledger/${accountId}`,
    authHeaders(getDateParams(startDate, endDate, options))
  );

  return res.data;
};

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

export const fetchMonthVsMonthIncome = async (year) => {
  try {
    const url = `${API_URL}/income-statement/month-vs-month?year=${year}`;
    const res = await axios.get(url, authHeaders());
    return res.data;
  } catch (err) {
    console.error('Month vs Month Income fetch error:', err);
    return null;
  }
};
