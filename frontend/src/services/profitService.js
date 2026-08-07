import axios from 'axios';

const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/profit`;

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

//  ✅ GET PROFIT SUMMARY

export const getProfitSummary = async (params = {}) => {
  const response = await axios.get(`${API_URL}/summary`, {
    ...getConfig(),
    params,
  });

  return response.data;
};

export const getSalesBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/sales-breakdown`, {
    ...getConfig(),
    params,
  });

  return response.data;
};

export const getExpenseBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/expense-breakdown`, {
    ...getConfig(),
    params,
  });

  return response.data;
};

export const getCogsBreakdown = async (params = {}) => {
  const response = await axios.get(`${API_URL}/cogs-breakdown`, {
    ...getConfig(),
    params,
  });

  return response.data;
};

export const getProductProfitability = async (params = {}) => {
  const response = await axios.get(`${API_URL}/product-profitability`, {
    ...getConfig(),
    params,
  });

  return response.data;
};
