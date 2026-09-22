const { MODULE_SCOPES } = require("./moduleScope");

const EXPENSE_TITLE_SCOPES = Object.freeze([
  MODULE_SCOPES.TRADING,
  MODULE_SCOPES.TRAVEL,
  MODULE_SCOPES.WEAVING,
  MODULE_SCOPES.BOTH,
]);

const normalizeExpenseTitleScope = (
  value,
  fallback = MODULE_SCOPES.TRADING,
) => {
  const cleanValue = String(value || "").trim().toLowerCase();

  if (EXPENSE_TITLE_SCOPES.includes(cleanValue)) {
    return cleanValue;
  }

  return EXPENSE_TITLE_SCOPES.includes(fallback)
    ? fallback
    : MODULE_SCOPES.TRADING;
};

const buildExpenseTitleScopeFilter = (
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const cleanScope = String(scope || "").trim().toLowerCase();

  if (cleanScope === "all") {
    return {};
  }

  const normalizedScope = normalizeExpenseTitleScope(scope);

  if (normalizedScope === MODULE_SCOPES.WEAVING) {
    return { [field]: MODULE_SCOPES.WEAVING };
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
      $or: [
        { [field]: { $exists: false } },
        { [field]: null },
        { [field]: "" },
        { [field]: MODULE_SCOPES.BOTH },
      ],
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

const applyExpenseTitleScopeFilter = (
  query,
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const filter = buildExpenseTitleScopeFilter(scope, field);

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

const documentMatchesExpenseTitleScope = (
  document,
  scope = MODULE_SCOPES.TRADING,
  field = "moduleScope",
) => {
  const cleanScope = String(scope || "").trim().toLowerCase();

  if (cleanScope === "all") {
    return true;
  }

  const normalizedScope = normalizeExpenseTitleScope(scope);
  const documentScope = String(document?.[field] || "")
    .trim()
    .toLowerCase();
  const safeDocumentScope = documentScope || MODULE_SCOPES.BOTH;

  if (normalizedScope === MODULE_SCOPES.WEAVING) {
    return safeDocumentScope === MODULE_SCOPES.WEAVING;
  }

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
  EXPENSE_TITLE_SCOPES,
  applyExpenseTitleScopeFilter,
  buildExpenseTitleScopeFilter,
  documentMatchesExpenseTitleScope,
  normalizeExpenseTitleScope,
};
