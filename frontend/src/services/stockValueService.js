import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/stock-value-report`;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

// 📦 Get Stock Value Report
export const fetchStockValueReport = async (filters = {}) => {
  try {
    const params = {
      page: filters.page || 1,
      limit: filters.limit || 50,
    };

    if (filters.startDate) {
      params.startDate = filters.startDate;
    }

    if (filters.endDate) {
      params.endDate = filters.endDate;
    }

    if (filters.search?.trim()) {
      params.search = filters.search.trim();
    }

    if (filters.categoryId) {
      params.categoryId = filters.categoryId;
    }

    if (filters.hideZero) {
      params.hideZero = 'true';
    }

    if (filters.negativeOnly) {
      params.negativeOnly = 'true';
    }

    const response = await axios.get(API_URL, {
      ...getAuthHeader(),
      params,
    });

    return response.data;
  } catch (error) {
    console.error('❌ Stock Value Report Error:', error.response?.data || error.message);

    throw (
      error.response?.data || {
        message: 'Failed to fetch stock value report',
      }
    );
  }
};
