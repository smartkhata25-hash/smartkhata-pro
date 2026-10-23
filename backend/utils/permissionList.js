const PERMISSIONS = {
  DASHBOARD: {
    SUMMARY_CARDS: "dashboard.summary_cards",
    RIGHT_PANEL: "dashboard.right_panel",
  },

  SALES: {
    VIEW: "sales.view",
    CREATE: "sales.create",
    EDIT: "sales.edit",
    DELETE: "sales.delete",
    PRINT: "sales.print",
    RECEIVE_PAYMENT: "sales.receive_payment",
  },

  REFUNDS: {
    VIEW: "refunds.view",
    CREATE: "refunds.create",
    EDIT: "refunds.edit",
    DELETE: "refunds.delete",
  },

  PURCHASES: {
    VIEW: "purchases.view",
    CREATE: "purchases.create",
    EDIT: "purchases.edit",
    DELETE: "purchases.delete",
    PAY_BILL: "purchases.pay_bill",
  },

  PURCHASE_RETURNS: {
    VIEW: "purchase_returns.view",
    CREATE: "purchase_returns.create",
    EDIT: "purchase_returns.edit",
    DELETE: "purchase_returns.delete",
  },

  RECEIVE_PAYMENTS: {
    VIEW: "receive_payments.view",
    CREATE: "receive_payments.create",
    EDIT: "receive_payments.edit",
    DELETE: "receive_payments.delete",
  },

  PAY_BILLS: {
    VIEW: "pay_bills.view",
    CREATE: "pay_bills.create",
    EDIT: "pay_bills.edit",
    DELETE: "pay_bills.delete",
  },

  PRODUCTS: {
    VIEW: "products.view",
    CREATE: "products.create",
    EDIT: "products.edit",
    DELETE: "products.delete",
    VIEW_COST: "products.view_cost",
    BULK_CREATE: "products.bulk_create",
  },

  INVENTORY: {
    VIEW: "inventory.view",
    ADJUST: "inventory.adjust",
    VIEW_HISTORY: "inventory.view_history",
    DELETE_TRANSACTION: "inventory.delete_transaction",
    MANAGE_CATEGORIES: "inventory.manage_categories",
  },

  CUSTOMERS: {
    VIEW: "customers.view",
    CREATE: "customers.create",
    EDIT: "customers.edit",
    DELETE: "customers.delete",
    RESTORE: "customers.restore",
    MERGE: "customers.merge",
    CONVERT: "customers.convert",
    VIEW_LEDGER: "customers.view_ledger",
  },

  SUPPLIERS: {
    VIEW: "suppliers.view",
    CREATE: "suppliers.create",
    EDIT: "suppliers.edit",
    DELETE: "suppliers.delete",
    RESTORE: "suppliers.restore",
    MERGE: "suppliers.merge",
    CONVERT: "suppliers.convert",
    IMPORT: "suppliers.import",
    VIEW_LEDGER: "suppliers.view_ledger",
  },

  PARTIES: {
    VIEW: "parties.view",
    CREATE: "parties.create",
    EDIT: "parties.edit",
    DELETE: "parties.delete",
    RESTORE: "parties.restore",
    MERGE: "parties.merge",
    CONVERT: "parties.convert",
    VIEW_LEDGER: "parties.view_ledger",
  },

  EMPLOYEES: {
    VIEW: "employees.view",
    CREATE: "employees.create",
    EDIT: "employees.edit",
    DELETE: "employees.delete",
    VIEW_LEDGER: "employees.view_ledger",
  },

  PAYROLL: {
    VIEW: "payroll.view",
    CREATE: "payroll.create",
    EDIT: "payroll.edit",
    DELETE: "payroll.delete",
    PAY: "payroll.pay",
    PRINT: "payroll.print",
  },

  EXPENSES: {
    VIEW: "expenses.view",
    CREATE: "expenses.create",
    EDIT: "expenses.edit",
    DELETE: "expenses.delete",
    MANAGE_TITLES: "expenses.manage_titles",
  },

  ACCOUNTS: {
    VIEW: "accounts.view",
    CREATE: "accounts.create",
    EDIT: "accounts.edit",
    DELETE: "accounts.delete",
    VIEW_TRANSACTIONS: "accounts.view_transactions",
  },

  JOURNAL: {
    VIEW: "journal.view",
    CREATE: "journal.create",
    EDIT: "journal.edit",
    DELETE: "journal.delete",
  },

  TRAVEL: {
    VIEW: "travel.view",
    CUSTOMERS: "travel.customers",
    PARTIES_VIEW: "travel.parties.view",
    PARTIES_MANAGE: "travel.parties.manage",
    TRAVELERS_VIEW: "travel.travelers.view",
    TRAVELERS_MANAGE: "travel.travelers.manage",
    SERVICES_VIEW: "travel.services.view",
    SERVICES_MANAGE: "travel.services.manage",
    HOTELS_VIEW: "travel.hotels.view",
    HOTELS_MANAGE: "travel.hotels.manage",
    AIRLINES_VIEW: "travel.airlines.view",
    AIRLINES_MANAGE: "travel.airlines.manage",
    AIRPORTS_VIEW: "travel.airports.view",
    AIRPORTS_MANAGE: "travel.airports.manage",
    VENDORS_VIEW: "travel.vendors.view",
    VENDORS_MANAGE: "travel.vendors.manage",
    BOOKINGS_VIEW: "travel.bookings.view",
    BOOKINGS_CREATE: "travel.bookings.create",
    BOOKINGS_EDIT: "travel.bookings.edit",
    BOOKINGS_CANCEL: "travel.bookings.cancel",
    BOOKINGS: "travel.bookings",
    GROUPS: "travel.groups",
    HOTELS: "travel.hotels",
    VENDORS: "travel.vendors",
    DOCUMENTS: "travel.documents",
    PAYMENTS: "travel.payments",
    REPORTS: "travel.reports",
    SETTINGS: "travel.settings",
  },

  WEAVING: {
    VIEW: "weaving.view",
  },

  INSTALLMENTS: {
    VIEW: "installments.view",
  },

  INSTALLMENTS_MEMBERS: {
    VIEW: "installments.members.view",
    CREATE: "installments.members.create",
    EDIT: "installments.members.edit",
    DELETE: "installments.members.delete",
    RESTORE: "installments.members.restore",
    VIEW_LEDGER: "installments.members.view_ledger",
  },

  INSTALLMENTS_SUPPLIERS: {
    VIEW: "installments.suppliers.view",
    CREATE: "installments.suppliers.create",
    EDIT: "installments.suppliers.edit",
    ARCHIVE: "installments.suppliers.archive",
    RESTORE: "installments.suppliers.restore",
    VIEW_LEDGER: "installments.suppliers.ledger.view",
    MANAGE_OPENING: "installments.suppliers.opening.manage",
  },

  INSTALLMENTS_INVOICES: {
    VIEW: "installments.invoices.view", CREATE: "installments.invoices.create", EDIT: "installments.invoices.edit", POST: "installments.invoices.post",
    VIEW_COST: "installments.invoices.view_cost", RECEIVE_PAYMENT: "installments.invoices.receive_payment", PAY_SUPPLIER: "installments.invoices.pay_supplier", PRINT: "installments.invoices.print",
  },

  INSTALLMENTS_PRODUCTS: { MANAGE: "installments.products.manage" },
  INSTALLMENTS_ACCOUNTS: {
    VIEW: "installments.accounts.view", VIEW_TRANSACTIONS: "installments.accounts.view_transactions",
    CREATE: "installments.accounts.create", EDIT: "installments.accounts.edit", MANAGE: "installments.accounts.manage",
    TRANSFER: "installments.accounts.transfer", ADJUST: "installments.accounts.adjust", REVERSE: "installments.accounts.reverse",
  },

  INSTALLMENTS_PAYMENTS: {
    VIEW_COLLECTIONS: "installments.payments.view_collections",
    RECEIVE: "installments.payments.receive",
    VIEW_HISTORY: "installments.payments.view_history",
    PRINT: "installments.payments.print",
    WHATSAPP: "installments.payments.whatsapp",
    PAY_SUPPLIER: "installments.payments.pay_supplier",
    RETURN_SAVINGS: "installments.payments.return_savings",
    VIEW_BALANCES: "installments.payments.view_balances",
    REVERSE: "installments.payments.reverse",
    VIEW_COLLECTOR_SUMMARY: "installments.payments.view_collector_summary",
  },

  INSTALLMENTS_COMMITTEES: {
    MANAGE: "installments.committees.manage",
    VIEW: "installments.committees.view",
    CREATE: "installments.committees.create",
    EDIT: "installments.committees.edit",
    ARCHIVE: "installments.committees.archive",
    RESTORE: "installments.committees.restore",
    VIEW_SCHEDULE: "installments.committees.schedule.view",
  },

  INSTALLMENTS_OPENING_BALANCES: {
    MANAGE: "installments.opening_balances.manage",
  },

  INSTALLMENTS_EXPENSES: {
    VIEW: "installments.expenses.view",
    CREATE: "installments.expenses.create",
    EDIT: "installments.expenses.edit",
    ARCHIVE: "installments.expenses.archive",
    MANAGE_TITLES: "installments.expenses.manage_titles",
  },

  INSTALLMENTS_REPORTS: {
    PROFIT: "installments.reports.profit",
    COLLECTIONS: "installments.reports.collections",
    EXPENSES: "installments.reports.expenses",
    RECEIVABLES: "installments.reports.receivables",
    EXPORT: "installments.reports.export",
  },

  WEAVING_MASTERS: {
    VIEW: "weaving.masters.view",
    CREATE: "weaving.masters.create",
    EDIT: "weaving.masters.edit",
  },

  WEAVING_CONTRACTS: {
    VIEW: "weaving.contracts.view",
    CREATE: "weaving.contracts.create",
    EDIT: "weaving.contracts.edit",
  },

  WEAVING_SETTINGS: {
    MANAGE: "weaving.settings.manage",
  },

  WEAVING_COUNTERPARTIES: {
    VIEW: "weaving.counterparties.view",
    CREATE: "weaving.counterparties.create",
    EDIT: "weaving.counterparties.edit",
      VIEW_LEDGER: "weaving.counterparties.view_ledger",
      HIDE: "weaving.counterparties.hide",
      RESTORE: "weaving.counterparties.restore",
      MERGE: "weaving.counterparties.merge",
  },

  WEAVING_PURCHASES: {
    VIEW: "weaving.purchases.view",
    CREATE: "weaving.purchases.create",
    EDIT: "weaving.purchases.edit",
    VOID: "weaving.purchases.void",
  },

  WEAVING_PAYMENTS: {
    VIEW: "weaving.payments.view",
    CREATE: "weaving.payments.create",
    EDIT: "weaving.payments.edit",
    VOID: "weaving.payments.void",
  },

  WEAVING_SIZING: {
    VIEW: "weaving.sizing.view",
    ISSUE: "weaving.sizing.issue",
    RECEIVE: "weaving.sizing.receive",
    BILL: "weaving.sizing.bill",
    EDIT: "weaving.sizing.edit",
    VOID: "weaving.sizing.void",
    VIEW_MATERIAL_LEDGER: "weaving.sizing.view_material_ledger",
  },

  WEAVING_YARN_STOCK: {
    VIEW: "weaving.yarn_stock.view",
    TRANSFER: "weaving.yarn_stock.transfer",
    REWINDER_RECOVERY: "weaving.yarn_stock.rewinder_recovery",
    CONSUME: "weaving.yarn_stock.consume",
  },

  WEAVING_FOLDING: {
    VIEW: "weaving.folding.view",
    CREATE: "weaving.folding.create",
    EDIT: "weaving.folding.edit",
    VOID: "weaving.folding.void",
    PRINT: "weaving.folding.print",
  },

  WEAVING_FABRIC_STOCK: {
    VIEW: "weaving.fabric_stock.view",
    TRANSFER: "weaving.fabric_stock.transfer",
  },

  WEAVING_STOCK_ADJUSTMENT: {
    REVERSE: "weaving.stock_adjustment.reverse",
  },

  WEAVING_SALES: {
    VIEW: "weaving.sales.view",
    CREATE: "weaving.sales.create",
    EDIT: "weaving.sales.edit",
    POST: "weaving.sales.post",
    VOID: "weaving.sales.void",
    PRINT: "weaving.sales.print",
  },

  WEAVING_REJECTION_RETURN: {
    VIEW: "weaving.rejection_return.view",
    RECEIVE: "weaving.rejection_return.receive",
    REVERSE: "weaving.rejection_return.reverse",
  },

  WEAVING_REPORTS: {
    VIEW: "weaving.reports.view",
    PRODUCTION: "weaving.reports.production",
    STOCK: "weaving.reports.stock",
    SALES: "weaving.reports.sales",
    PROFIT: "weaving.reports.profit",
  },

  WEAVING_LOOMS: {
    VIEW_PERFORMANCE: "weaving.looms.view_performance",
  },

  WEAVING_BEAMS: {
    VIEW: "weaving.beams.view",
    CREATE: "weaving.beams.create",
    EDIT: "weaving.beams.edit",
    APPROVE: "weaving.beams.approve",
    VOID: "weaving.beams.void",
    LOAD: "weaving.beams.load",
  },

  WEAVING_ATTENDANCE: {
    VIEW: "weaving.attendance.view",
    MANAGE: "weaving.attendance.manage",
    OVERRIDE: "weaving.attendance.override",
  },

  REPORTS: {
    DASHBOARD: "reports.dashboard",
    TRIAL_BALANCE: "reports.trial_balance",
    GENERAL_LEDGER: "reports.general_ledger",
    INCOME_STATEMENT: "reports.income_statement",
    CASH_FLOW: "reports.cash_flow",
    MONTHLY_SALES: "reports.monthly_sales",
    STOCK_VALUE: "reports.stock_value",
    AGING: "reports.aging",
    PROFIT: "reports.profit",
    PRODUCT_PERFORMANCE: "reports.product_performance",
  },

  BUSINESS_VALUE: {
    VIEW: "business_value.view",
  },

  BUSINESS_ASSETS: {
    VIEW: "business_assets.view",
    CREATE: "business_assets.create",
    EDIT: "business_assets.edit",
    DELETE: "business_assets.delete",
    MANAGE_CATEGORIES: "business_assets.manage_categories",
  },

  BUSINESS_LIABILITIES: {
    VIEW: "business_liabilities.view",
    CREATE: "business_liabilities.create",
    EDIT: "business_liabilities.edit",
    DELETE: "business_liabilities.delete",
    PAY: "business_liabilities.pay",
  },

  BUSINESS_RECEIVABLE_LOANS: {
    VIEW: "business_receivable_loans.view",
    CREATE: "business_receivable_loans.create",
    EDIT: "business_receivable_loans.edit",
    DELETE: "business_receivable_loans.delete",
    RECEIVE: "business_receivable_loans.receive",
  },

  STAFF: {
    VIEW: "staff.view",
    CREATE: "staff.create",
    EDIT: "staff.edit",
    DELETE: "staff.delete",
    BLOCK: "staff.block",
    MANAGE_PERMISSIONS: "staff.manage_permissions",
    RESET_PASSWORD: "staff.reset_password",
    VIEW_ACTIVITY: "staff.view_activity",
    TRANSFER_OWNER: "staff.transfer_owner",
  },

  SETTINGS: {
    PERSONAL_INFO: "settings.personal_info",
    BUSINESS_INFO: "settings.business_info",
    PRINT: "settings.print",
    BACKUP: "settings.backup",
    IMPORT: "settings.import",
    LOCK: "settings.lock",
  },
};

