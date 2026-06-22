// src/services/partyDetailLedgerService.js

import axios from 'axios';

const API = process.env.REACT_APP_API_BASE_URL;

const getToken = () => localStorage.getItem('token');

const getAuthHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
});

// ✅ Get Party Detailed Ledger JSON
export const getPartyDetailedLedger = async (partyId, startDate = '', endDate = '') => {
  if (!partyId) {
    throw new Error('Party ID is required');
  }

  const params = {};

  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const res = await axios.get(`${API}/api/party-ledger/${partyId}/detailed-ledger`, {
    ...getAuthHeaders(),
    params,
  });

  return res.data;
};

// ✅ Alias
export const fetchPartyDetailedLedger = getPartyDetailedLedger;

const partyDetailLedgerService = {
  getPartyDetailedLedger,
  fetchPartyDetailedLedger,
};

export default partyDetailLedgerService;
