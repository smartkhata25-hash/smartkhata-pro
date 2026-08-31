import axios from 'axios';

import {
  BUSINESS_VALUE_MODULE_SCOPES,
  appendBusinessValueModuleScopeParam,
} from './businessValueModuleScope';

export { BUSINESS_VALUE_MODULE_SCOPES } from './businessValueModuleScope';

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

export const fetchBusinessValueOptions = async ({ moduleScope } = {}) => {
  try {
    const params = new URLSearchParams();

    appendBusinessValueModuleScopeParam(params, moduleScope);

    const queryString = params.toString();

    const response = await axios.get(
      queryString
        ? `${BASE_URL}/api/business-value/options?${queryString}`
        : `${BASE_URL}/api/business-value/options`,
      getAuthConfig()
    );

    return response.data;
  } catch (error) {
    console.error('Business Value Options Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to load business value options'));
  }
};

export const fetchBusinessValue = async ({
  preset = 'complete',
  components = [],
  moduleScope,
} = {}) => {
  try {
    const params = new URLSearchParams();

    if (preset) {
      params.append('preset', preset);
    }

    if (Array.isArray(components) && components.length > 0) {
      params.append('components', components.join(','));
    }

    appendBusinessValueModuleScopeParam(params, moduleScope);

    const queryString = params.toString();

    const url = queryString
      ? `${BASE_URL}/api/business-value?${queryString}`
      : `${BASE_URL}/api/business-value`;

    const response = await axios.get(url, getAuthConfig());

    return response.data;
  } catch (error) {
    console.error('Business Value Summary Error:', error);

    throw new Error(getErrorMessage(error, 'Failed to calculate business value'));
  }
};

export const BUSINESS_VALUE_PRESETS = {
  STOCK_ASSETS: 'stock_assets',
  OPERATIONAL: 'operational',
  COMPLETE: 'complete',
  CUSTOM: 'custom',
};

export const BUSINESS_VALUE_COMPONENTS = {
  INVENTORY: 'inventory',
  ASSETS: 'assets',
  CASH: 'cash',
  BANK: 'bank',
  RECEIVABLES: 'receivables',
  LOAN_RECEIVABLES: 'loan_receivables',
  PAYABLES: 'payables',
  LIABILITIES: 'liabilities',
};

export const DEFAULT_COMPLETE_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.INVENTORY,
  BUSINESS_VALUE_COMPONENTS.ASSETS,
  BUSINESS_VALUE_COMPONENTS.CASH,
  BUSINESS_VALUE_COMPONENTS.BANK,
  BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.PAYABLES,
  BUSINESS_VALUE_COMPONENTS.LIABILITIES,
];

export const TRAVEL_DEFAULT_COMPLETE_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.ASSETS,
  BUSINESS_VALUE_COMPONENTS.CASH,
  BUSINESS_VALUE_COMPONENTS.BANK,
  BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.LOAN_RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.PAYABLES,
  BUSINESS_VALUE_COMPONENTS.LIABILITIES,
];

export const DEFAULT_STOCK_ASSET_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.INVENTORY,
  BUSINESS_VALUE_COMPONENTS.ASSETS,
];

export const TRAVEL_DEFAULT_STOCK_ASSET_COMPONENTS = [BUSINESS_VALUE_COMPONENTS.ASSETS];

export const DEFAULT_OPERATIONAL_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.INVENTORY,
  BUSINESS_VALUE_COMPONENTS.ASSETS,
  BUSINESS_VALUE_COMPONENTS.CASH,
  BUSINESS_VALUE_COMPONENTS.BANK,
  BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.PAYABLES,
];

export const TRAVEL_DEFAULT_OPERATIONAL_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.ASSETS,
  BUSINESS_VALUE_COMPONENTS.CASH,
  BUSINESS_VALUE_COMPONENTS.BANK,
  BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.LOAN_RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.PAYABLES,
];

export const TRAVEL_BUSINESS_VALUE_COMPONENTS = [
  BUSINESS_VALUE_COMPONENTS.ASSETS,
  BUSINESS_VALUE_COMPONENTS.CASH,
  BUSINESS_VALUE_COMPONENTS.BANK,
  BUSINESS_VALUE_COMPONENTS.RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.LOAN_RECEIVABLES,
  BUSINESS_VALUE_COMPONENTS.PAYABLES,
  BUSINESS_VALUE_COMPONENTS.LIABILITIES,
];

export const getPresetComponents = (preset, { moduleScope } = {}) => {
  const isTravelScope = moduleScope === BUSINESS_VALUE_MODULE_SCOPES.TRAVEL;

  if (preset === BUSINESS_VALUE_PRESETS.STOCK_ASSETS) {
    return [
      ...(isTravelScope
        ? TRAVEL_DEFAULT_STOCK_ASSET_COMPONENTS
        : DEFAULT_STOCK_ASSET_COMPONENTS),
    ];
  }

  if (preset === BUSINESS_VALUE_PRESETS.OPERATIONAL) {
    return [
      ...(isTravelScope
        ? TRAVEL_DEFAULT_OPERATIONAL_COMPONENTS
        : DEFAULT_OPERATIONAL_COMPONENTS),
    ];
  }

  if (preset === BUSINESS_VALUE_PRESETS.COMPLETE) {
    return [
      ...(isTravelScope
        ? TRAVEL_DEFAULT_COMPLETE_COMPONENTS
        : DEFAULT_COMPLETE_COMPONENTS),
    ];
  }

  return [];
};

export const formatBusinessValueAmount = (value) => {
  const safeValue = Number(value || 0);

  return safeValue.toLocaleString('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
};

export const getComponentValue = (businessValueData, componentKey) => {
  return Number(businessValueData?.components?.[componentKey]?.value || 0);
};

export const isComponentIncluded = (businessValueData, componentKey) => {
  return Boolean(businessValueData?.components?.[componentKey]?.included);
};

const businessValueService = {
  fetchBusinessValueOptions,
  fetchBusinessValue,
  getPresetComponents,
  formatBusinessValueAmount,
  getComponentValue,
  isComponentIncluded,
  BUSINESS_VALUE_PRESETS,
  BUSINESS_VALUE_COMPONENTS,
  BUSINESS_VALUE_MODULE_SCOPES,
  DEFAULT_COMPLETE_COMPONENTS,
  DEFAULT_STOCK_ASSET_COMPONENTS,
  DEFAULT_OPERATIONAL_COMPONENTS,
  TRAVEL_BUSINESS_VALUE_COMPONENTS,
  TRAVEL_DEFAULT_COMPLETE_COMPONENTS,
  TRAVEL_DEFAULT_OPERATIONAL_COMPONENTS,
  TRAVEL_DEFAULT_STOCK_ASSET_COMPONENTS,
};

export default businessValueService;
