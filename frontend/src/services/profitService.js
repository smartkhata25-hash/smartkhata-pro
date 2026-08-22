import axios from 'axios';

const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/profit`;

const getConfig = (params = undefined) => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
  ...(params ? { params } : {}),
});

const cleanParams = (params = {}) => {
  const cleaned = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  });

  return cleaned;
};

export const getProfitSummary = async (params = {}) => {
  const response = await axios.get(`${API_URL}/summary`, getConfig(cleanParams(params)));

  return response.data;
};

export const getSalesBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/sales-breakdown`, getConfig(cleanParams(params)));

  return response.data;
};

export const getExpenseBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/expense-breakdown`, getConfig(cleanParams(params)));

  return response.data;
};

export const getCogsBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/cogs-breakdown`, getConfig(cleanParams(params)));

  return response.data;
};

export const getProductProfitability = async (params = {}) => {
  const response = await axios.get(
    `${API_URL}/product-profitability`,
    getConfig(cleanParams(params))
  );

  return response.data;
};

const profitService = {
  getProfitSummary,
  getSalesBreakdown,
  getExpenseBreakdown,
  getCogsBreakdown,
  getProductProfitability,
};

export default profitService;
