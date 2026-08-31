import axios from 'axios';

import {
  appendBusinessValueModuleScopeParam,
  getBusinessValueModuleScopeParams,
  withBusinessValueModuleScope,
} from './businessValueModuleScope';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const getAuthConfig = () => {
  const token = localStorage.getItem('token');

  return {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
};

const getErrorMessage = (error, fallbackMessage) => {
  return (
    error.response?.data?.message || error.response?.data?.error || error.message || fallbackMessage
  );
};

const buildAssetQuery = (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.categoryId) {
    params.append('categoryId', filters.categoryId);
  }

  if (filters.status) {
    params.append('status', filters.status);
  }

  if (filters.includeInactive) {
    params.append('includeInactive', 'true');
  }

  if (filters.page) {
    params.append('page', String(filters.page));
  }

  if (filters.limit) {
    params.append('limit', String(filters.limit));
  }

  appendBusinessValueModuleScopeParam(params, filters.moduleScope);

  return params.toString();
};

const normalizeAssetPayload = (asset = {}) => {
  return {
    categoryId: asset.categoryId || '',
    name: String(asset.name || '').trim(),
    quantity: Number(asset.quantity || 1),
    purchaseCost: Number(asset.purchaseCost || 0),
    currentValue: Number(asset.currentValue || 0),
    purchaseDate: asset.purchaseDate || null,
    notes: String(asset.notes || '').trim(),
    status: asset.status || 'active',
  };
};

export const fetchAssetTitles = async ({ moduleScope } = {}) => {
  try {
    const params = new URLSearchParams();

    appendBusinessValueModuleScopeParam(params, moduleScope);

    const queryString = params.toString();
    const response = await axios.get(
      queryString
        ? `${BASE_URL}/api/business-assets/titles?${queryString}`
        : `${BASE_URL}/api/business-assets/titles`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Business Asset Titles Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business asset titles'));
  }
};

export const fetchBusinessAssets = async (filters = {}) => {
  try {
    const queryString = buildAssetQuery(filters);

    const url = queryString
      ? `${BASE_URL}/api/business-assets?${queryString}`
      : `${BASE_URL}/api/business-assets`;

    const response = await axios.get(url, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Business Assets Load Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business assets'));
  }
};

export const fetchBusinessAssetById = async (assetId, options = {}) => {
  try {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }

    const response = await axios.get(`${BASE_URL}/api/business-assets/${assetId}`, {
      ...getAuthConfig(),
      params: getBusinessValueModuleScopeParams(options.moduleScope),
    });

    return response.data;
  } catch (error) {
    console.error('Business Asset Detail Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business asset'));
  }
};

export const createBusinessAsset = async (assetData, options = {}) => {
  try {
    const payload = withBusinessValueModuleScope(
      normalizeAssetPayload(assetData),
      options.moduleScope || assetData?.moduleScope
    );

    const response = await axios.post(`${BASE_URL}/api/business-assets`, payload, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Create Business Asset Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to create business asset'));
  }
};

export const updateBusinessAsset = async (assetId, assetData, options = {}) => {
  try {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }

    const payload = withBusinessValueModuleScope(
      normalizeAssetPayload(assetData),
      options.moduleScope || assetData?.moduleScope
    );

    const response = await axios.put(
      `${BASE_URL}/api/business-assets/${assetId}`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Update Business Asset Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to update business asset'));
  }
};

export const deleteBusinessAsset = async (assetId, options = {}) => {
  try {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }

    const response = await axios.delete(
      `${BASE_URL}/api/business-assets/${assetId}`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Delete Business Asset Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to delete business asset'));
  }
};

export const restoreBusinessAsset = async (assetId, options = {}) => {
  try {
    if (!assetId) {
      throw new Error('Asset ID is required');
    }

    const response = await axios.patch(
      `${BASE_URL}/api/business-assets/${assetId}/restore`,
      {},
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Restore Business Asset Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to restore business asset'));
  }
};

export const getEmptyBusinessAsset = () => {
  return {
    categoryId: '',
    name: '',
    quantity: 1,
    purchaseCost: 0,
    currentValue: 0,
    purchaseDate: '',
    notes: '',
    status: 'active',
  };
};

export const calculateAssetPurchaseValue = (asset = {}) => {
  return Number(asset.quantity || 0) * Number(asset.purchaseCost || 0);
};

export const calculateAssetCurrentValue = (asset = {}) => {
  return Number(asset.quantity || 0) * Number(asset.currentValue || 0);
};

export const formatAssetAmount = (value) => {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const BUSINESS_ASSET_STATUS = {
  ACTIVE: 'active',
  SOLD: 'sold',
  REMOVED: 'removed',
};

const businessAssetService = {
  fetchAssetTitles,
  fetchBusinessAssets,
  fetchBusinessAssetById,
  createBusinessAsset,
  updateBusinessAsset,
  deleteBusinessAsset,
  restoreBusinessAsset,
  getEmptyBusinessAsset,
  calculateAssetPurchaseValue,
  calculateAssetCurrentValue,
  formatAssetAmount,
  BUSINESS_ASSET_STATUS,
};

export default businessAssetService;