const ALL_PERMISSIONS = Object.values(PERMISSIONS).flatMap((group) =>
  Object.values(group),
);

// Staff accounts start with no access. Owners must explicitly grant every capability.
const DEFAULT_STAFF_PERMISSIONS = [];

const PERMISSION_SCOPES = Object.freeze({
  TRADING: "trading",
  TRAVEL: "travel",
  WEAVING: "weaving",
  INSTALLMENTS: "installments",
  SHARED: "shared",
  OWNER: "owner",
});

const TRADING_GROUPS = new Set([
  "DASHBOARD", "SALES", "REFUNDS", "PURCHASES", "PURCHASE_RETURNS",
  "RECEIVE_PAYMENTS", "PAY_BILLS", "PRODUCTS", "INVENTORY", "CUSTOMERS",
  "SUPPLIERS", "PARTIES",
]);

const SHARED_GROUPS = new Set([
  "EMPLOYEES", "PAYROLL", "EXPENSES", "ACCOUNTS", "JOURNAL", "REPORTS",
  "BUSINESS_VALUE", "BUSINESS_ASSETS", "BUSINESS_LIABILITIES",
  "BUSINESS_RECEIVABLE_LOANS", "SETTINGS",
]);

const OWNER_ONLY_PERMISSIONS = new Set([
  ...Object.values(PERMISSIONS.STAFF),
  PERMISSIONS.SETTINGS.PERSONAL_INFO,
  PERMISSIONS.SETTINGS.BUSINESS_INFO,
]);
const TRADING_PERMISSION_OVERRIDES = new Set([
  PERMISSIONS.REPORTS.MONTHLY_SALES,
  PERMISSIONS.REPORTS.STOCK_VALUE,
  PERMISSIONS.REPORTS.PRODUCT_PERFORMANCE,
  PERMISSIONS.SETTINGS.IMPORT,
]);

