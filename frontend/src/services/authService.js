// 📁 src/services/authService.js
import axios from 'axios';
import { shouldHandleSessionExpiry } from './authRequestPolicy';
// 🔥 GLOBAL INTERCEPTOR (TOKEN EXPIRE HANDLE)
if (axios.__smartKhaataSessionInterceptorId === undefined) {
  axios.__smartKhaataSessionInterceptorId = axios.interceptors.response.use(
    (response) => response,
    (error) => {
      if (shouldHandleSessionExpiry(error)) {
        alert('Session expire ho gaya hai, dobara login karein');

        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userId');

        window.location.href = '/#/login';
      }

      return Promise.reject(error);
    }
  );
}

const API = `${process.env.REACT_APP_API_BASE_URL}/api/auth`;

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
