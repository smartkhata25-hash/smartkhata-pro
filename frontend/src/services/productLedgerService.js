// services/productLedgerService.js
import axios from 'axios';

export const fetchProductLedger = async (productId, startDate = '', endDate = '') => {
  let url = `/api/product-ledger/${productId}`;
  const params = [];

  if (startDate) params.push(`startDate=${startDate}`);
  if (endDate) params.push(`endDate=${endDate}`);
  if (params.length) url += '?' + params.join('&');

  // ✅ Get token from localStorage
  const token = localStorage.getItem('token');

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`, // ✅ MUST include 'Bearer '
    },
  });

  return response.data;
};
