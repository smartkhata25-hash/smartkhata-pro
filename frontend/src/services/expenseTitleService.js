import axios from 'axios';

const API = '/api/expense-titles';

// 🔐 Helper: get auth headers
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

// 🔍 Get Titles (search)
export const getExpenseTitles = async (search = '') => {
  try {
    const res = await axios.get(`${API}?search=${search}`, getAuthHeaders());
    return res.data;
  } catch (error) {
    console.error('❌ getExpenseTitles error:', error);
    throw error;
  }
};

// ➕ Create Title
export const createExpenseTitle = async (data) => {
  try {
    const res = await axios.post(API, data, getAuthHeaders());
    return res.data;
  } catch (error) {
    console.error('❌ createExpenseTitle error:', error);
    throw error;
  }
};

// ✏️ Update Title
export const updateExpenseTitle = async (id, data) => {
  try {
    const res = await axios.put(`${API}/${id}`, data, getAuthHeaders());
    return res.data;
  } catch (error) {
    console.error('❌ updateExpenseTitle error:', error);
    throw error;
  }
};

// ❌ Delete Title
export const deleteExpenseTitle = async (id) => {
  try {
    const res = await axios.delete(`${API}/${id}`, getAuthHeaders());
    return res.data;
  } catch (error) {
    console.error('❌ deleteExpenseTitle error:', error);
    throw error;
  }
};
