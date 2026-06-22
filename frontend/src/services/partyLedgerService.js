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
export const getPartyLedger = async (partyId, startDate = '', endDate = '') => {
  if (!partyId) {
    throw new Error('Party ID is required');
  }

  const params = {};

  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const res = await axios.get(`${API_URL}/${partyId}`, {
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
};

export default partyLedgerService;
