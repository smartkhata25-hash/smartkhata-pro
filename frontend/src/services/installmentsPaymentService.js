import axios from 'axios';
import { clearAccountsCache } from './accountService';
import {
  cachedInstallmentsRequest,
  getPakistanBusinessDateCacheKey,
  getInstallmentsCacheSnapshot,
  INSTALLMENTS_CACHE_DOMAINS as D,
  INSTALLMENTS_STALE_TIME as TTL,
  invalidateInstallmentsPayoutData,
  invalidateInstallmentsPaymentReversalData,
  invalidateInstallmentsReceiptData,
  invalidateInstallmentsSupplierPaymentData,
} from '../utils/installmentsMasterCache';

const API = `${process.env.REACT_APP_API_BASE_URL}/api/installments/payments`;
const auth = (key = '') => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, ...(key ? { 'Idempotency-Key': key } : {}) } });
const unwrap = (request) => request.then((response) => response.data);

const after = (request, invalidate) => unwrap(request).then((result) => { invalidate(); clearAccountsCache(); return result; });

export const getInstallmentsPaymentAccounts = (options = {}) => cachedInstallmentsRequest(D.ACCOUNTS, {}, () => unwrap(axios.get(`${API}/accounts`, auth())), { staleTime: TTL.ACCOUNTS, ...options });
export const getInstallmentsPaymentLookups = (options = {}) => cachedInstallmentsRequest(D.PAYMENT_LOOKUPS, {}, () => unwrap(axios.get(`${API}/lookups`, auth())), { staleTime: TTL.MASTER, ...options });
export const getInstallmentsMemberPaymentContext = (memberId, options = {}) => cachedInstallmentsRequest(D.MEMBER_CONTEXT, { memberId }, () => unwrap(axios.get(`${API}/members/${memberId}/context`, auth())), { staleTime: TTL.FINANCIAL, ...options });
export const getInstallmentsSupplierPaymentContext = (supplierId, options = {}) => cachedInstallmentsRequest(D.SUPPLIER_CONTEXT, { supplierId }, () => unwrap(axios.get(`${API}/suppliers/${supplierId}/context`, auth())), { staleTime: TTL.FINANCIAL, ...options });
export const postInstallmentsReceipt = (payload, key) => after(axios.post(`${API}/receive`, payload, auth(key)), invalidateInstallmentsReceiptData);
export const postInstallmentsSupplierPayment = (payload, key) => after(axios.post(`${API}/pay-bill`, payload, auth(key)), invalidateInstallmentsSupplierPaymentData);
export const postInstallmentsSavingsPayout = (payload, key) => after(axios.post(`${API}/savings-payout`, payload, auth(key)), invalidateInstallmentsPayoutData);
export const getInstallmentsCollections = (params = {}, options = {}) => cachedInstallmentsRequest(D.COLLECTIONS, params, () => unwrap(axios.get(`${API}/collections`, { ...auth(), params })), { staleTime: TTL.TODAY, retries: 1, ...options });
export const correctInstallmentsCollectionReceipt = (id, amount, key) => after(axios.post(`${API}/collections/${id}/correct`, { amount }, auth(key)), invalidateInstallmentsReceiptData);
export const getInstallmentsPaymentHistory = (params = {}, options = {}) => cachedInstallmentsRequest(D.PAYMENT_HISTORY, params, () => unwrap(axios.get(`${API}/history`, { ...auth(), params })), { staleTime: TTL.FINANCIAL, ...options });
export const getInstallmentsPaymentDetail = (id, options = {}) => cachedInstallmentsRequest(D.PAYMENT_DETAIL, { id }, () => unwrap(axios.get(`${API}/${id}`, auth())), { staleTime: TTL.FINANCIAL, ...options });
export const reverseInstallmentsPayment = (id, reason) => after(axios.post(`${API}/${id}/reverse`, { reason }, auth()), invalidateInstallmentsPaymentReversalData);
const dashboardCacheParams = (params = {}) => ({ ...params, businessDate: params.date || getPakistanBusinessDateCacheKey() });
export const getInstallmentsPaymentDashboardCacheSnapshot = (params = {}) => getInstallmentsCacheSnapshot(D.DASHBOARD, dashboardCacheParams(params), TTL.DASHBOARD);
export const getInstallmentsPaymentDashboard = (params = {}, options = {}) => cachedInstallmentsRequest(D.DASHBOARD, dashboardCacheParams(params), () => unwrap(axios.get(`${API}/dashboard`, { ...auth(), params })), { staleTime: TTL.DASHBOARD, retries: 1, ...options });

export const createPaymentRequestKey = () => (window.crypto?.randomUUID?.() || `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`);
