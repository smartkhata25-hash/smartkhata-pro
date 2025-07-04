import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/products`;
const TRANS_URL = `${BASE_URL}/api/inventory-transactions`;

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

export const createProduct = async (productData) => {
  const res = await axios.post(API_URL, productData, getAuthHeader());
  return res.data;
};

export const fetchProducts = async () => {
  const res = await axios.get(API_URL, getAuthHeader());
  return res.data;
};

export const fetchProductsWithToken = async (token) => {
  const res = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

export const getAllProducts = async () => {
  const res = await axios.get(API_URL);
  return res.data;
};

export const updateStock = async ({ productId, quantity, action }) => {
  const res = await axios.put(`${API_URL}/stock`, { productId, quantity, action }, getAuthHeader());
  return res.data;
};

export const updateProduct = async (id, updatedData) => {
  const res = await axios.put(`${API_URL}/${id}`, updatedData, getAuthHeader());
  return res.data;
};

export const deleteProduct = async (id) => {
  const res = await axios.delete(`${API_URL}/${id}`, getAuthHeader());
  return res.data;
};

export const createTransaction = async (transactionData) => {
  const res = await axios.post(TRANS_URL, transactionData);
  return res.data;
};

export const getAllTransactions = async () => {
  const res = await axios.get(TRANS_URL);
  return res.data;
};

export const deleteTransaction = async (id) => {
  const res = await axios.delete(`${TRANS_URL}/${id}`);
  return res.data;
};
