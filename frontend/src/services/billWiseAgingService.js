import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/bill-wise-aging`;

const getToken = () => localStorage.getItem('token');

const authConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
  },
  params,
});

export const getCustomerBillWiseAging = async (customerId, params = {}) => {
  if (!customerId) {
    throw new Error('Customer ID is required');
  }

  const res = await axios.get(`${API_URL}/customer/${customerId}`, authConfig(params));
  return res.data;
};

export const getPartyBillWiseAging = async (partyId, params = {}) => {
  if (!partyId) {
    throw new Error('Party ID is required');
  }

  const res = await axios.get(`${API_URL}/party/${partyId}`, authConfig(params));
  return res.data;
};

const billWiseAgingService = {
  getCustomerBillWiseAging,
  getPartyBillWiseAging,
};

export default billWiseAgingService;
