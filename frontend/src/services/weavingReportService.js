import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;
const REPORT_API = `${BASE_URL}/api/weaving/reports`;

const getToken = () => localStorage.getItem('token');

const authConfig = (params = {}, responseType = 'json') => ({
  headers: {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  },
  params,
  ...(responseType === 'json' ? {} : { responseType }),
});

const buildSalaryClosingParams = (options = {}) => ({
  cycleKey: options.cycleKey || '',
  segmentNo: options.segmentNo || '',
  unitId: options.unitId || '',
});

const getReport = async (path, params = {}) => {
  const response = await axios.get(`${REPORT_API}/${path}`, authConfig(params));
  return response.data?.data ?? response.data;
};

export const getWeavingReportMeta = () => getReport('meta');
export const getWeavingProductionReport = (params = {}) => getReport('production', params);
export const getWeavingLoomPerformance = (params = {}) => getReport('looms', params);
export const getWeavingLoomLedger = (id, params = {}) => getReport(`looms/${id}`, params);
export const getWeavingQualityProduction = (params = {}) => getReport('quality-production', params);
export const getWeavingFabricStockReport = (params = {}) => getReport('fabric-stock', params);
export const getWeavingSalesReport = (params = {}) => getReport('sales', params);
export const getWeavingPendingRejectionReport = (params = {}) => getReport('pending-rejection', params);
export const getWeavingProfitReport = (params = {}) => getReport('profit', params);
export const getWeavingProfitDetails = (params = {}) => getReport('profit/details', params);
export const getWeavingInventoryValuation = () => getReport('costing/valuation');
export const rebuildWeavingCosting = async () => {
  const response = await axios.post(`${REPORT_API}/costing/rebuild`, {}, authConfig());
  return response.data?.data ?? response.data;
};
export const getWeavingDashboardSummary = () => getReport('dashboard');
export const weavingOperationalReportUrl = (kind, format, params = {}) => {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null)), token: getToken() || '' });
  return `${REPORT_API}/operational/${kind}/${format}?${query.toString()}`;
};

export const getSalaryClosingReport = async (options = {}) => {
  const response = await axios.get(
    `${REPORT_API}/salary-closing`,
    authConfig(buildSalaryClosingParams(options))
  );

  return response.data?.data ?? response.data;
};

export const fetchSalaryClosingPrintHtml = async (options = {}) => {
  const response = await axios.get(
    `${REPORT_API}/salary-closing/print`,
    authConfig(buildSalaryClosingParams(options), 'text')
  );

  return response.data;
};

export const downloadSalaryClosingPdf = async (options = {}) => {
  const response = await axios.get(
    `${REPORT_API}/salary-closing/pdf`,
    authConfig(buildSalaryClosingParams(options), 'blob')
  );

  return response.data;
};

const weavingReportService = {
  downloadSalaryClosingPdf,
  fetchSalaryClosingPrintHtml,
  getSalaryClosingReport,
  getWeavingDashboardSummary,
  getWeavingFabricStockReport,
  getWeavingLoomLedger,
  getWeavingLoomPerformance,
  getWeavingPendingRejectionReport,
  getWeavingProductionReport,
  getWeavingProfitReport,
  getWeavingProfitDetails,
  getWeavingInventoryValuation,
  getWeavingQualityProduction,
  getWeavingReportMeta,
  getWeavingSalesReport,
  rebuildWeavingCosting,
  weavingOperationalReportUrl,
};

export default weavingReportService;
