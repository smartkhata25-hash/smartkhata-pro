export const MODULE_KEYS = Object.freeze({
  TRADING: 'trading',
  TRAVEL: 'travel',
});

export const DEFAULT_ENABLED_MODULES = Object.freeze({
  [MODULE_KEYS.TRADING]: true,
  [MODULE_KEYS.TRAVEL]: false,
});

export const DEFAULT_MODULE = MODULE_KEYS.TRADING;
export const KNOWN_MODULES = Object.freeze(Object.values(MODULE_KEYS));

export const normalizeEnabledModules = (enabledModules = {}) => {
  const source =
    enabledModules && typeof enabledModules === 'object' ? enabledModules : {};

  const normalized = { ...DEFAULT_ENABLED_MODULES };

  KNOWN_MODULES.forEach((moduleKey) => {
    if (typeof source[moduleKey] === 'boolean') {
      normalized[moduleKey] = source[moduleKey];
    }
  });

  if (!Object.values(normalized).some(Boolean)) {
    normalized[MODULE_KEYS.TRADING] = true;
  }

  return normalized;
};

export const normalizeDefaultModule = (defaultModule, enabledModules = {}) => {
  const normalizedModules = normalizeEnabledModules(enabledModules);

  if (KNOWN_MODULES.includes(defaultModule) && normalizedModules[defaultModule]) {
    return defaultModule;
  }

  return KNOWN_MODULES.find((moduleKey) => normalizedModules[moduleKey]) || DEFAULT_MODULE;
};

export const normalizeModuleConfig = (config = {}) => {
  const source = config && typeof config === 'object' ? config : {};
  const enabledModules = normalizeEnabledModules(source.enabledModules || source);

  return {
    enabledModules,
    defaultModule: normalizeDefaultModule(source.defaultModule, enabledModules),
  };
};

export const isModuleEnabled = (config = {}, moduleKey) => {
  if (!KNOWN_MODULES.includes(moduleKey)) return false;

  return Boolean(normalizeModuleConfig(config).enabledModules[moduleKey]);
};
