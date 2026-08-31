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

const buildLiabilityQuery = (filters = {}) => {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.append('search', filters.search.trim());
  }

  if (filters.category) {
    params.append('category', filters.category);
  }

  if (filters.status) {
    params.append('status', filters.status);
  }

  if (filters.includeClosed) {
    params.append('includeClosed', 'true');
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

const normalizeLiabilityPayload = (liability = {}) => {
  return {
    title: String(liability.title || '').trim(),
    category: liability.category || 'other',
    originalAmount: Number(liability.originalAmount || 0),
    remainingAmount:
      liability.remainingAmount === '' ||
      liability.remainingAmount === null ||
      liability.remainingAmount === undefined
        ? undefined
        : Number(liability.remainingAmount),
    startDate: liability.startDate || null,
    notes: String(liability.notes || '').trim(),
    status: liability.status || 'active',
  };
};

const normalizeLiabilityPaymentPayload = (payment = {}) => {
  return {
    amount: Number(payment.amount || 0),
    paymentDate: payment.paymentDate || null,
    paymentMethod: payment.paymentMethod || 'cash',
    accountId: payment.accountId || '',
    referenceNo: String(payment.referenceNo || '').trim(),
    note: String(payment.note || '').trim(),
  };
};

export const fetchLiabilityTitles = async ({ moduleScope } = {}) => {
  try {
    const params = new URLSearchParams();

    appendBusinessValueModuleScopeParam(params, moduleScope);

    const queryString = params.toString();

    const response = await axios.get(
      queryString
        ? `${BASE_URL}/api/business-liabilities/titles?${queryString}`
        : `${BASE_URL}/api/business-liabilities/titles`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Business Liability Titles Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business liability titles'));
  }
};

export const fetchBusinessLiabilities = async (filters = {}) => {
  try {
    const queryString = buildLiabilityQuery(filters);

    const url = queryString
      ? `${BASE_URL}/api/business-liabilities?${queryString}`
      : `${BASE_URL}/api/business-liabilities`;

    const response = await axios.get(url, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Business Liabilities Load Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business liabilities'));
  }
};

export const fetchBusinessLiabilityById = async (liabilityId, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const response = await axios.get(
      `${BASE_URL}/api/business-liabilities/${liabilityId}`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Business Liability Detail Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business liability'));
  }
};

export const createBusinessLiability = async (liabilityData, options = {}) => {
  try {
    const payload = withBusinessValueModuleScope(
      normalizeLiabilityPayload(liabilityData),
      options.moduleScope || liabilityData?.moduleScope
    );

    const response = await axios.post(
      `${BASE_URL}/api/business-liabilities`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Create Business Liability Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to create business liability'));
  }
};

export const updateBusinessLiability = async (liabilityId, liabilityData, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const payload = withBusinessValueModuleScope(
      normalizeLiabilityPayload(liabilityData),
      options.moduleScope || liabilityData?.moduleScope
    );

    const response = await axios.put(
      `${BASE_URL}/api/business-liabilities/${liabilityId}`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Update Business Liability Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to update business liability'));
  }
};

export const deleteBusinessLiability = async (liabilityId, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const response = await axios.delete(
      `${BASE_URL}/api/business-liabilities/${liabilityId}`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Delete Business Liability Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to delete business liability'));
  }
};

export const restoreBusinessLiability = async (liabilityId, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const response = await axios.patch(
      `${BASE_URL}/api/business-liabilities/${liabilityId}/restore`,
      {},
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Restore Business Liability Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to restore business liability'));
  }
};

export const payBusinessLiability = async (liabilityId, paymentData, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const payload = withBusinessValueModuleScope(
      normalizeLiabilityPaymentPayload(paymentData),
      options.moduleScope || paymentData?.moduleScope
    );

    const response = await axios.post(
      `${BASE_URL}/api/business-liabilities/${liabilityId}/payments`,
      payload,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Business Liability Payment Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to record liability payment'));
  }
};

export const fetchLiabilityPaymentHistory = async (liabilityId, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    const response = await axios.get(
      `${BASE_URL}/api/business-liabilities/${liabilityId}/payments`,
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Business Liability Payment History Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load liability payment history'));
  }
};

export const reverseLiabilityPayment = async (liabilityId, paymentId, options = {}) => {
  try {
    if (!liabilityId) {
      throw new Error('Liability ID is required');
    }

    if (!paymentId) {
      throw new Error('Payment ID is required');
    }

    const response = await axios.patch(
      `${BASE_URL}/api/business-liabilities/${liabilityId}/payments/${paymentId}/reverse`,
      {},
      {
        ...getAuthConfig(),
        params: getBusinessValueModuleScopeParams(options.moduleScope),
      }
    );

    return response.data;
  } catch (error) {
    console.error('Reverse Business Liability Payment Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to reverse liability payment'));
  }
};

export const getEmptyBusinessLiability = () => {
  return {
    title: '',
    category: 'other',
    originalAmount: 0,
    remainingAmount: '',
    startDate: '',
    notes: '',
    status: 'active',
  };
};

export const calculatePaidLiabilityAmount = (liability = {}) => {
  const originalAmount = Number(liability.originalAmount || 0);

  const remainingAmount = Number(liability.remainingAmount || 0);

  return Math.max(originalAmount - remainingAmount, 0);
};

export const calculateLiabilityProgress = (liability = {}) => {
  const originalAmount = Number(liability.originalAmount || 0);

  const remainingAmount = Number(liability.remainingAmount || 0);

  if (originalAmount <= 0) {
    return 0;
  }

  const paidAmount = Math.max(originalAmount - remainingAmount, 0);

  return Math.min(Math.max((paidAmount / originalAmount) * 100, 0), 100);
};

export const formatLiabilityAmount = (value) => {
  return Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const BUSINESS_LIABILITY_STATUS = {
  ACTIVE: 'active',
  CLOSED: 'closed',
};

export const BUSINESS_LIABILITY_CATEGORIES = {
  LOAN: 'loan',
  BANK_LOAN: 'bank_loan',
  SUPPLIER: 'supplier',
  CREDIT: 'credit',
  TAX: 'tax',
  OTHER: 'other',
};

const businessLiabilityService = {
  fetchLiabilityTitles,
  fetchBusinessLiabilities,
  fetchBusinessLiabilityById,
  createBusinessLiability,
  updateBusinessLiability,
  deleteBusinessLiability,
  restoreBusinessLiability,

  payBusinessLiability,
  fetchLiabilityPaymentHistory,
  reverseLiabilityPayment,

  getEmptyBusinessLiability,
  calculatePaidLiabilityAmount,
  calculateLiabilityProgress,
  formatLiabilityAmount,

  BUSINESS_LIABILITY_STATUS,
  BUSINESS_LIABILITY_CATEGORIES,
};

export default businessLiabilityService;
