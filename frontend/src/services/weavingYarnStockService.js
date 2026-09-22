import axios from 'axios';
const URL = `${process.env.REACT_APP_API_BASE_URL}/api/weaving/yarn-stock`;
const cfg = (params) => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, params });
const unwrap = (response) => response.data?.data ?? response.data;
export const getYarnStockSummary = async (params = {}) => unwrap(await axios.get(`${URL}/summary`, cfg(params)));
export const getYarnStockLedger = async (yarnId, params = {}) => unwrap(await axios.get(`${URL}/${yarnId}/ledger`, cfg(params)));
export const getWeftConsumptionMeta = async () => unwrap(await axios.get(`${URL}/weft-consumption/meta`, cfg()));
export const createWeftConsumption = async (body) => unwrap(await axios.post(`${URL}/weft-consumption`, body, cfg()));
export const reverseWeftConsumption = async (batchId, reason) => unwrap(await axios.post(`${URL}/weft-consumption/${batchId}/reverse`, { reason }, cfg()));
