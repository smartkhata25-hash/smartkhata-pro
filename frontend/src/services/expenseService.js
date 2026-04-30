import axios from 'axios';

const API_URL = 'https://smartkhata-pro.onrender.com/api/expense';

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
  return response.data;
}

// ✅ Get Single Expense by ID (for editing)
export async function getExpenseById(id) {
  const response = await axios.get(`${API_URL}/${id}`, getConfig());
  return response.data;
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