const getPermissionScope = (permission) => {
  if (OWNER_ONLY_PERMISSIONS.has(permission)) return PERMISSION_SCOPES.OWNER;
  if (String(permission).startsWith("travel.")) return PERMISSION_SCOPES.TRAVEL;
  if (String(permission).startsWith("weaving.")) return PERMISSION_SCOPES.WEAVING;
  if (String(permission).startsWith("installments.")) return PERMISSION_SCOPES.INSTALLMENTS;
  if (TRADING_PERMISSION_OVERRIDES.has(permission)) return PERMISSION_SCOPES.TRADING;

  const groupName = Object.keys(PERMISSIONS).find((key) =>
    Object.values(PERMISSIONS[key]).includes(permission),
  );

  if (TRADING_GROUPS.has(groupName)) return PERMISSION_SCOPES.TRADING;
  if (SHARED_GROUPS.has(groupName)) return PERMISSION_SCOPES.SHARED;
  return null;
};

const isPermissionAvailable = (permission, moduleConfig = {}) => {
  const scope = getPermissionScope(permission);
  if (!scope) return false;
  if (scope === PERMISSION_SCOPES.OWNER) return true;
  if (scope === PERMISSION_SCOPES.SHARED) return true;
  return moduleConfig?.enabledModules?.[scope] === true;
};

