import axios from 'axios';

// 🔁 Refund Invoice API Base
const REFUND_API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/refunds`;

// ✅ Create Refund Invoice
export const createRefund = async (formData, token) => {
  try {
    const res = await axios.post(REFUND_API_URL, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Create Refund Error:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Get All Refund Invoices
export const getAllRefunds = async (token) => {
  try {
    const res = await axios.get(REFUND_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Get All Refunds Error:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Get Refund Invoice by ID
export const getRefundById = async (id, token) => {
  try {
    const res = await axios.get(`${REFUND_API_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Get Refund Error:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Update Refund Invoice
export const updateRefund = async (id, formData, token) => {
  try {
    const res = await axios.put(`${REFUND_API_URL}/${id}`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Update Refund Error:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Delete Refund Invoice
export const deleteRefund = async (id, token) => {
  try {
    const res = await axios.delete(`${REFUND_API_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Delete Refund Error:', err.response?.data || err.message);
    throw err;
  }
};
