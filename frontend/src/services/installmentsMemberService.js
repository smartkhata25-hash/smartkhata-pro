import axios from 'axios';
import {
  cachedInstallmentsRequest,
  INSTALLMENTS_CACHE_DOMAINS as D,
  INSTALLMENTS_STALE_TIME as TTL,
  invalidateInstallmentsCommitteeData,
  invalidateInstallmentsMemberData,
} from '../utils/installmentsMasterCache';

const API_URL = `${process.env.REACT_APP_API_BASE_URL}/api/installments/members`;
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
const unwrap = (request) => request.then((response) => response.data);
const after = (request, invalidate) => unwrap(request).then((result) => { invalidate(); return result; });

export const getInstallmentsMembers = (params = {}, options = {}) => cachedInstallmentsRequest(D.MEMBERS, params, () => unwrap(axios.get(API_URL, { ...auth(), params })), { staleTime: TTL.MASTER, ...options });
export const createInstallmentsMember = (payload) => after(axios.post(API_URL, payload, auth()), invalidateInstallmentsMemberData);
export const quickCreateInstallmentsMember = (fullName) => after(axios.post(`${API_URL}/quick`, { fullName }, auth()), invalidateInstallmentsMemberData);
export const getNextInstallmentsMemberNumber = () => unwrap(axios.get(`${API_URL}/next-number`, auth()));
export const getInstallmentsMember = (memberId, params = {}, options = {}) => cachedInstallmentsRequest(D.MEMBER_DETAIL, { memberId, ...params }, () => unwrap(axios.get(`${API_URL}/${memberId}`, { ...auth(), params })), { staleTime: TTL.FINANCIAL, ...options });
export const getInstallmentsMemberLedger = (memberId, params = {}) => unwrap(axios.get(`${API_URL}/${memberId}/ledger`, { ...auth(), params }));
export const updateInstallmentsMember = (memberId, payload) => after(axios.put(`${API_URL}/${memberId}`, payload, auth()), invalidateInstallmentsMemberData);
export const archiveInstallmentsMember = (memberId) => after(axios.delete(`${API_URL}/${memberId}`, auth()), invalidateInstallmentsMemberData);
export const restoreInstallmentsMember = (memberId) => after(axios.post(`${API_URL}/${memberId}/restore`, {}, auth()), invalidateInstallmentsMemberData);
export const getInstallmentsMemberFinancialSummary = (memberId, options = {}) => cachedInstallmentsRequest(D.MEMBER_DETAIL, { memberId, view: 'financial-summary' }, () => unwrap(axios.get(`${API_URL}/${memberId}/financial-summary`, auth())), { staleTime: TTL.FINANCIAL, ...options });
export const updateInstallmentsOpeningBalance = (memberId, payload) => after(axios.put(`${API_URL}/${memberId}/opening-balance`, payload, auth()), invalidateInstallmentsMemberData);
export const getInstallmentsCommittees = (memberId, options = {}) => cachedInstallmentsRequest(D.COMMITTEES, { memberId }, () => unwrap(axios.get(`${API_URL}/${memberId}/committees`, auth())), { staleTime: TTL.FINANCIAL, ...options });
export const createInstallmentsCommittee = (memberId, payload) => after(axios.post(`${API_URL}/${memberId}/committees`, payload, auth()), invalidateInstallmentsCommitteeData);
export const updateInstallmentsCommittee = (memberId, committeeId, payload) => after(axios.put(`${API_URL}/${memberId}/committees/${committeeId}`, payload, auth()), invalidateInstallmentsCommitteeData);
export const previewInstallmentsSchedule = (payload) => unwrap(axios.post(`${API_URL}/schedule-preview`, payload, auth()));

const installmentsMemberService = {
  getInstallmentsMembers,
  createInstallmentsMember,
  quickCreateInstallmentsMember,
  getNextInstallmentsMemberNumber,
  getInstallmentsMember,
  getInstallmentsMemberLedger,
  updateInstallmentsMember,
  archiveInstallmentsMember,
  restoreInstallmentsMember,
  getInstallmentsMemberFinancialSummary,
  updateInstallmentsOpeningBalance,
  getInstallmentsCommittees,
  createInstallmentsCommittee,
  updateInstallmentsCommittee,
  previewInstallmentsSchedule,
};

export default installmentsMemberService;

