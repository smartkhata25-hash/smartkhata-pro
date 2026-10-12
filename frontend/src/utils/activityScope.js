import { normalizeModuleConfig } from './moduleConfig';

export const getEnabledActivityScopes = (user = {}) => {
  const { enabledModules } = normalizeModuleConfig(user);
  return ['trading', 'travel', 'weaving'].filter((scope) => enabledModules[scope]);
};

export const resolveActivityScope = (user = {}, location = {}) => {
  const moduleConfig = normalizeModuleConfig(user);
  const enabledScopes = getEnabledActivityScopes(moduleConfig);
  const pathScope = String(location.pathname || '').startsWith('/travel')
    ? 'travel'
    : String(location.pathname || '').startsWith('/weaving')
      ? 'weaving'
      : location.state?.moduleScope;

  if (enabledScopes.includes(pathScope)) return pathScope;
  if (enabledScopes.length === 1) return enabledScopes[0];
  return moduleConfig.defaultModule;
};

export const getActivityScopeOptions = (user = {}) => {
  const enabledScopes = getEnabledActivityScopes(user);
  return enabledScopes.length > 1 ? ['all', ...enabledScopes] : enabledScopes;
};
