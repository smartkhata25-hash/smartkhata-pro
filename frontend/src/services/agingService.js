// 📂 frontend/src/services/agingService.js

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/aging`;

export const getAgingReport = async (params = {}) => {
  const token = localStorage.getItem('token');
  const config = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    params, // ✅ pass date filters here
  };

  const res = await axios.get(API_URL, config);
  return res.data;
};
