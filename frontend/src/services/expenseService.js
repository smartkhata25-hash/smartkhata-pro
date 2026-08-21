import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/expense`;

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

// ✅ Create New Expense
export async function createExpense(formData) {
  const response = await axios.post(API_URL, formData, getConfig());
  return response.data;
}

export async function getAllExpenses() {
  const response = await axios.get(API_URL, getConfig());

  return Array.isArray(response.data) ? response.data : [];
}

export async function getExpenseById(id) {
  if (!id) {
    throw new Error('Expense ID is required');
  }

  const response = await axios.get(`${API_URL}/${id}`, getConfig());

  return response.data || null;
}

// ✅ Update Expense
export async function updateExpense(id, formData) {
  const response = await axios.put(`${API_URL}/${id}`, formData, getConfig());
  return response.data;
}

// ✅ Delete Expense
export async function deleteExpense(id) {
  const response = await axios.delete(`${API_URL}/${id}`, getConfig());
  return response.data;
}
