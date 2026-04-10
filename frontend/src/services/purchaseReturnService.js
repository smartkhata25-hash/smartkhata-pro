import axios from 'axios';

// 🔁 Purchase Return API Base URL
const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const PURCHASE_RETURN_API = `${BASE_URL}/api/purchase-returns`;

// 🔐 Auth Header Helper
const getAuthHeaders = (token) => ({
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// =======================================
// ✅ CREATE PURCHASE RETURN
// =======================================
export const createPurchaseReturn = async (formData, token) => {
  try {
    const res = await axios.post(PURCHASE_RETURN_API, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    return res.data;
  } catch (err) {
    console.error('❌ Create Purchase Return Error:', err.response?.data || err.message);
    throw err;
  }
};

// =======================================
// ✅ GET ALL PURCHASE RETURNS
// =======================================
export const getAllPurchaseReturns = async (token) => {
  try {
    const res = await axios.get(PURCHASE_RETURN_API, getAuthHeaders(token));
    return res.data;
  } catch (err) {
    console.error('❌ Get All Purchase Returns Error:', err.response?.data || err.message);
    throw err;
  }
};

// =======================================
// ✅ GET PURCHASE RETURN BY ID
// =======================================
export const getPurchaseReturnById = async (id, token) => {
  try {
    const res = await axios.get(`${PURCHASE_RETURN_API}/${id}`, getAuthHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Get Purchase Return Error:', err.response?.data || err.message);
    throw err;
  }
};

// =======================================
// ✅ UPDATE PURCHASE RETURN
// =======================================
export const updatePurchaseReturn = async (id, formData, token) => {
  try {
    const res = await axios.put(`${PURCHASE_RETURN_API}/${id}`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    return res.data;
  } catch (err) {
    console.error('❌ Update Purchase Return Error:', err.response?.data || err.message);
    throw err;
  }
};

// =======================================
// ✅ DELETE PURCHASE RETURN
// =======================================
export const deletePurchaseReturn = async (id, token) => {
  try {
    const res = await axios.delete(`${PURCHASE_RETURN_API}/${id}`, getAuthHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Delete Purchase Return Error:', err.response?.data || err.message);
    throw err;
  }
};
