import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/parties`;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = (token = null) => ({
  headers: {
    Authorization: `Bearer ${token || getToken()}`,
    'Content-Type': 'application/json',
  },
});

// ✅ Get all parties
export const fetchParties = async (params = {}, token = null) => {
  const res = await axios.get(API_URL, {
    ...getAuthHeaders(token),
    params,
  });

  return res.data;
};

// ✅ Alias
export const getParties = fetchParties;

// ✅ Get parties for sale side
export const fetchSaleParties = async (token = null, forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = localStorage.getItem('saleParties');

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
  }

  const [customers, bothParties] = await Promise.all([
    fetchParties(
      {
        status: 'active',
        role: 'customer',
      },
      token
    ),
    fetchParties(
      {
        status: 'active',
        role: 'both',
      },
      token
    ),
  ]);

  const data = [...customers, ...bothParties];

  localStorage.setItem('saleParties', JSON.stringify(data));

  return data;
};

// ✅ Get parties for purchase side
export const fetchPurchaseParties = async (token = null, forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = localStorage.getItem('purchaseParties');

    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (_) {}
    }
  }

  const [suppliers, bothParties] = await Promise.all([
    fetchParties(
      {
        status: 'active',
        role: 'supplier',
      },
      token
    ),
    fetchParties(
      {
        status: 'active',
        role: 'both',
      },
      token
    ),
  ]);

  const data = [...suppliers, ...bothParties];

  localStorage.setItem('purchaseParties', JSON.stringify(data));

  return data;
};

// ✅ Add new party
export const addParty = async (partyData, token = null) => {
  const res = await axios.post(API_URL, partyData, getAuthHeaders(token));
  return res.data;
};

// ✅ Update party
export const updateParty = async (id, partyData, token = null) => {
  const res = await axios.put(`${API_URL}/${id}`, partyData, getAuthHeaders(token));
  return res.data;
};

// ✅ Delete / inactive party
export const deleteParty = async (id, token = null) => {
  const res = await axios.delete(`${API_URL}/${id}`, getAuthHeaders(token));
  return res.data;
};

// ✅ Restore Hidden Party
export const restoreParty = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/restore`, {}, getAuthHeaders(token));

  return res.data;
};

// ✅ Convert Party → Customer
export const convertPartyToCustomer = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/convert-to-customer`, {}, getAuthHeaders(token));

  return res.data;
};

// ✅ Convert Party → Supplier
export const convertPartyToSupplier = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/convert-to-supplier`, {}, getAuthHeaders(token));

  return res.data;
};

// ✅ Search helper for dropdowns
export const searchPartiesLocal = (parties = [], search = '', allowedRoles = []) => {
  const q = String(search || '')
    .toLowerCase()
    .trim();

  return parties.filter((p) => {
    const roleOk = allowedRoles.length === 0 || allowedRoles.includes(p.role) || p.role === 'both';

    const textOk =
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.phone?.includes(q) ||
      p.email?.toLowerCase().includes(q);

    return p.isActive !== false && roleOk && textOk;
  });
};

const partyService = {
  fetchParties,
  getParties,
  fetchSaleParties,
  fetchPurchaseParties,
  addParty,
  updateParty,
  deleteParty,
  restoreParty,

  convertPartyToCustomer,
  convertPartyToSupplier,

  searchPartiesLocal,
};

export default partyService;
