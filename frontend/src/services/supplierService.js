import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API = `${BASE_URL}/api/suppliers`;

const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

// ✅ Supplier CRUD APIs
export const fetchSuppliers = (params) =>
  axios
    .get(API, { ...getConfig(), params })
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error fetching suppliers:', err.response?.data || err.message);
      throw err;
    });

export const createSupplier = (data) =>
  axios
    .post(API, data, getConfig())
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error creating supplier:', err.response?.data || err.message);
      throw err;
    });

export const updateSupplier = (id, data) =>
  axios
    .put(`${API}/${id}`, data, getConfig())
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error updating supplier:', err.response?.data || err.message);
      throw err;
    });

export const deleteSupplier = (id) =>
  axios
    .delete(`${API}/${id}`, getConfig())
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error deleting supplier:', err.response?.data || err.message);
      throw err;
    });

// ✅ Import Suppliers (with optional progress)
export const importSuppliers = (file /* , onUploadProgress */) => {
  const fd = new FormData();
  fd.append('file', file);

  return axios
    .post(`${API}/import`, fd, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
      // onUploadProgress, // Uncomment if needed
    })
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error importing suppliers:', err.response?.data || err.message);
      throw err;
    });
};

// ✅ Supplier Ledger with optional filters (start, end, type)
export const fetchSupplierLedger = (id, filters = {}) =>
  axios
    .get(`${BASE_URL}/api/supplier-ledger/${id}`, {
      ...getConfig(),
      params: filters,
    })
    .then((r) => r.data)
    .catch((err) => {
      console.error('❌ Error fetching supplier ledger:', err.response?.data || err.message);
      throw err;
    });
