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

const PARTY_CACHE_KEYS = ['saleParties', 'purchaseParties', 'purchase_parties'];

export const clearPartyCaches = () => {
  PARTY_CACHE_KEYS.forEach((key) => {
    localStorage.removeItem(key);
  });
};

const getCachedParties = (key) => {
  const cached = localStorage.getItem(key);

  if (!cached) {
    return null;
  }

  try {
    const parsed = JSON.parse(cached);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    localStorage.removeItem(key);

    return null;
  } catch (error) {
    localStorage.removeItem(key);

    return null;
  }
};

const saveCachedParties = (key, data) => {
  if (!Array.isArray(data)) {
    return;
  }

  localStorage.setItem(key, JSON.stringify(data));
};

export const fetchParties = async (params = {}, token = null) => {
  const res = await axios.get(API_URL, {
    ...getAuthHeaders(token),
    params,
  });

  return Array.isArray(res.data) ? res.data : res.data;
};

// ✅ Alias
export const getParties = fetchParties;

export const fetchSaleParties = async (token = null, forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = getCachedParties('saleParties');

    if (cached) {
      return cached;
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

  const safeCustomers = Array.isArray(customers) ? customers : [];
  const safeBothParties = Array.isArray(bothParties) ? bothParties : [];

  const merged = [...safeCustomers, ...safeBothParties];

  const uniqueMap = new Map();

  merged.forEach((party) => {
    if (!party?._id) return;

    uniqueMap.set(String(party._id), party);
  });

  const data = Array.from(uniqueMap.values());

  saveCachedParties('saleParties', data);

  return data;
};

export const fetchPurchaseParties = async (token = null, forceRefresh = false) => {
  if (!forceRefresh) {
    const cached = getCachedParties('purchaseParties');

    if (cached) {
      return cached;
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

  const safeSuppliers = Array.isArray(suppliers) ? suppliers : [];
  const safeBothParties = Array.isArray(bothParties) ? bothParties : [];

  const merged = [...safeSuppliers, ...safeBothParties];

  const uniqueMap = new Map();

  merged.forEach((party) => {
    if (!party?._id) return;

    uniqueMap.set(String(party._id), party);
  });

  const data = Array.from(uniqueMap.values());

  saveCachedParties('purchaseParties', data);

  return data;
};

export const addParty = async (partyData, token = null) => {
  const res = await axios.post(API_URL, partyData, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const updateParty = async (id, partyData, token = null) => {
  const res = await axios.put(`${API_URL}/${id}`, partyData, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const deleteParty = async (id, token = null) => {
  const res = await axios.delete(`${API_URL}/${id}`, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const restoreParty = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/restore`, {}, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const convertPartyToCustomer = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/convert-to-customer`, {}, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const convertPartyToSupplier = async (id, token = null) => {
  const res = await axios.post(`${API_URL}/${id}/convert-to-supplier`, {}, getAuthHeaders(token));

  clearPartyCaches();

  return res.data;
};

export const searchPartiesLocal = (parties = [], search = '', allowedRoles = []) => {
  const q = String(search || '')
    .toLowerCase()
    .trim();

  return parties.filter((party) => {
    if (!party) {
      return false;
    }

    if (party.isActive === false || party.isDeleted === true) {
      return false;
    }

    const roleOk =
      allowedRoles.length === 0 || allowedRoles.includes(party.role) || party.role === 'both';

    if (!roleOk) {
      return false;
    }

    const name = String(party.name || '').toLowerCase();
    const phone = String(party.phone || '');
    const email = String(party.email || '').toLowerCase();

    const textOk = !q || name.includes(q) || phone.includes(q) || email.includes(q);

    return textOk;
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

  clearPartyCaches,
  searchPartiesLocal,
};

export default partyService;
