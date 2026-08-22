import axios from 'axios';
import { invalidateInvoiceFormOptionsSections } from './invoiceFormOptionsService';

const REFUND_API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/refunds`;

export const createRefund = async (formData, token) => {
  try {
    const res = await axios.post(REFUND_API_URL, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    invalidateInvoiceFormOptionsSections(['products']);

    return res.data;
  } catch (err) {
    console.error('❌ Create Refund Error:', err.response?.data || err.message);
    throw err;
  }
};

export const getAllRefunds = async (token, params = {}) => {
  try {
    const res = await axios.get(REFUND_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        page: params.page || 1,
        limit: params.limit || 10,
        search: params.search || '',
        customer: params.customer || '',
        paymentType: params.paymentType || '',
        fromDate: params.fromDate || '',
        toDate: params.toDate || '',
      },
    });

    return res.data;
  } catch (err) {
    console.error('❌ Get All Refunds Error:', err.response?.data || err.message);
    throw err;
  }
};

export const getRefundById = async (id, token) => {
  if (!id) {
    throw new Error('Refund ID is required');
  }

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

export const updateRefund = async (id, formData, token) => {
  if (!id) {
    throw new Error('Refund ID is required');
  }

  try {
    const res = await axios.put(`${REFUND_API_URL}/${id}`, formData, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
    });

    invalidateInvoiceFormOptionsSections(['products']);

    return res.data;
  } catch (err) {
    console.error('❌ Update Refund Error:', err.response?.data || err.message);
    throw err;
  }
};

export const deleteRefund = async (id, token) => {
  if (!id) {
    throw new Error('Refund ID is required');
  }

  try {
    const res = await axios.delete(`${REFUND_API_URL}/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    invalidateInvoiceFormOptionsSections(['products']);

    return res.data;
  } catch (err) {
    console.error('❌ Delete Refund Error:', err.response?.data || err.message);
    throw err;
  }
};
