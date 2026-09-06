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

const DEFAULT_STAFF_PERMISSIONS = [
  PERMISSIONS.SALES.VIEW,
  PERMISSIONS.SALES.CREATE,

  PERMISSIONS.PURCHASES.VIEW,
  PERMISSIONS.REFUNDS.VIEW,
  PERMISSIONS.PURCHASE_RETURNS.VIEW,

  PERMISSIONS.RECEIVE_PAYMENTS.VIEW,
  PERMISSIONS.PAY_BILLS.VIEW,

  PERMISSIONS.PRODUCTS.VIEW,
  PERMISSIONS.INVENTORY.VIEW,

  PERMISSIONS.CUSTOMERS.VIEW,
  PERMISSIONS.SUPPLIERS.VIEW,
  PERMISSIONS.PARTIES.VIEW,
];

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
};
