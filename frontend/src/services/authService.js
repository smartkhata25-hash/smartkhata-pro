// 📁 src/services/authService.js
import axios from 'axios';

const API = `${process.env.REACT_APP_API_URL}/api/auth`;

export const register = async (userData) => {
  const res = await axios.post(`${API}/register`, userData);
  return res.data;
};

export const login = async (credentials) => {
  const res = await axios.post(`${API}/login`, credentials);
  return res.data;
};

export const getProfile = async (token) => {
  const res = await axios.get(`${API}/profile`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};
