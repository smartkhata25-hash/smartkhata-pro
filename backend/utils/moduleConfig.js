const MODULE_KEYS = Object.freeze({
  TRADING: "trading",
  TRAVEL: "travel",
});

const DEFAULT_ENABLED_MODULES = Object.freeze({
  [MODULE_KEYS.TRADING]: true,
  [MODULE_KEYS.TRAVEL]: false,
});

const DEFAULT_MODULE = MODULE_KEYS.TRADING;
const KNOWN_MODULES = Object.freeze(Object.values(MODULE_KEYS));

const toPlainObject = (value = {}) => {
  if (!value || typeof value !== "object") return {};
  if (typeof value.toObject === "function") return value.toObject();
  return value;
};

const normalizeEnabledModules = (enabledModules = {}) => {
  const source = toPlainObject(enabledModules);
  const normalized = { ...DEFAULT_ENABLED_MODULES };

  KNOWN_MODULES.forEach((moduleKey) => {
    if (typeof source[moduleKey] === "boolean") {
      normalized[moduleKey] = source[moduleKey];
    }
  });

  if (!Object.values(normalized).some(Boolean)) {
    normalized[MODULE_KEYS.TRADING] = true;
  }

  return normalized;
};

const normalizeDefaultModule = (defaultModule, enabledModules = {}) => {
  const normalizedModules = normalizeEnabledModules(enabledModules);

  if (KNOWN_MODULES.includes(defaultModule) && normalizedModules[defaultModule]) {
    return defaultModule;
  }

  return KNOWN_MODULES.find((moduleKey) => normalizedModules[moduleKey]) || DEFAULT_MODULE;
};

const normalizeModuleConfig = (config = {}) => {
  const source = toPlainObject(config);
  const enabledModules = normalizeEnabledModules(source.enabledModules || source);

  return {
    enabledModules,
    defaultModule: normalizeDefaultModule(source.defaultModule, enabledModules),
  };
};

const isModuleEnabled = (config = {}, moduleKey) => {
  if (!KNOWN_MODULES.includes(moduleKey)) return false;

  return Boolean(normalizeModuleConfig(config).enabledModules[moduleKey]);
};

module.exports = {
  MODULE_KEYS,
  DEFAULT_ENABLED_MODULES,
  DEFAULT_MODULE,
  KNOWN_MODULES,
  normalizeEnabledModules,
  normalizeDefaultModule,
  normalizeModuleConfig,
  isModuleEnabled,
};
