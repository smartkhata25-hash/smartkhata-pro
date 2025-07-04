import axios from 'axios';

// 🔄 Base URL from .env
const API_URL = `${process.env.REACT_APP_API_URL}/api/invoices`;

// ✅ Create a new invoice (with FormData support)
export const createInvoice = async (invoiceData, token) => {
  const res = await axios.post(API_URL, invoiceData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
};

// ✅ Get all invoices
export const getInvoices = async (token) => {
  const res = await axios.get(API_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ✅ Get invoice by ID
export const getInvoiceById = async (id, token) => {
  const res = await axios.get(`${API_URL}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ✅ 🔄 Get invoice by Bill No (NEW for LedgerTable click)
export const getInvoiceByBillNo = async (billNo, token) => {
  const res = await axios.get(`${API_URL}/by-bill-no/${billNo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ✅ Record a payment
export const recordPayment = async (id, amount, token) => {
  const res = await axios.put(
    `${API_URL}/${id}/payment`,
    { amount },
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  return res.data;
};

// ✅ Delete an invoice
export const deleteInvoice = async (id, token) => {
  const res = await axios.delete(`${API_URL}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
};

// ✅ Get last bill number
export const getLastInvoiceNo = async (token) => {
  const res = await axios.get(`${API_URL}/last-bill-no`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data.lastBillNo || 1000;
};

// ✅ Update an existing invoice
export const updateInvoice = async (id, invoiceData, token) => {
  const res = await axios.put(`${API_URL}/${id}`, invoiceData, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
};
