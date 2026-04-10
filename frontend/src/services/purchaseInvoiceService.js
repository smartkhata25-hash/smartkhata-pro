import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
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

// 🔍 Search Purchase Invoices
export const searchPurchaseInvoices = async (query) => {
  try {
    const response = await axios.get(
      `${API_URL}/search?query=${encodeURIComponent(query)}`,
      getConfig()
    );

    return response.data;
  } catch (err) {
    console.error('❌ Error searching purchase invoices:', err.response?.data || err.message);
    throw err;
  }
};

// ✅ Alias for list (SalesInvoiceList jaisa)
const getPurchaseInvoices = getAllPurchaseInvoices;

// 📊 Get Item Purchase History
const getItemPurchaseHistory = async (productId) => {
  try {
    const response = await axios.get(`${API_URL}/item-history/${productId}`, getConfig());
    return response.data;
  } catch (err) {
    console.error('❌ Error fetching item purchase history:', err.response?.data || err.message);
    throw err;
  }
};

const purchaseInvoiceService = {
  addPurchaseInvoice,
  getPurchaseInvoices, // 👈 LIST کے لیے
  getAllPurchaseInvoices, // (optional, رکھنا چاہیں)
  getPurchaseInvoiceById,
  updatePurchaseInvoice,
  deletePurchaseInvoice,
  searchPurchaseInvoices,
  getItemPurchaseHistory,
};

export default purchaseInvoiceService;
