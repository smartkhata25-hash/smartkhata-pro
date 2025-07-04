import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const API_URL = `${BASE_URL}/api/purchase-invoices`;

// ✅ Token config
const getConfig = () => ({
  headers: {
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  },
});

// ✅ Add New Invoice
const addPurchaseInvoice = async (invoiceData) => {
  try {
    const response = await axios.post(API_URL, invoiceData, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (err) {
    console.error('❌ Error adding invoice:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Get All Invoices
const getAllPurchaseInvoices = async () => {
  try {
    const response = await axios.get(API_URL, getConfig());
    return response.data;
  } catch (err) {
    console.error('❌ Error fetching invoices:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Get Single Invoice by ID
const getPurchaseInvoiceById = async (id) => {
  try {
    const response = await axios.get(`${API_URL}/${id}`, getConfig());
    return response.data;
  } catch (err) {
    console.error('❌ Error fetching invoice by ID:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Update Invoice by ID
const updatePurchaseInvoice = async (id, invoiceData) => {
  try {
    const response = await axios.put(`${API_URL}/${id}`, invoiceData, {
      ...getConfig(),
      headers: {
        ...getConfig().headers,
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  } catch (err) {
    console.error('❌ Error updating invoice:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Delete Invoice
const deletePurchaseInvoice = async (id) => {
  try {
    const response = await axios.delete(`${API_URL}/${id}`, getConfig());
    return response.data;
  } catch (err) {
    console.error('❌ Error deleting invoice:', err.response?.data || err.message);
    throw err;
  }
};

const purchaseInvoiceService = {
  addPurchaseInvoice,
  getAllPurchaseInvoices,
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
};

export default purchaseInvoiceService;
