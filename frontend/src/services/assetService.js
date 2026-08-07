import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getToken = () => localStorage.getItem('token');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = getToken();

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;

    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('user');
      localStorage.removeItem('mode');

      window.location.href = '/#/login';
    }

    return Promise.reject(error);
  }
);

const cleanParams = (params = {}) => {
  return Object.entries(params).reduce((result, [key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      result[key] = value;
    }

    return result;
  }, {});
};

const getErrorMessage = (error, fallback = 'Something went wrong') => {
  return (
    error?.response?.data?.message || error?.response?.data?.error || error?.message || fallback
  );
};

const normalizeResponse = (response) => {
  return response?.data ?? null;
};

const createFormData = (payload = {}) => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return;
    }

    if (key === 'attachments' && Array.isArray(value)) {
      value.forEach((file) => {
        if (file instanceof File) {
          formData.append('attachments', file);
        }
      });

      return;
    }

    if (typeof value === 'object' && !(value instanceof File) && !(value instanceof Blob)) {
      formData.append(key, JSON.stringify(value));

      return;
    }

    formData.append(key, value);
  });

  return formData;
};

const request = async ({ method = 'get', url, data = null, params = null, headers = {} }) => {
  try {
    const response = await api({
      method,
      url,
      data,
      params: cleanParams(params || {}),
      headers,
    });

    return normalizeResponse(response);
  } catch (error) {
    const serviceError = new Error(getErrorMessage(error));

    serviceError.status = error?.response?.status || 500;

    serviceError.data = error?.response?.data || null;

    throw serviceError;
  }
};

const getAssets = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/assets',
    params,
  });
};

const getAssetSummary = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/assets/summary',
    params,
  });
};

const getAssetById = async (assetId) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'get',
    url: `/api/assets/${assetId}`,
  });
};

const createAsset = async (payload, { useFormData = false } = {}) => {
  if (!payload) {
    throw new Error('Asset data is required');
  }

  if (useFormData) {
    return request({
      method: 'post',
      url: '/api/assets',
      data: createFormData(payload),
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  return request({
    method: 'post',
    url: '/api/assets',
    data: payload,
  });
};

const updateAsset = async (assetId, payload, { useFormData = false } = {}) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  if (!payload) {
    throw new Error('Asset data is required');
  }

  if (useFormData) {
    return request({
      method: 'put',
      url: `/api/assets/${assetId}`,
      data: createFormData(payload),
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  return request({
    method: 'put',
    url: `/api/assets/${assetId}`,
    data: payload,
  });
};

const deleteAsset = async (assetId) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'delete',
    url: `/api/assets/${assetId}`,
  });
};

const restoreAsset = async (assetId) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/assets/${assetId}/restore`,
  });
};

const updateAssetValue = async (assetId, payload) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/assets/${assetId}/value`,
    data: payload,
  });
};

const updateAssetStatus = async (assetId, payload) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/assets/${assetId}/status`,
    data: payload,
  });
};

const sellAsset = async (assetId, payload) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'post',
    url: `/api/assets/${assetId}/sell`,
    data: payload,
  });
};

const disposeAsset = async (assetId, payload) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'post',
    url: `/api/assets/${assetId}/dispose`,
    data: payload,
  });
};

const getAssetHistory = async (assetId, params = {}) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'get',
    url: `/api/assets/${assetId}/history`,
    params,
  });
};

const removeAssetAttachment = async (assetId, attachmentId) => {
  if (!assetId || !attachmentId) {
    throw new Error('Asset ID and attachment ID are required');
  }

  return request({
    method: 'delete',
    url: `/api/assets/${assetId}/attachments/${attachmentId}`,
  });
};

const getAssetCategories = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-categories',
    params,
  });
};

const getAssetCategoryById = async (categoryId) => {
  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  return request({
    method: 'get',
    url: `/api/asset-categories/${categoryId}`,
  });
};

const createAssetCategory = async (payload) => {
  return request({
    method: 'post',
    url: '/api/asset-categories',
    data: payload,
  });
};

const updateAssetCategory = async (categoryId, payload) => {
  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  return request({
    method: 'put',
    url: `/api/asset-categories/${categoryId}`,
    data: payload,
  });
};

const updateAssetCategoryStatus = async (categoryId, payload) => {
  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/asset-categories/${categoryId}/status`,
    data: payload,
  });
};

const deleteAssetCategory = async (categoryId) => {
  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  return request({
    method: 'delete',
    url: `/api/asset-categories/${categoryId}`,
  });
};

const restoreAssetCategory = async (categoryId) => {
  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/asset-categories/${categoryId}/restore`,
  });
};

const seedAssetCategories = async () => {
  return request({
    method: 'post',
    url: '/api/asset-categories/seed-defaults',
  });
};

const getAssetTitles = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-titles',
    params,
  });
};

const searchAssetTitles = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-titles/search',
    params,
  });
};

const getAssetTitleById = async (titleId) => {
  if (!titleId) {
    throw new Error('Title ID is required');
  }

  return request({
    method: 'get',
    url: `/api/asset-titles/${titleId}`,
  });
};

const createAssetTitle = async (payload) => {
  return request({
    method: 'post',
    url: '/api/asset-titles',
    data: payload,
  });
};

const updateAssetTitle = async (titleId, payload) => {
  if (!titleId) {
    throw new Error('Title ID is required');
  }

  return request({
    method: 'put',
    url: `/api/asset-titles/${titleId}`,
    data: payload,
  });
};

const updateAssetTitleStatus = async (titleId, payload) => {
  if (!titleId) {
    throw new Error('Title ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/asset-titles/${titleId}/status`,
    data: payload,
  });
};

