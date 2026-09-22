import axios from 'axios';

import { clearAccountsCache } from './accountService';
import {
  clearTravelCacheDomain,
  clearTravelCacheDomainPrefix,
  TRAVEL_CACHE_DOMAINS,
} from '../utils/travelMasterCache';

export const EMPLOYEE_MODULE_SCOPES = Object.freeze({
  TRADING: 'trading',
  TRAVEL: 'travel',
  WEAVING: 'weaving',
});

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getToken = () => localStorage.getItem('token');

const normalizeModuleScope = (moduleScope = EMPLOYEE_MODULE_SCOPES.TRADING) =>
  [EMPLOYEE_MODULE_SCOPES.TRAVEL, EMPLOYEE_MODULE_SCOPES.WEAVING].includes(
    String(moduleScope || '').trim().toLowerCase()
  )
    ? String(moduleScope || '').trim().toLowerCase()
    : EMPLOYEE_MODULE_SCOPES.TRADING;

const getApiUrl = (moduleScope) => {
  const normalizedScope = normalizeModuleScope(moduleScope);

  if (normalizedScope === EMPLOYEE_MODULE_SCOPES.TRAVEL) {
    return `${BASE_URL}/api/travel/employees`;
  }

  if (normalizedScope === EMPLOYEE_MODULE_SCOPES.WEAVING) {
    return `${BASE_URL}/api/weaving/employees`;
  }

  return `${BASE_URL}/api/employees`;
};

const getConfig = (params = {}) => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  params,
});

const unwrap = (response) => response.data?.data ?? response.data;

const clearEmployeeCaches = (moduleScope) => {
  clearAccountsCache();

  if (normalizeModuleScope(moduleScope) === EMPLOYEE_MODULE_SCOPES.TRAVEL) {
    clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.EMPLOYEES);
    clearTravelCacheDomain(TRAVEL_CACHE_DOMAINS.DASHBOARD);
    clearTravelCacheDomainPrefix(TRAVEL_CACHE_DOMAINS.REPORTS);
  }
};

const get = async (path, { moduleScope, params } = {}) => {
  const response = await axios.get(`${getApiUrl(moduleScope)}${path}`, getConfig(params));
  return unwrap(response);
};

const post = async (path, data = {}, { moduleScope } = {}) => {
  const response = await axios.post(`${getApiUrl(moduleScope)}${path}`, data, getConfig());
  clearEmployeeCaches(moduleScope);
  return unwrap(response);
};

const put = async (path, data = {}, { moduleScope } = {}) => {
  const response = await axios.put(`${getApiUrl(moduleScope)}${path}`, data, getConfig());
  clearEmployeeCaches(moduleScope);
  return unwrap(response);
};

const del = async (path, { moduleScope, data = {} } = {}) => {
  const response = await axios.delete(`${getApiUrl(moduleScope)}${path}`, {
    ...getConfig(),
    data,
  });
  clearEmployeeCaches(moduleScope);
  return unwrap(response);
};

export const fetchEmployeePrintHtml = async (path, options = {}) => {
  const response = await axios.get(`${getApiUrl(options.moduleScope)}${path}`, {
    ...getConfig(options.params || {}),
    responseType: 'text',
  });

  return response.data;
};

export const fetchEmployeePdf = async (path, options = {}) => {
  const response = await axios.get(`${getApiUrl(options.moduleScope)}${path}`, {
    ...getConfig(options.params || {}),
    responseType: 'blob',
  });

  return response.data;
};

export const getEmployees = (options = {}) =>
  get('/', {
    moduleScope: options.moduleScope,
    params: {
      search: options.search || '',
      status: options.status || '',
      unitId: options.unitId || '',
      departmentId: options.departmentId || '',
      designationId: options.designationId || '',
      shiftId: options.shiftId || '',
    },
  });

export const getEmployeeById = (employeeId, options = {}) =>
  get(`/${employeeId}`, {
    ...options,
    params: {
      ...(options.params || {}),
      includeInactive: options.includeInactive === true,
    },
  });

export const createEmployee = (data, options = {}) =>
  post('/', data, options);

export const updateEmployee = (employeeId, data, options = {}) =>
  put(`/${employeeId}`, data, options);

export const deleteEmployee = (employeeId, options = {}) =>
  del(`/${employeeId}`, options);

export const restoreEmployee = (employeeId, options = {}) =>
  post(`/${employeeId}/restore`, options.data || {}, options);

export const getEmployeeFormMeta = (options = {}) =>
  get('/form-meta', {
    moduleScope: options.moduleScope,
    params: {
      unitId: options.unitId || '',
    },
  });

export const getEmployeeSummary = (options = {}) =>
  get('/summary', options);

export const getEmployeeLedgersSummary = (options = {}) =>
  get('/ledgers/summary', {
    moduleScope: options.moduleScope,
    params: {
      search: options.search || '',
      position: options.position || 'all',
      status: options.status || 'active',
    },
  });

export const getEmployeeDesignations = (options = {}) =>
  get('/designations', options);

