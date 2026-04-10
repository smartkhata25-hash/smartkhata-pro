import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getToken = () => localStorage.getItem('token');

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
});

/* =========================================================
   ✅ SALE INVOICE PRINT
========================================================= */
export const getSalePrintData = async (id) => {
  const res = await axios.get(`${BASE_URL}/api/print/sale/${id}`, authHeaders());
  return res.data;
};

/* =========================================================
   ✅ SALE RETURN PRINT
========================================================= */
export const getSaleReturnPrintData = async (id) => {
  const res = await axios.get(`${BASE_URL}/api/print/sale-return/${id}`, authHeaders());
  return res.data;
};

/* =========================================================
   ✅ SALE PREVIEW (LIVE PREVIEW SUPPORT)
========================================================= */
export const getSalePreviewData = async (invoiceData) => {
  const res = await axios.post(`${BASE_URL}/api/print/sale-preview`, invoiceData, authHeaders());
  return res.data;
};
