import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/party-ledger`;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
});

// ✅ Get Party Ledger
const normalizeOptions = (options = {}) =>
  options && typeof options === 'object' && !Array.isArray(options) ? options : {};

export const getPartyLedger = async (partyId, startDate = '', endDate = '', options = {}) => {
  if (!partyId) {
    throw new Error('Party ID is required');
  }

  const params = {};
  const safeOptions = normalizeOptions(options);

  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;
  if (safeOptions.moduleScope) params.moduleScope = safeOptions.moduleScope;

  const res = await axios.get(`${API_URL}/${partyId}`, {
    ...getAuthHeaders(),
    params,
  });

  return res.data;
};

export const getPartyBalance = async (partyId, options = {}) => {
  if (!partyId) {
    throw new Error('Party ID is required');
  }

  const safeOptions = normalizeOptions(options);
  const params = {};

  if (safeOptions.moduleScope) params.moduleScope = safeOptions.moduleScope;

  const res = await axios.get(`${API_URL}/balance/${partyId}`, {
    ...getAuthHeaders(),
    params,
  });

  return res.data;
};

// ✅ Alias
export const fetchPartyLedger = getPartyLedger;

const partyLedgerService = {
  getPartyLedger,
  fetchPartyLedger,
  getPartyBalance,
};

export default partyLedgerService;