export const createEmployeeDesignation = (data, options = {}) =>
  post('/designations', data, options);

export const updateEmployeeDesignation = (designationId, data, options = {}) =>
  put(`/designations/${designationId}`, data, options);

export const deleteEmployeeDesignation = (designationId, options = {}) =>
  del(`/designations/${designationId}`, options);

export const getWeavingUnits = (options = {}) =>
  get('/units', options);

export const createWeavingUnit = (data, options = {}) =>
  post('/units', data, options);

export const updateWeavingUnit = (unitId, data, options = {}) =>
  put(`/units/${unitId}`, data, options);

export const deleteWeavingUnit = (unitId, options = {}) =>
  del(`/units/${unitId}`, options);

export const getWeavingDepartments = (options = {}) =>
  get('/departments', options);

export const createWeavingDepartment = (data, options = {}) =>
  post('/departments', data, options);

export const updateWeavingDepartment = (departmentId, data, options = {}) =>
  put(`/departments/${departmentId}`, data, options);

export const deleteWeavingDepartment = (departmentId, options = {}) =>
  del(`/departments/${departmentId}`, options);

export const getWeavingShifts = (options = {}) =>
  get('/shifts', options);

export const createWeavingShift = (data, options = {}) =>
  post('/shifts', data, options);

export const updateWeavingShift = (shiftId, data, options = {}) =>
  put(`/shifts/${shiftId}`, data, options);

export const deleteWeavingShift = (shiftId, options = {}) =>
  del(`/shifts/${shiftId}`, options);

export const getPayrolls = (options = {}) =>
  get('/payroll', {
    moduleScope: options.moduleScope,
    params: {
      employeeId: options.employeeId || '',
      periodKey: options.periodKey || '',
      status: options.status || '',
      recordState: options.recordState || 'active',
      cycleKey: options.cycleKey || '',
      segmentNo: options.segmentNo || '',
    },
  });

export const getPayrollById = (payrollId, options = {}) =>
  get(`/payroll/${payrollId}`, {
    ...options,
    params: {
      ...(options.params || {}),
      includeInactive: options.includeInactive === true,
    },
  });

export const createPayroll = (data, options = {}) =>
  post('/payroll', data, options);

export const updatePayroll = (payrollId, data, options = {}) =>
  put(`/payroll/${payrollId}`, data, options);

export const payPayroll = (payrollId, data, options = {}) =>
  post(`/payroll/${payrollId}/pay`, data, options);

export const voidPayroll = (payrollId, options = {}) =>
  post(`/payroll/${payrollId}/void`, options.data || {}, options);

export const restorePayroll = (payrollId, options = {}) =>
  post(`/payroll/${payrollId}/restore`, options.data || {}, options);

export const getAdvanceLoans = (options = {}) =>
  get('/advance-loans', {
    moduleScope: options.moduleScope,
    params: {
      employeeId: options.employeeId || '',
      kind: options.kind || '',
      status: options.status || '',
    },
  });

export const createAdvanceLoan = (data, options = {}) =>
  post('/advance-loans', data, options);

export const updateAdvanceLoan = (advanceLoanId, data, options = {}) =>
  put(`/advance-loans/${advanceLoanId}`, data, options);

export const recoverAdvanceLoan = (advanceLoanId, data, options = {}) =>
  post(`/advance-loans/${advanceLoanId}/recover`, data, options);

export const voidAdvanceLoan = (advanceLoanId, options = {}) =>
  post(`/advance-loans/${advanceLoanId}/void`, options.data || {}, options);

export const getEmployeeLedger = (employeeId, options = {}) =>
  get(`/${employeeId}/ledger`, {
    moduleScope: options.moduleScope,
    params: {
      startDate: options.startDate || '',
      endDate: options.endDate || '',
    },
  });

export const getPrintableUrl = (path, moduleScope) =>
  `${getApiUrl(moduleScope)}${path}`;

const employeeService = {
  createAdvanceLoan,
  createEmployee,
  createEmployeeDesignation,
  createPayroll,
  createWeavingDepartment,
  createWeavingShift,
  createWeavingUnit,
  deleteEmployee,
  deleteEmployeeDesignation,
  deleteWeavingDepartment,
  deleteWeavingShift,
  deleteWeavingUnit,
  getAdvanceLoans,
  getEmployeeById,
  getEmployeeDesignations,
  getEmployeeFormMeta,
  getEmployeeLedger,
  getEmployeeLedgersSummary,
  getEmployeeSummary,
  getEmployees,
  getWeavingDepartments,
  getWeavingShifts,
  getWeavingUnits,
  fetchEmployeePdf,
  fetchEmployeePrintHtml,
  getPayrollById,
  getPayrolls,
  getPrintableUrl,
  payPayroll,
  recoverAdvanceLoan,
  restoreEmployee,
  restorePayroll,
  updateAdvanceLoan,
  updateEmployee,
  updateEmployeeDesignation,
  updateWeavingDepartment,
  updateWeavingShift,
  updateWeavingUnit,
  updatePayroll,
  voidAdvanceLoan,
  voidPayroll,
};

export default employeeService;
