import axios from 'axios';

const API = process.env.REACT_APP_API_BASE_URL;

export const fetchProductLedger = async (productId, startDate = '', endDate = '') => {
  let url = `${API}/api/product-ledger/${productId}`;
  const params = [];

  if (startDate) params.push(`startDate=${startDate}`);
  if (endDate) params.push(`endDate=${endDate}`);
  if (params.length) url += '?' + params.join('&');

  const token = localStorage.getItem('token');

  const response = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return response.data;
};
