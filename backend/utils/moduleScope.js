const MODULE_SCOPES = Object.freeze({
  TRADING: "trading",
  TRAVEL: "travel",
  BOTH: "both",
});

const MODULE_SCOPE_VALUES = Object.freeze(Object.values(MODULE_SCOPES));

const normalizeModuleScope = (
  value,
  fallback = MODULE_SCOPES.TRADING,
) => {
  const cleanValue = String(value || "").trim().toLowerCase();

  if (MODULE_SCOPE_VALUES.includes(cleanValue)) {
    return cleanValue;
  }

  return MODULE_SCOPE_VALUES.includes(fallback) ? fallback : MODULE_SCOPES.TRADING;
};

const getRequestedModuleScope = (source = {}, fallback = MODULE_SCOPES.TRADING) => {
  if (source.forTravel === "true" || source.travel === "true") {
    return MODULE_SCOPES.TRAVEL;
  }

  const requested = source.moduleScope || source.scope || source.module || "";

  if (String(requested || "").trim().toLowerCase() === "all") {
    return "all";
  }

  return normalizeModuleScope(requested, fallback);
};

const buildModuleScopeFilter = (
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const normalizedScope =
    String(scope || "").trim().toLowerCase() === "all"
      ? "all"
      : normalizeModuleScope(scope);

  if (normalizedScope === "all") {
    return {};
  }

  if (normalizedScope === MODULE_SCOPES.TRAVEL) {
    return {
      [field]: {
        $in: [MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH],
      },
    };
  }

  if (normalizedScope === MODULE_SCOPES.BOTH) {
    return {
      [field]: MODULE_SCOPES.BOTH,
    };
  }

  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: "" },
      { [field]: { $in: [MODULE_SCOPES.TRADING, MODULE_SCOPES.BOTH] } },
    ],
  };
};

const buildMissingScopeFilter = (field = "moduleScope") => ({
  $or: [
    { [field]: { $exists: false } },
    { [field]: null },
    { [field]: "" },
  ],
});

const buildSupplierModuleScopeFilter = (
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
  travelFlagField = "isTravelVendor",
) => {
  const normalizedScope =
    String(scope || "").trim().toLowerCase() === "all"
      ? "all"
      : normalizeModuleScope(scope);

  if (normalizedScope === "all") {
    return {};
  }

  if (normalizedScope === MODULE_SCOPES.TRAVEL) {
    return {
      $or: [
        { [field]: { $in: [MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH] } },
        {
          $and: [
            { [travelFlagField]: true },
            buildMissingScopeFilter(field),
          ],
        },
      ],
    };
  }

  if (normalizedScope === MODULE_SCOPES.BOTH) {
    return {
      [field]: MODULE_SCOPES.BOTH,
    };
  }

  return {
    $or: [
      { [field]: { $in: [MODULE_SCOPES.TRADING, MODULE_SCOPES.BOTH] } },
      {
        $and: [
          { [travelFlagField]: { $ne: true } },
          buildMissingScopeFilter(field),
        ],
      },
    ],
  };
};

const applyModuleScopeFilter = (
  query,
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const filter = buildModuleScopeFilter(scope, field);

  if (!filter || Object.keys(filter).length === 0) {
    return query;
  }

  if (filter.$or) {
    query.$and = [...(query.$and || []), filter];

    return query;
  }

  Object.assign(query, filter);

  return query;
};

const applySupplierModuleScopeFilter = (
  query,
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
  travelFlagField = "isTravelVendor",
) => {
  const filter = buildSupplierModuleScopeFilter(scope, field, travelFlagField);

  if (!filter || Object.keys(filter).length === 0) {
    return query;
  }

  if (filter.$or) {
    query.$and = [...(query.$and || []), filter];

    return query;
  }

  Object.assign(query, filter);

  return query;
};

const documentMatchesModuleScope = (
  document,
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const normalizedScope =
    String(scope || "").trim().toLowerCase() === "all"
      ? "all"
      : normalizeModuleScope(scope);

  if (normalizedScope === "all") {
    return true;
  }

  const documentScope = String(document?.[field] || "").trim().toLowerCase();
  const safeDocumentScope = documentScope || MODULE_SCOPES.TRADING;

  if (normalizedScope === MODULE_SCOPES.TRAVEL) {
    return [MODULE_SCOPES.TRAVEL, MODULE_SCOPES.BOTH].includes(
      safeDocumentScope,
    );
  }

  if (normalizedScope === MODULE_SCOPES.BOTH) {
    return safeDocumentScope === MODULE_SCOPES.BOTH;
  }

  return [MODULE_SCOPES.TRADING, MODULE_SCOPES.BOTH].includes(
    safeDocumentScope,
  );
};

module.exports = {
  MODULE_SCOPES,
  MODULE_SCOPE_VALUES,
  applyModuleScopeFilter,
  applySupplierModuleScopeFilter,
  buildModuleScopeFilter,
  buildSupplierModuleScopeFilter,
  documentMatchesModuleScope,
  getRequestedModuleScope,
  normalizeModuleScope,
};
