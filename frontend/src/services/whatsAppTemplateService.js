import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_URL = `${BASE_URL}/api/whatsapp-templates`;
const templateCache = {};

const getToken = () => localStorage.getItem('token');

const authConfig = () => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
});

const normalizeScope = (moduleScope = 'trading') =>
  moduleScope === 'travel' ? 'travel' : 'trading';

export const fetchWhatsAppTemplate = async (moduleScope = 'trading', options = {}) => {
  const scope = normalizeScope(moduleScope);

  if (!options.forceRefresh && templateCache[scope]) {
    return templateCache[scope];
  }

  const response = await axios.get(`${API_URL}/${scope}`, authConfig());

  templateCache[scope] = response.data;

  return response.data;
};

export const updateWhatsAppTemplate = async (moduleScope = 'trading', data = {}) => {
  const scope = normalizeScope(moduleScope);
  const response = await axios.put(`${API_URL}/${scope}`, data, authConfig());

  templateCache[scope] = response.data;

  return response.data;
};

export const getCachedWhatsAppTemplate = (moduleScope = 'trading') =>
  templateCache[normalizeScope(moduleScope)] || null;
