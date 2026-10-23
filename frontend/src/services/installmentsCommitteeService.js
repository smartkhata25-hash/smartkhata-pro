import axios from 'axios';
import { cachedInstallmentsRequest, getInstallmentsCacheSnapshot, INSTALLMENTS_CACHE_DOMAINS as D, INSTALLMENTS_STALE_TIME as TTL, invalidateInstallmentsCommitteeData } from '../utils/installmentsMasterCache';

const API = `${process.env.REACT_APP_API_BASE_URL}/api/installments/committees`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const unwrap = (request) => request.then((response) => response.data);
const after = (request) => unwrap(request).then((result) => { invalidateInstallmentsCommitteeData(); return result; });

export const getInstallmentsCommitteesPage = (params = {}, options = {}) => cachedInstallmentsRequest(D.COMMITTEES, params, () => unwrap(axios.get(API, { ...auth(), params })), { staleTime: TTL.FINANCIAL, ...options });
export const getInstallmentsCommitteesPageCacheSnapshot = (params = {}) => getInstallmentsCacheSnapshot(D.COMMITTEES, params, TTL.FINANCIAL);
export const getInstallmentsCommitteeDetail = (committeeId, params = {}, options = {}) => cachedInstallmentsRequest(D.COMMITTEE_DETAIL, { committeeId, ...params }, () => unwrap(axios.get(`${API}/${committeeId}`, { ...auth(), params })), { staleTime: TTL.FINANCIAL, ...options });
export const archiveInstallmentsCommittee = (committeeId, reason) => after(axios.delete(`${API}/${committeeId}`, { ...auth(), data: { reason } }));
export const restoreInstallmentsCommittee = (committeeId) => after(axios.post(`${API}/${committeeId}/restore`, {}, auth()));
export const closeInstallmentsCommitteeEarly = (committeeId, reason) => after(axios.post(`${API}/${committeeId}/close-early`, { reason }, auth()));
