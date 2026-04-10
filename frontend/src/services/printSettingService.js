import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/print-settings`;

const getToken = () => localStorage.getItem('token');

const authHeaders = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
});

/* =========================================================
   ✅ GET PRINT SETTINGS
========================================================= */
export const getPrintSettings = async () => {
  try {
    const res = await axios.get(API_URL, authHeaders());
    return res.data;
  } catch (error) {
    console.error('Error fetching print settings:', error);
    throw error;
  }
};

/* =========================================================
   ✅ UPDATE PRINT SETTINGS (DOCUMENT-WISE)
========================================================= */
export const updatePrintSettings = async (type, data) => {
  try {
    const res = await axios.put(`${API_URL}/${type}`, data, authHeaders());
    return res.data;
  } catch (error) {
    console.error('Error updating print settings:', error);
    throw error;
  }
};
/* =========================================================
   ✅ RESET PRINT SETTINGS (DOCUMENT-WISE)
========================================================= */
export const resetPrintSettings = async (type) => {
  try {
    const res = await axios.put(
      `${API_URL}/reset/${type}`,
      {}, // empty body
      authHeaders()
    );
    return res.data;
  } catch (error) {
    console.error('Error resetting print settings:', error);
    throw error;
  }
};