const getAllowedPermissions = (moduleConfig = {}) =>
  ALL_PERMISSIONS.filter(
    (permission) =>
      getPermissionScope(permission) !== PERMISSION_SCOPES.OWNER &&
      isPermissionAvailable(permission, moduleConfig),
  );

const getPermissionModules = (permissions = []) => [
  ...new Set(
    sanitizePermissions(permissions)
      .map(getPermissionScope)
      .filter((scope) => ["trading", "travel", "weaving", "installments"].includes(scope)),
  ),
];

const getEffectivePermissions = (
  permissions = [],
  moduleConfig = {},
  reviewedModules,
) => {
  const hasReviewState = Array.isArray(reviewedModules);
  return sanitizePermissions(permissions).filter((permission) => {
    const scope = getPermissionScope(permission);
    if (!isPermissionAvailable(permission, moduleConfig)) return false;
    if (scope === PERMISSION_SCOPES.SHARED) return true;
    return !hasReviewState || reviewedModules.includes(scope);
  });
};

const getPermissionCatalog = (moduleConfig = {}) => {
  const allowed = new Set(getAllowedPermissions(moduleConfig));
  const labels = {
    trading: "Trading",
    travel: "Travel",
    weaving: "Weaving",
    installments: "Committee & Installments",
    shared: "Shared",
  };

  return Object.entries(labels)
    .filter(([scope]) => scope === "shared" || moduleConfig?.enabledModules?.[scope] === true)
    .map(([scope, label]) => ({
      key: scope,
      label,
      groups: Object.entries(PERMISSIONS)
        .map(([group, values]) => ({
          key: group.toLowerCase(),
          permissions: Object.values(values).filter(
            (permission) => allowed.has(permission) && getPermissionScope(permission) === scope,
          ),
        }))
        .filter((group) => group.permissions.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
};

const isValidPermission = (permission) => {
  return ALL_PERMISSIONS.includes(permission);
};

const sanitizePermissions = (permissions = []) => {
  if (!Array.isArray(permissions)) return [];

  return [...new Set(permissions.filter(isValidPermission))];
};

const hasPermission = (permissions = [], permission) => {
  return Array.isArray(permissions) && permissions.includes(permission);
};

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_STAFF_PERMISSIONS,
  isValidPermission,
  sanitizePermissions,
  hasPermission,
  PERMISSION_SCOPES,
  getPermissionScope,
  isPermissionAvailable,
  getAllowedPermissions,
  getEffectivePermissions,
  getPermissionModules,
  getPermissionCatalog,
};
