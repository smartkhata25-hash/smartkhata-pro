import axios from 'axios';
import { cachedInstallmentsRequest, INSTALLMENTS_CACHE_DOMAINS as D, INSTALLMENTS_STALE_TIME as TTL } from '../utils/installmentsMasterCache';

const API = `${process.env.REACT_APP_API_BASE_URL}/api/installments/reports`;
const config = (params = {}) => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, params });
const get = (domain, path, params = {}, options = {}) => cachedInstallmentsRequest(domain, params, () => axios.get(`${API}${path}`, config(params)).then((response) => response.data), { staleTime: options.staleTime ?? TTL.FINANCIAL, retries: 1, ...options });

export const getInstallmentsReportLookups = (options = {}) => get(D.REPORT_LOOKUPS, '/lookups', {}, { staleTime: TTL.MASTER, ...options });
export const getInstallmentsProfitReport = (params = {}, options = {}) => get(D.REPORT_PROFIT, '/profit', params, options);
export const getInstallmentsCollectionReport = (params = {}, options = {}) => get(D.REPORT_COLLECTIONS, '/collections', params, { staleTime: TTL.TODAY, ...options });
export const getInstallmentsExpensesReport = (params = {}, options = {}) => get(D.REPORT_EXPENSES, '/expenses', params, options);
export const getInstallmentsBalancesReport = (options = {}) => get(D.REPORT_BALANCES, '/balances', {}, options);
export const getInstallmentsSavingsReport = (options = {}) => get(D.REPORT_SAVINGS, '/savings', {}, options);
