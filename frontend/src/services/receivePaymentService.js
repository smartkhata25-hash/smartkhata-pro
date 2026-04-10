// ✅ src/services/receivePaymentService.js
import axios from 'axios';

// 📦 Base URL from environment
const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/receive-payments`;

// ✅ Authorization headers for JSON requests
const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json',
  },
});

// ✅ Headers for file uploads (form-data)
const getUploadHeaders = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'multipart/form-data',
  },
});

// ✅ Create Receive Payment (with formData for attachments)
export async function createReceivePayment(formData) {
  try {
    const res = await axios.post(API_URL, formData, getUploadHeaders());
    return res.data;
  } catch (err) {
    console.error('❌ Error creating receive payment:', err);
    throw err;
  }
}

// ✅ Get All Receive Payments
export async function getAllReceivePayments() {
  try {
    const res = await axios.get(API_URL, getAuthHeaders());
    return res.data;
  } catch (err) {
    console.error('❌ Error fetching all receive payments:', err);
    throw err;
  }
}

// ✅ Get Single Receive Payment by ID
export async function getReceivePaymentById(id) {
  try {
    const res = await axios.get(`${API_URL}/${id}`, getAuthHeaders());
    return res.data;
  } catch (err) {
    console.error(`❌ Error fetching receive payment with ID ${id}:`, err);
    throw err;
  }
}

// ✅ Update Receive Payment
export async function updateReceivePayment(id, formData) {
  try {
    const res = await axios.put(`${API_URL}/${id}`, formData, getUploadHeaders());
    return res.data;
  } catch (err) {
    console.error(`❌ Error updating receive payment ID ${id}:`, err);
    throw err;
  }
}

// ✅ Delete Receive Payment
export async function deleteReceivePayment(id) {
  try {
    const res = await axios.delete(`${API_URL}/${id}`, getAuthHeaders());
    return res.data;
  } catch (err) {
    console.error(`❌ Error deleting receive payment ID ${id}:`, err);
    throw err;
  }
}