const deleteAssetTitle = async (titleId) => {
  if (!titleId) {
    throw new Error('Title ID is required');
  }

  return request({
    method: 'delete',
    url: `/api/asset-titles/${titleId}`,
  });
};

const restoreAssetTitle = async (titleId) => {
  if (!titleId) {
    throw new Error('Title ID is required');
  }

  return request({
    method: 'patch',
    url: `/api/asset-titles/${titleId}/restore`,
  });
};

const seedAssetTitles = async () => {
  return request({
    method: 'post',
    url: '/api/asset-titles/seed-defaults',
  });
};

const previewSingleDepreciation = async (assetId, payload = {}) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'post',
    url: `/api/asset-depreciation/${assetId}/preview`,
    data: payload,
  });
};

const postSingleDepreciation = async (assetId, payload = {}) => {
  if (!assetId) {
    throw new Error('Asset ID is required');
  }

  return request({
    method: 'post',
    url: `/api/asset-depreciation/${assetId}/post`,
    data: payload,
  });
};

const previewBulkDepreciation = async (payload = {}) => {
  return request({
    method: 'post',
    url: '/api/asset-depreciation/preview-bulk',
    data: payload,
  });
};

const postBulkDepreciation = async (payload = {}) => {
  return request({
    method: 'post',
    url: '/api/asset-depreciation/post-bulk',
    data: payload,
  });
};

const postBulkDepreciationJournals = async (payload = {}) => {
  return request({
    method: 'post',
    url: '/api/asset-depreciation/post-bulk-journals',
    data: payload,
  });
};

const getDepreciationSummary = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-depreciation/summary',
    params,
  });
};

const getDepreciationPostingById = async (historyId) => {
  if (!historyId) {
    throw new Error('Depreciation history ID is required');
  }

  return request({
    method: 'get',
    url: `/api/asset-depreciation/history/${historyId}`,
  });
};

const reverseAssetDepreciation = async (historyId, payload = {}) => {
  if (!historyId) {
    throw new Error('Depreciation history ID is required');
  }

  return request({
    method: 'post',
    url: `/api/asset-depreciation/history/${historyId}/reverse`,
    data: payload,
  });
};

const getBusinessValueReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/business-value',
    params,
  });
};

const getCategoryValueReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/category-value',
    params,
  });
};

const getAssetStatusReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/status',
    params,
  });
};

const getAssetConditionReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/condition',
    params,
  });
};

const getDepreciationReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/depreciation',
    params,
  });
};

const getAssetSaleReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/sales',
    params,
  });
};

const getAssetDisposalReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/disposals',
    params,
  });
};

const getMaintenanceReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/maintenance',
    params,
  });
};

const getAssetExpiryReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/expiry',
    params,
  });
};

const getAssetValueMovementReport = async (params = {}) => {
  return request({
    method: 'get',
    url: '/api/asset-reports/value-movement',
    params,
  });
};

const assetService = {
  getAssets,
  getAssetSummary,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  restoreAsset,
  updateAssetValue,
  updateAssetStatus,
  sellAsset,
  disposeAsset,
  getAssetHistory,
  removeAssetAttachment,

  getAssetCategories,
  getAssetCategoryById,
  createAssetCategory,
  updateAssetCategory,
  updateAssetCategoryStatus,
  deleteAssetCategory,
  restoreAssetCategory,
  seedAssetCategories,

  getAssetTitles,
  searchAssetTitles,
  getAssetTitleById,
  createAssetTitle,
  updateAssetTitle,
  updateAssetTitleStatus,
  deleteAssetTitle,
  restoreAssetTitle,
  seedAssetTitles,

  previewSingleDepreciation,
  postSingleDepreciation,
  previewBulkDepreciation,
  postBulkDepreciation,
  postBulkDepreciationJournals,
  getDepreciationSummary,
  getDepreciationPostingById,
  reverseAssetDepreciation,

  getBusinessValueReport,
  getCategoryValueReport,
  getAssetStatusReport,
  getAssetConditionReport,
  getDepreciationReport,
  getAssetSaleReport,
  getAssetDisposalReport,
  getMaintenanceReport,
  getAssetExpiryReport,
  getAssetValueMovementReport,
};

export {
  api,
  getErrorMessage,
  cleanParams,
  createFormData,
  getAssets,
  getAssetSummary,
  getAssetById,
  createAsset,
  updateAsset,
  deleteAsset,
  restoreAsset,
  updateAssetValue,
  updateAssetStatus,
  sellAsset,
  disposeAsset,
  getAssetHistory,
  removeAssetAttachment,
  getAssetCategories,
  getAssetCategoryById,
  createAssetCategory,
  updateAssetCategory,
  updateAssetCategoryStatus,
  deleteAssetCategory,
  restoreAssetCategory,
  seedAssetCategories,
  getAssetTitles,
  searchAssetTitles,
  getAssetTitleById,
  createAssetTitle,
  updateAssetTitle,
  updateAssetTitleStatus,
  deleteAssetTitle,
  restoreAssetTitle,
  seedAssetTitles,
  previewSingleDepreciation,
  postSingleDepreciation,
  previewBulkDepreciation,
  postBulkDepreciation,
  postBulkDepreciationJournals,
  getDepreciationSummary,
  getDepreciationPostingById,
  reverseAssetDepreciation,
  getBusinessValueReport,
  getCategoryValueReport,
  getAssetStatusReport,
  getAssetConditionReport,
  getDepreciationReport,
  getAssetSaleReport,
  getAssetDisposalReport,
  getMaintenanceReport,
  getAssetExpiryReport,
  getAssetValueMovementReport,
};

export default assetService;
