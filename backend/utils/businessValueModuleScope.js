const { MODULE_SCOPES } = require("./moduleScope");

const BUSINESS_VALUE_MODULE_SCOPES = Object.freeze([
  MODULE_SCOPES.TRADING,
  MODULE_SCOPES.TRAVEL,
]);

const TRAVEL_BUSINESS_VALUE_ORIGINS = Object.freeze({
  LIABILITY_PAYMENT: "travel_business_liability_payment",
  LIABILITY_PAYMENT_REVERSAL: "travel_business_liability_payment_reversal",
  RECEIVABLE_LOAN: "travel_business_receivable_loan",
  RECEIVABLE_LOAN_REVERSAL: "travel_business_receivable_loan_reversal",
  RECEIVABLE_LOAN_PAYMENT: "travel_business_receivable_loan_payment",
  RECEIVABLE_LOAN_PAYMENT_REVERSAL:
    "travel_business_receivable_loan_payment_reversal",
});

const TRAVEL_BUSINESS_VALUE_FORWARD_ORIGINS = Object.freeze([
  TRAVEL_BUSINESS_VALUE_ORIGINS.LIABILITY_PAYMENT,
  TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN,
  TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_PAYMENT,
]);

const TRAVEL_BUSINESS_VALUE_REVERSAL_ORIGINS = Object.freeze([
  TRAVEL_BUSINESS_VALUE_ORIGINS.LIABILITY_PAYMENT_REVERSAL,
  TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_REVERSAL,
  TRAVEL_BUSINESS_VALUE_ORIGINS.RECEIVABLE_LOAN_PAYMENT_REVERSAL,
]);

const TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS = Object.freeze([
  ...TRAVEL_BUSINESS_VALUE_FORWARD_ORIGINS,
  ...TRAVEL_BUSINESS_VALUE_REVERSAL_ORIGINS,
]);

const createScopeError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const resolveBusinessValueModuleScope = (
  source = {},
  fallback = MODULE_SCOPES.TRADING,
) => {
  const requested =
    source.moduleScope ?? source.scope ?? source.module ?? source.moduleKey;

  if (
    requested === undefined ||
    requested === null ||
    String(requested).trim() === ""
  ) {
    return BUSINESS_VALUE_MODULE_SCOPES.includes(fallback)
      ? fallback
      : MODULE_SCOPES.TRADING;
  }

  const normalized = String(requested).trim().toLowerCase();

  if (BUSINESS_VALUE_MODULE_SCOPES.includes(normalized)) {
    return normalized;
  }

  throw createScopeError("Invalid business value module scope");
};

const getBusinessValueModuleScope = (req) =>
  resolveBusinessValueModuleScope({
    ...(req.query || {}),
    ...(req.body || {}),
  });

const assertBusinessValueScopeEnabled = (req, moduleScope) => {
  const enabledModules = req.user?.enabledModules || {};

  const enabled =
    moduleScope === MODULE_SCOPES.TRADING
      ? enabledModules[MODULE_SCOPES.TRADING] !== false
      : enabledModules[MODULE_SCOPES.TRAVEL] === true;

  if (!enabled) {
    throw createScopeError("This business module is not enabled", 403);
  }
};

const requireBusinessValueModuleScope = (req) => {
  const moduleScope = getBusinessValueModuleScope(req);

  assertBusinessValueScopeEnabled(req, moduleScope);

  return moduleScope;
};

const buildBusinessValueScopeFilter = (
  moduleScope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  if (moduleScope === MODULE_SCOPES.TRAVEL) {
    return {
      [field]: MODULE_SCOPES.TRAVEL,
    };
  }

  return {
    $or: [
      { [field]: MODULE_SCOPES.TRADING },
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: "" },
    ],
  };
};

const applyBusinessValueScopeFilter = (
  query,
  moduleScope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const scopeFilter = buildBusinessValueScopeFilter(moduleScope, field);

  if (scopeFilter.$or || query.$or) {
    query.$and = [...(query.$and || []), scopeFilter];

    return query;
  }

  Object.assign(query, scopeFilter);

  return query;
};

const getScopedBusinessValueOrigin = (baseOrigin, moduleScope) =>
  moduleScope === MODULE_SCOPES.TRAVEL ? `travel_${baseOrigin}` : baseOrigin;

const getScopedBusinessValueAccountConfig = (baseConfig, moduleScope) => {
  if (moduleScope !== MODULE_SCOPES.TRAVEL) {
    return {
      ...baseConfig,
      moduleScope: MODULE_SCOPES.TRADING,
    };
  }

  return {
    ...baseConfig,
    name: `Travel ${baseConfig.name}`,
    code: `TRAVEL_${baseConfig.code}`,
    moduleScope: MODULE_SCOPES.TRAVEL,
  };
};

const getControllerStatusCode = (error) =>
  Number(error?.statusCode || error?.status || 500);

module.exports = {
  BUSINESS_VALUE_MODULE_SCOPES,
  TRAVEL_BUSINESS_VALUE_ACCOUNT_ORIGINS,
  TRAVEL_BUSINESS_VALUE_FORWARD_ORIGINS,
  TRAVEL_BUSINESS_VALUE_ORIGINS,
  TRAVEL_BUSINESS_VALUE_REVERSAL_ORIGINS,
  applyBusinessValueScopeFilter,
  assertBusinessValueScopeEnabled,
  buildBusinessValueScopeFilter,
  createScopeError,
  getBusinessValueModuleScope,
  getControllerStatusCode,
  getScopedBusinessValueAccountConfig,
  getScopedBusinessValueOrigin,
  requireBusinessValueModuleScope,
  resolveBusinessValueModuleScope,
};
