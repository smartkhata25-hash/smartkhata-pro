// src/services/payBillService.js

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/pay-bill`;

const getConfig = (isFormData = true) => ({
  headers: {
    'Content-Type': isFormData ? 'multipart/form-data' : 'application/json',
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

// ✅ Create New Pay Bill
export async function createPayBill(formData) {
  try {
    const res = await axios.post(API_URL, formData, getConfig(true));
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ✅ Get All Pay Bills
export async function getAllPayBills() {
  try {
    const res = await axios.get(API_URL, getConfig(false));
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ✅ Get Single Pay Bill
export async function getPayBillById(id) {
  try {
    const res = await axios.get(`${API_URL}/${id}`, getConfig(false));
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ✅ Update Pay Bill
export async function updatePayBill(id, formData) {
  try {
    const res = await axios.put(`${API_URL}/${id}`, formData, getConfig(true));
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// ✅ Delete Pay Bill
export async function deletePayBill(id) {
  try {
    const res = await axios.delete(`${API_URL}/${id}`, getConfig(false));
    return res.data;
  } catch (err) {
    handleError(err);
  }
}

// 🔻 Error Handler
function handleError(error) {
  console.error('❌ API Error:', error?.response?.data || error.message);
  throw new Error(error?.response?.data?.message || 'Server Error');
}
