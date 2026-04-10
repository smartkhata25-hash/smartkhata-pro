import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/products`;
const TRANS_URL = `${BASE_URL}/api/inventory-transactions`;

// 🔐 Common Auth Header
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return { headers: { Authorization: `Bearer ${token}` } };
};

// =======================
// 📦 PRODUCTS
// =======================

export const createProduct = async (productData) => {
  const res = await axios.post(API_URL, productData, getAuthHeader());
  return res.data;
};

export const bulkCreateProducts = async (products) => {
  const res = await axios.post(`${API_URL}/bulk`, products, getAuthHeader());
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

// =======================
// 🔁 INVENTORY TRANSACTIONS
// =======================

export const createTransaction = async (transactionData) => {
  const res = await axios.post(TRANS_URL, transactionData, getAuthHeader());
  return res.data;
};

export const getAllTransactions = async () => {
  const res = await axios.get(TRANS_URL, getAuthHeader());
  return res.data;
};

export const deleteTransaction = async (id) => {
  const res = await axios.delete(`${TRANS_URL}/${id}`, getAuthHeader());
  return res.data;
};

// =======================
// 🔍 SEARCH
// =======================

export const searchProducts = async (query) => {
  const res = await axios.get(`${API_URL}/search?q=${query}`, getAuthHeader());
  return res.data;
};

// =======================
// 🔧 INVENTORY ADJUST
// =======================

export const adjustInventory = async (data) => {
  const res = await axios.post(`${TRANS_URL}/adjust`, data, getAuthHeader());
  return res.data;
};

// 🔧 Inventory Adjust (Bulk)
export const adjustInventoryBulk = async (rows) => {
  const token = localStorage.getItem('token');

  const res = await axios.post(
    `${BASE_URL}/api/inventory-transactions/adjust/bulk`,
    { rows },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  return res.data;
};
