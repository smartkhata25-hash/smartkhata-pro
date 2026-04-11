// src/services/customerDetailLedgerService.js
import axios from 'axios';
const API = process.env.REACT_APP_API_BASE_URL;

export const getCustomerDetailedLedger = async (customerId, startDate, endDate) => {
  const token = localStorage.getItem('token');

  const params = {};
  if (startDate) params.startDate = startDate;
  if (endDate) params.endDate = endDate;

  const res = await axios.get(`${API}/api/customers/${customerId}/detailed-ledger`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params,
  });

  return res.data;
};
