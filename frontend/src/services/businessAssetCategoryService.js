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

const buildCategoryQuery = (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.includeInactive) {
    params.append('includeInactive', 'true');
  }

  appendBusinessValueModuleScopeParam(params, filters.moduleScope);

  return params.toString();
};

const normalizeCategoryPayload = (category = {}) => {
  return {
    name: String(category.name || '').trim(),
    description: String(category.description || '').trim(),
    isActive: category.isActive === undefined ? true : Boolean(category.isActive),
  };
};

export const fetchBusinessAssetCategories = async (filters = {}) => {
  try {
    const queryString = buildCategoryQuery(filters);

    const url = queryString
      ? `${BASE_URL}/api/business-asset-categories?${queryString}`
      : `${BASE_URL}/api/business-asset-categories`;

    const response = await axios.get(url, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Business Asset Categories Load Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business asset categories'));
  }
};

export const fetchBusinessAssetCategoryById = async (categoryId, options = {}) => {
  try {
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    const response = await axios.get(
      `${BASE_URL}/api/business-asset-categories/${categoryId}`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Business Asset Category Detail Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business asset category'));
  }
};

export const createBusinessAssetCategory = async (categoryData, options = {}) => {
  try {
    const payload = withBusinessValueModuleScope(
      normalizeCategoryPayload(categoryData),
      options.moduleScope || categoryData?.moduleScope
    );

    const response = await axios.post(
      `${BASE_URL}/api/business-asset-categories`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Create Business Asset Category Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to create business asset category'));
  }
};

export const updateBusinessAssetCategory = async (categoryId, categoryData, options = {}) => {
  try {
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    const payload = withBusinessValueModuleScope(
      normalizeCategoryPayload(categoryData),
      options.moduleScope || categoryData?.moduleScope
    );

    const response = await axios.put(
      `${BASE_URL}/api/business-asset-categories/${categoryId}`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Update Business Asset Category Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to update business asset category'));
  }
};

export const deleteBusinessAssetCategory = async (categoryId, options = {}) => {
  try {
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    const response = await axios.delete(
      `${BASE_URL}/api/business-asset-categories/${categoryId}`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Delete Business Asset Category Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to delete business asset category'));
  }
};

export const restoreBusinessAssetCategory = async (categoryId, options = {}) => {
  try {
    if (!categoryId) {
      throw new Error('Category ID is required');
    }

    const response = await axios.patch(
      `${BASE_URL}/api/business-asset-categories/${categoryId}/restore`,
      {},
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Restore Business Asset Category Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to restore business asset category'));
  }
};

export const getEmptyBusinessAssetCategory = () => {
  return {
    name: '',
    description: '',
    isActive: true,
  };
};

export const sortBusinessAssetCategories = (categories = []) => {
  return [...categories].sort((first, second) => {
    if (first.isSystem !== second.isSystem) {
      return first.isSystem ? -1 : 1;
    }

    return String(first.name || '').localeCompare(String(second.name || ''));
  });
};

export const getActiveBusinessAssetCategories = (categories = []) => {
  return categories.filter(
    (category) => category && category.isDeleted !== true && category.isActive !== false
  );
};

const businessAssetCategoryService = {
  fetchBusinessAssetCategories,
  fetchBusinessAssetCategoryById,
  createBusinessAssetCategory,
  updateBusinessAssetCategory,
  deleteBusinessAssetCategory,
  restoreBusinessAssetCategory,
  getEmptyBusinessAssetCategory,
  sortBusinessAssetCategories,
  getActiveBusinessAssetCategories,
};

export default businessAssetCategoryService;
