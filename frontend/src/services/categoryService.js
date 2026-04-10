import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/categories`;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

// ➕ Add Category
export const createCategory = async (name) => {
  const res = await axios.post(API_URL, { name }, getAuthHeader());
  return res.data;
};

// 📃 Get All Categories
export const getCategories = async () => {
  const res = await axios.get(API_URL, getAuthHeader());
  return res.data;
};

// ❌ Delete Category
export const deleteCategory = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, getAuthHeader());
  return res.data;
};
// ✏️ Rename / Update Category
export const updateCategory = async (id, name) => {
  const res = await axios.put(`${API_URL}/${id}`, { name }, getAuthHeader());
  return res.data;
};
