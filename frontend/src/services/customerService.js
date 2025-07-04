// ✅ src/services/customerService.js
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL;
const API_URL = `${BASE_URL}/api/customers`;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = (token = null) => ({
  headers: { Authorization: `Bearer ${token || getToken()}` },
});

// ✅ Get All Customers (for dropdowns etc.)
export const fetchCustomers = async (token) => {
  const response = await axios.get(API_URL, getAuthHeaders(token));
  return response.data;
};

// ✅ Get Customers (same as fetchCustomers, but separated for compatibility)
export const getCustomers = async (token) => {
  const response = await axios.get(API_URL, getAuthHeaders(token));
  return response.data;
};

// ✅ Add New Customer
export const addCustomer = async (customerData, token) => {
  const response = await axios.post(API_URL, customerData, getAuthHeaders(token));
  return response.data;
};

// ✅ Update Customer
export const updateCustomer = async (id, customerData, token) => {
  const response = await axios.put(`${API_URL}/${id}`, customerData, getAuthHeaders(token));
  return response.data;
};

// ✅ Delete Customer
export const deleteCustomer = async (id, token) => {
  const response = await axios.delete(`${API_URL}/${id}`, getAuthHeaders(token));
  return response.data;
};

// ✅ Fetch Customer Ledger
export const fetchCustomerLedger = async (customerId, token) => {
  const response = await axios.get(
    `${BASE_URL}/api/customer-ledger/${customerId}`,
    getAuthHeaders(token)
  );
  return response.data;
};
