import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const PURCHASE_RETURN_API = `${BASE_URL}/api/purchase-returns`;

const getToken = (token) => token || localStorage.getItem('token') || '';

const getAuthHeaders = (token) => ({
  headers: {
    Authorization: `Bearer ${getToken(token)}`,
  },
});

const getUploadHeaders = (token) => ({
  headers: {
    Authorization: `Bearer ${getToken(token)}`,
    'Content-Type': 'multipart/form-data',
  },
});

const cleanParams = (params = {}) => {
  const cleaned = {};

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  });

  return cleaned;
};

export const createPurchaseReturn = async (formData, token) => {
  try {
    const res = await axios.post(PURCHASE_RETURN_API, formData, getUploadHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Create Purchase Return Error:', err.response?.data || err.message);

    throw err;
  }
};

export const getAllPurchaseReturns = async (token, params = {}) => {
  try {
    const res = await axios.get(PURCHASE_RETURN_API, {
      ...getAuthHeaders(token),

      params: cleanParams({
        page: params.page || 1,
        limit: params.limit || 10,
        search: params.search,
        supplier: params.supplier,
        paymentType: params.paymentType,
        fromDate: params.fromDate,
        toDate: params.toDate,
      }),
    });

    return res.data;
  } catch (err) {
    console.error('❌ Get All Purchase Returns Error:', err.response?.data || err.message);

    throw err;
  }
};

export const getPurchaseReturnById = async (id, token) => {
  if (!id) {
    throw new Error('Purchase Return ID is required');
  }

  try {
    const res = await axios.get(`${PURCHASE_RETURN_API}/${id}`, getAuthHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Get Purchase Return Error:', err.response?.data || err.message);

    throw err;
  }
};

export const updatePurchaseReturn = async (id, formData, token) => {
  if (!id) {
    throw new Error('Purchase Return ID is required');
  }

  try {
    const res = await axios.put(`${PURCHASE_RETURN_API}/${id}`, formData, getUploadHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Update Purchase Return Error:', err.response?.data || err.message);

    throw err;
  }
};

export const deletePurchaseReturn = async (id, token) => {
  if (!id) {
    throw new Error('Purchase Return ID is required');
  }

  try {
    const res = await axios.delete(`${PURCHASE_RETURN_API}/${id}`, getAuthHeaders(token));

    return res.data;
  } catch (err) {
    console.error('❌ Delete Purchase Return Error:', err.response?.data || err.message);

    throw err;
  }
};
