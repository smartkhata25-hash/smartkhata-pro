import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_BASE_URL;

const PRODUCT_PERFORMANCE_API = `${BASE_URL}/api/product-performance`;

const createApiError = ({ message, status = 0, validationErrors = [], originalError = null }) => {
  const apiError = new Error(message);

  apiError.name = 'ProductPerformanceApiError';
  apiError.status = status;
  apiError.validationErrors = validationErrors;
  apiError.originalError = originalError;

  return apiError;
};

const validateApiConfiguration = () => {
  if (!BASE_URL) {
    throw createApiError({
      message: 'REACT_APP_API_BASE_URL is not configured.',
    });
  }
};

const getAuthorizationHeaders = () => {
  const token = localStorage.getItem('token');

  if (!token) {
    throw createApiError({
      message: 'Authentication token is missing.',
      status: 401,
    });
  }

  return {
    Authorization: `Bearer ${token}`,
  };
};

const buildQueryParams = (filters = {}) => {
  const params = {};

  Object.entries(filters).forEach(([key, value]) => {
    const shouldSkip = value === undefined || value === null || value === '';

    if (shouldSkip) {
      return;
    }

    params[key] = value;
  });

  return params;
};

const normalizeApiError = (error, fallbackMessage) => {
  if (error?.name === 'ProductPerformanceApiError') {
    return error;
  }

  if (error?.response) {
    return createApiError({
      message: error.response.data?.message || fallbackMessage,

      status: Number(error.response.status || 0),

      validationErrors: Array.isArray(error.response.data?.errors)
        ? error.response.data.errors
        : [],

      originalError: error,
    });
  }

  if (error?.request) {
    return createApiError({
      message: 'Unable to connect to the server. Please check your internet connection.',

      status: 0,
      originalError: error,
    });
  }

  return createApiError({
    message: error?.message || fallbackMessage,
    status: 0,
    originalError: error,
  });
};

export const fetchProductPerformanceReport = async (filters = {}) => {
  try {
    validateApiConfiguration();

    const response = await axios.get(PRODUCT_PERFORMANCE_API, {
      headers: getAuthorizationHeaders(),
      params: buildQueryParams(filters),
    });

    if (!response?.data) {
      throw createApiError({
        message: 'The server returned an empty response.',
      });
    }

    return response.data;
  } catch (error) {
    const normalizedError = normalizeApiError(
      error,
      'Failed to load the product performance report.'
    );

    console.error('Product performance report API error:', normalizedError);

    throw normalizedError;
  }
};

export const fetchProductPerformanceDetails = async (productId) => {
  try {
    validateApiConfiguration();

    if (!productId) {
      throw createApiError({
        message: 'Product ID is required.',
        status: 400,
      });
    }

    const safeProductId = encodeURIComponent(productId);

    const response = await axios.get(`${PRODUCT_PERFORMANCE_API}/${safeProductId}/details`, {
      headers: getAuthorizationHeaders(),
    });

    if (!response?.data) {
      throw createApiError({
        message: 'The server returned an empty response.',
      });
    }

    return response.data;
  } catch (error) {
    const normalizedError = normalizeApiError(error, 'Failed to load product performance details.');

    console.error('Product performance details API error:', normalizedError);

    throw normalizedError;
  }
};
