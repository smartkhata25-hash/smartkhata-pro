import axios from 'axios';

import { clearAccountsCache } from './accountService';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/weaving/employees/payroll`;

const getToken = () => localStorage.getItem('token');

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  params,
});

const unwrap = (response) => response.data?.data ?? response.data;

const normalizeCycleKey = (cycleKey = '') => String(cycleKey || '').trim();

export const getWeavingPayrollCycle = async ({ cycleKey, segmentNo, recordState = 'active' } = {}) => {
  const response = await axios.get(
    API_URL,
    getConfig({
      cycleKey: normalizeCycleKey(cycleKey),
      segmentNo,
      recordState,
    })
  );

  return unwrap(response);
};

export const getWeavingPayrollSummary = async ({ cycleKey, segmentNo } = {}) => {
  const response = await axios.get(
    `${API_URL}/summary`,
    getConfig({
      cycleKey: normalizeCycleKey(cycleKey),
      segmentNo,
    })
  );

  return unwrap(response);
};

export const generateWeavingPayrollCycle = async ({ cycleKey, segmentNo } = {}) => {
  const response = await axios.post(
    API_URL,
    {
      cycleKey: normalizeCycleKey(cycleKey),
      segmentNo,
    },
    getConfig()
  );

  clearAccountsCache();

  return unwrap(response);
};

export const updateWeavingPayroll = async (payrollId, data = {}) => {
  const response = await axios.put(`${API_URL}/${payrollId}`, data, getConfig());

  clearAccountsCache();

  return unwrap(response);
};

export const finalizeWeavingPayroll = async (payrollId) => {
  const response = await axios.post(`${API_URL}/${payrollId}/finalize`, {}, getConfig());

  clearAccountsCache();

  return unwrap(response);
};

export const finalizeWeavingPayrollCycle = async ({ cycleKey, segmentNo } = {}) => {
  const response = await axios.post(
    `${API_URL}/finalize-all`,
    {
      cycleKey: normalizeCycleKey(cycleKey),
      segmentNo,
    },
    getConfig()
  );

  clearAccountsCache();

  return unwrap(response);
};

export const earlyCloseWeavingPayrollCycle = async ({ cycleKey, segmentNo, reason } = {}) => {
  const response = await axios.post(
    `${API_URL}/early-close`,
    {
      cycleKey: normalizeCycleKey(cycleKey),
      segmentNo,
      reason,
    },
    getConfig()
  );

  clearAccountsCache();

  return unwrap(response);
};

export const resumeWeavingPayrollCycle = async ({
  cycleKey,
  resumeFrom,
  calculateThrough,
  note,
} = {}) => {
  const response = await axios.post(
    `${API_URL}/resume`,
    {
      cycleKey: normalizeCycleKey(cycleKey),
      resumeFrom,
      calculateThrough,
      note,
    },
    getConfig()
  );

  clearAccountsCache();

  return unwrap(response);
};

export const payWeavingPayroll = async (payrollId, data = {}) => {
  const response = await axios.post(`${API_URL}/${payrollId}/pay`, data, getConfig());

  clearAccountsCache();

  return unwrap(response);
};

export const voidWeavingPayroll = async (payrollId, data = {}) => {
  const response = await axios.post(`${API_URL}/${payrollId}/void`, data, getConfig());

  clearAccountsCache();

  return unwrap(response);
};

export const restoreWeavingPayroll = async (payrollId) => {
  const response = await axios.post(`${API_URL}/${payrollId}/restore`, {}, getConfig());

  clearAccountsCache();

  return unwrap(response);
};

const weavingPayrollService = {
  earlyCloseWeavingPayrollCycle,
  finalizeWeavingPayroll,
  finalizeWeavingPayrollCycle,
  generateWeavingPayrollCycle,
  getWeavingPayrollCycle,
  getWeavingPayrollSummary,
  payWeavingPayroll,
  resumeWeavingPayrollCycle,
  restoreWeavingPayroll,
  updateWeavingPayroll,
  voidWeavingPayroll,
};

export default weavingPayrollService;
