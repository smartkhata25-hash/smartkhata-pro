export const BUSINESS_VALUE_MODULE_SCOPES = Object.freeze({
  TRADING: 'trading',
  TRAVEL: 'travel',
});

export const normalizeBusinessValueModuleScope = (moduleScope = '') => {
  const cleanScope = String(moduleScope || '').trim().toLowerCase();

  return Object.values(BUSINESS_VALUE_MODULE_SCOPES).includes(cleanScope) ? cleanScope : '';
};

export const appendBusinessValueModuleScopeParam = (params, moduleScope) => {
  const cleanScope = normalizeBusinessValueModuleScope(moduleScope);

  if (cleanScope === BUSINESS_VALUE_MODULE_SCOPES.TRAVEL) {
    params.append('moduleScope', cleanScope);
  }

  return params;
};

export const getBusinessValueModuleScopeParams = (moduleScope) => {
  const cleanScope = normalizeBusinessValueModuleScope(moduleScope);

  return cleanScope === BUSINESS_VALUE_MODULE_SCOPES.TRAVEL
    ? {
        moduleScope: cleanScope,
      }
    : {};
};

export const withBusinessValueModuleScope = (payload = {}, moduleScope) => {
  const cleanScope = normalizeBusinessValueModuleScope(moduleScope);

  return cleanScope === BUSINESS_VALUE_MODULE_SCOPES.TRAVEL
    ? {
        ...payload,
        moduleScope: cleanScope,
      }
    : payload;
};
