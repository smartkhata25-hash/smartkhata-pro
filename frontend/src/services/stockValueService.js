import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

/* =========================================================
   🔐 AUTH HEADER
========================================================= */

const getAuthHeader = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

/* =========================================================
   📦 STOCK VALUE REPORT
========================================================= */

export const fetchStockValueReport = async (filters = {}) => {
  try {
    const params = new URLSearchParams();

    if (filters.startDate) {
      params.append('startDate', filters.startDate);
    }

    if (filters.endDate) {
      params.append('endDate', filters.endDate);
    }

    if (filters.search) {
      params.append('search', filters.search);
    }

    if (filters.categoryId) {
      params.append('categoryId', filters.categoryId);
    }

    if (filters.hideZero) {
      params.append('hideZero', 'true');
    }

    if (filters.negativeOnly) {
      params.append('negativeOnly', 'true');
    }

    const url = `${BASE_URL}/api/stock-value-report?${params.toString()}`;

    const response = await axios.get(url, getAuthHeader());

    return response.data;
  } catch (error) {
    console.error('Stock Value Report Error:', error);

    throw (
      error.response?.data || {
        message: 'Failed to fetch stock value report',
      }
    );
  }
};
