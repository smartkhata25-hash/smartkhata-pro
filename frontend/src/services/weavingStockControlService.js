import axios from 'axios';

const URL = `${process.env.REACT_APP_API_BASE_URL}/api/weaving/stock-control`;
const cfg = (params) => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, params });
const unwrap = (response) => response.data?.data ?? response.data;

export const getStockControlMeta = async () => unwrap(await axios.get(`${URL}/meta`, cfg()));
export const getStockControlHistory = async (kind) => unwrap(await axios.get(`${URL}/history`, cfg({ kind })));
export const createFabricTransfer = async (body) => unwrap(await axios.post(`${URL}/fabric-transfer`, body, cfg()));
export const createYarnTransfer = async (body) => unwrap(await axios.post(`${URL}/yarn-transfer`, body, cfg()));
export const createRewinderRecovery = async (body) => unwrap(await axios.post(`${URL}/rewinder-recovery`, body, cfg()));
export const reverseStockAdjustment = async (id, reason) => unwrap(await axios.post(`${URL}/${id}/reverse`, { reason }, cfg()));
