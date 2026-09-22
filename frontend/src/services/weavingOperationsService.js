import axios from 'axios';

const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/weaving/operations`;
const COMMERCIAL_URL = `${process.env.REACT_APP_API_BASE_URL}/api/weaving/commercial`;
const config = (params) => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, params });
const data = (response) => response.data?.data ?? response.data;

export const listWeavingMaster = async (kind, params = {}) => data(await axios.get(`${API_URL}/masters/${kind}`, config(params)));
export const createWeavingMaster = async (kind, payload) => data(await axios.post(`${API_URL}/masters/${kind}`, payload, config()));
export const updateWeavingMaster = async (kind, id, payload) => data(await axios.put(`${API_URL}/masters/${kind}/${id}`, payload, config()));
export const listWeavingMasterOptions = async (type = '') => data(await axios.get(`${API_URL}/master-options`, config(type ? { type } : {})));
export const quickAddWeavingMasterOption = async (payload) => data(await axios.post(`${API_URL}/master-options`, payload, config()));
export const listWeavingLooms = async (params = {}) => data(await axios.get(`${API_URL}/looms`, config(params)));
export const createWeavingLoom = async (payload) => data(await axios.post(`${API_URL}/looms`, payload, config()));
export const updateWeavingLoom = async (id, payload) => data(await axios.put(`${API_URL}/looms/${id}`, payload, config()));
export const bulkCreateWeavingLooms = async (payload) => data(await axios.post(`${API_URL}/looms/bulk`, payload, config()));
export const listWeavingGodowns = async () => data(await axios.get(`${API_URL}/godowns`, config()));
export const createWeavingGodown = async (payload) => data(await axios.post(`${API_URL}/godowns`, payload, config()));
export const updateWeavingGodown = async (id, payload) => data(await axios.put(`${API_URL}/godowns/${id}`, payload, config()));
export const listWeavingParties = async (params = {}) => data(await axios.get(`${API_URL}/parties`, config(params)));
export const createWeavingParty = async (payload) => data(await axios.post(`${COMMERCIAL_URL}/parties`, payload, config()));
export const getWeavingContractMeta = async () => data(await axios.get(`${API_URL}/contracts/meta`, config()));
export const listWeavingContracts = async (params = {}) => data(await axios.get(`${API_URL}/contracts`, config(params)));
export const createWeavingContract = async (payload) => data(await axios.post(`${API_URL}/contracts`, payload, config()));
export const updateWeavingContract = async (id, payload) => data(await axios.put(`${API_URL}/contracts/${id}`, payload, config()));
