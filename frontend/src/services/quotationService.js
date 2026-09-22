import axios from 'axios';

const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/quotations`;

const authConfig = (token, params) => ({
  headers: { Authorization: `Bearer ${token}` },
  ...(params ? { params } : {}),
});

export const getQuotations = async (token, params = {}) => {
  const response = await axios.get(API_URL, authConfig(token, params));
  return response.data;
};

export const getQuotationById = async (id, token) => {
  const response = await axios.get(`${API_URL}/${id}`, authConfig(token));
  return response.data;
};

export const createQuotation = async (data, token) => {
  const response = await axios.post(API_URL, data, authConfig(token));
  return response.data;
};

export const updateQuotation = async (id, data, token) => {
  const response = await axios.put(`${API_URL}/${id}`, data, authConfig(token));
  return response.data;
};

export const deleteQuotation = async (id, token) => {
  const response = await axios.delete(`${API_URL}/${id}`, authConfig(token));
  return response.data;
};
