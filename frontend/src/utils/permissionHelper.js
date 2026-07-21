// 📁 src/utils/permissionHelper.js

//  SAFE LOCAL STORAGE HELPERS

const safeParseJSON = (value, fallback = null) => {
  try {
    if (!value) return fallback;

    return JSON.parse(value);
  } catch (error) {
    console.error('Permission Helper JSON Parse Error:', error);

    return fallback;
  }
};

export const getStoredUser = () => {
  return safeParseJSON(localStorage.getItem('user'), null);
};

export const getStoredToken = () => {
  return localStorage.getItem('token') || '';
};

export const getStoredUserId = () => {
  return localStorage.getItem('userId') || '';
};

// USER ROLE HELPERS

export const getAccountRole = (user = null) => {
  const currentUser = user || getStoredUser();

  if (!currentUser) return '';

  /*
    پرانے Live Users میں accountRole موجود نہ ہو
    تو انہیں Owner سمجھا جائے گا۔
  */
  return currentUser.accountRole || 'owner';
};

export const isOwner = (user = null) => {
  return getAccountRole(user) === 'owner';
};

export const isStaff = (user = null) => {
  return getAccountRole(user) === 'staff';
};

export const isSystemAdmin = (user = null) => {
  const currentUser = user || getStoredUser();

  return currentUser?.role === 'admin';
};

export const isStaffBlocked = (user = null) => {
  const currentUser = user || getStoredUser();

  return getAccountRole(currentUser) === 'staff' && currentUser?.staffStatus === 'blocked';
};

//PERMISSION HELPERS

export const getUserPermissions = (user = null) => {
  const currentUser = user || getStoredUser();

  if (!currentUser || !Array.isArray(currentUser.permissions)) {
    return [];
  }

  return currentUser.permissions;
};

export const hasPermission = (permission, user = null) => {
  if (!permission) return false;

  const currentUser = user || getStoredUser();

  if (!currentUser) return false;

  if (isOwner(currentUser)) {
    return true;
  }

  if (!isStaff(currentUser)) {
    return false;
  }

  if (isStaffBlocked(currentUser)) {
    return false;
  }

  const permissions = getUserPermissions(currentUser);

  return permissions.includes(permission);
};

export const hasAnyPermission = (permissions = [], user = null) => {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return false;
  }

  const currentUser = user || getStoredUser();

  if (!currentUser) return false;

  if (isOwner(currentUser)) {
    return true;
  }

  return permissions.some((permission) => hasPermission(permission, currentUser));
};

export const hasAllPermissions = (permissions = [], user = null) => {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    return true;
  }

  const currentUser = user || getStoredUser();

  if (!currentUser) return false;

  if (isOwner(currentUser)) {
    return true;
  }

  return permissions.every((permission) => hasPermission(permission, currentUser));
};

//  ACCESS HELPERS

export const canAccess = ({
  permission = null,
  anyPermissions = [],
  allPermissions = [],
  ownerOnly = false,
  systemAdminOnly = false,
  user = null,
} = {}) => {
  const currentUser = user || getStoredUser();

  if (!currentUser) return false;

  if (systemAdminOnly) {
    return isSystemAdmin(currentUser);
  }

  if (ownerOnly) {
    return isOwner(currentUser);
  }

  if (permission && !hasPermission(permission, currentUser)) {
    return false;
  }

  if (
    Array.isArray(anyPermissions) &&
    anyPermissions.length > 0 &&
    !hasAnyPermission(anyPermissions, currentUser)
  ) {
    return false;
  }

  if (
    Array.isArray(allPermissions) &&
    allPermissions.length > 0 &&
    !hasAllPermissions(allPermissions, currentUser)
  ) {
    return false;
  }

  return true;
};

// MODULE HELPERS

export const canViewModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.view`, user);
};

export const canCreateModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.create`, user);
};

export const canEditModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.edit`, user);
};

export const canDeleteModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.delete`, user);
};

export const canPrintModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.print`, user);
};

export const canRestoreModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.restore`, user);
};

export const canConvertModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.convert`, user);
};

export const canMergeModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.merge`, user);
};

export const canImportModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.import`, user);
};

export const canExportModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.export`, user);
};

export const canAdjustModule = (moduleName, user = null) => {
  if (!moduleName) return false;

  return hasPermission(`${moduleName}.adjust`, user);
};

//  LOCAL USER UPDATE HELPERS

export const saveStoredUser = (user) => {
  if (!user || typeof user !== 'object') {
    return false;
  }

  localStorage.setItem('user', JSON.stringify(user));

  if (user._id) {
    localStorage.setItem('userId', String(user._id));
  }

  return true;
};

export const updateStoredUser = (updates = {}) => {
  const currentUser = getStoredUser();

  if (!currentUser) return null;

  const updatedUser = {
    ...currentUser,
    ...updates,
  };

  saveStoredUser(updatedUser);

  return updatedUser;
};

export const updateStoredPermissions = (permissions = []) => {
  const safePermissions = Array.isArray(permissions) ? permissions : [];

  return updateStoredUser({
    permissions: [...new Set(safePermissions)],
  });
};

// LOGOUT / CLEAR SESSION

export const clearAuthStorage = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('user');
  localStorage.removeItem('mode');
};

//COMMON PERMISSION NAMES

export const FRONTEND_PERMISSIONS = {
  DASHBOARD: {
    SUMMARY_CARDS: 'dashboard.summary_cards',
    RIGHT_PANEL: 'dashboard.right_panel',
  },

  SALES: {
    VIEW: 'sales.view',
    CREATE: 'sales.create',
    EDIT: 'sales.edit',
    DELETE: 'sales.delete',
    PRINT: 'sales.print',
    RECEIVE_PAYMENT: 'sales.receive_payment',
  },

  REFUNDS: {
    VIEW: 'refunds.view',
    CREATE: 'refunds.create',
    EDIT: 'refunds.edit',
    DELETE: 'refunds.delete',
  },

  PURCHASES: {
    VIEW: 'purchases.view',
    CREATE: 'purchases.create',
    EDIT: 'purchases.edit',
    DELETE: 'purchases.delete',
    PAY_BILL: 'purchases.pay_bill',
  },

  PURCHASE_RETURNS: {
    VIEW: 'purchase_returns.view',
    CREATE: 'purchase_returns.create',
    EDIT: 'purchase_returns.edit',
    DELETE: 'purchase_returns.delete',
  },

  RECEIVE_PAYMENTS: {
    VIEW: 'receive_payments.view',
    CREATE: 'receive_payments.create',
    EDIT: 'receive_payments.edit',
    DELETE: 'receive_payments.delete',
  },

  PAY_BILLS: {
    VIEW: 'pay_bills.view',
    CREATE: 'pay_bills.create',
    EDIT: 'pay_bills.edit',
    DELETE: 'pay_bills.delete',
  },

  PRODUCTS: {
    VIEW: 'products.view',
    CREATE: 'products.create',
    EDIT: 'products.edit',
    DELETE: 'products.delete',
    VIEW_COST: 'products.view_cost',
    BULK_CREATE: 'products.bulk_create',
  },

  INVENTORY: {
    VIEW: 'inventory.view',
    ADJUST: 'inventory.adjust',
    VIEW_HISTORY: 'inventory.view_history',
    DELETE_TRANSACTION: 'inventory.delete_transaction',
    MANAGE_CATEGORIES: 'inventory.manage_categories',
  },

  CUSTOMERS: {
    VIEW: 'customers.view',
    CREATE: 'customers.create',
    EDIT: 'customers.edit',
    DELETE: 'customers.delete',
    RESTORE: 'customers.restore',
    MERGE: 'customers.merge',
    CONVERT: 'customers.convert',
    VIEW_LEDGER: 'customers.view_ledger',
  },

  SUPPLIERS: {
    VIEW: 'suppliers.view',
    CREATE: 'suppliers.create',
    EDIT: 'suppliers.edit',
    DELETE: 'suppliers.delete',
    RESTORE: 'suppliers.restore',
    MERGE: 'suppliers.merge',
    CONVERT: 'suppliers.convert',
    IMPORT: 'suppliers.import',
    VIEW_LEDGER: 'suppliers.view_ledger',
  },

  PARTIES: {
    VIEW: 'parties.view',
    CREATE: 'parties.create',
    EDIT: 'parties.edit',
    DELETE: 'parties.delete',
    RESTORE: 'parties.restore',
    CONVERT: 'parties.convert',
    VIEW_LEDGER: 'parties.view_ledger',
  },

  EXPENSES: {
    VIEW: 'expenses.view',
    CREATE: 'expenses.create',
    EDIT: 'expenses.edit',
    DELETE: 'expenses.delete',
    MANAGE_TITLES: 'expenses.manage_titles',
  },

  ACCOUNTS: {
    VIEW: 'accounts.view',
    CREATE: 'accounts.create',
    EDIT: 'accounts.edit',
    DELETE: 'accounts.delete',
    VIEW_TRANSACTIONS: 'accounts.view_transactions',
  },

  JOURNAL: {
    VIEW: 'journal.view',
    CREATE: 'journal.create',
    EDIT: 'journal.edit',
    DELETE: 'journal.delete',
  },

  REPORTS: {
    DASHBOARD: 'reports.dashboard',
    TRIAL_BALANCE: 'reports.trial_balance',
    GENERAL_LEDGER: 'reports.general_ledger',
    INCOME_STATEMENT: 'reports.income_statement',
    CASH_FLOW: 'reports.cash_flow',
    MONTHLY_SALES: 'reports.monthly_sales',
    STOCK_VALUE: 'reports.stock_value',
    AGING: 'reports.aging',
    PROFIT: 'reports.profit',
  },

  STAFF: {
    VIEW: 'staff.view',
    CREATE: 'staff.create',
    EDIT: 'staff.edit',
    DELETE: 'staff.delete',
    BLOCK: 'staff.block',
    MANAGE_PERMISSIONS: 'staff.manage_permissions',
    RESET_PASSWORD: 'staff.reset_password',
    VIEW_ACTIVITY: 'staff.view_activity',
    TRANSFER_OWNER: 'staff.transfer_owner',
  },

  SETTINGS: {
    PERSONAL_INFO: 'settings.personal_info',
    BUSINESS_INFO: 'settings.business_info',
    PRINT: 'settings.print',
    BACKUP: 'settings.backup',
    IMPORT: 'settings.import',
    LOCK: 'settings.lock',
  },
};

//DEFAULT EXPORT

const permissionHelper = {
  getStoredUser,
  getStoredToken,
  getStoredUserId,

  getAccountRole,
  getUserPermissions,

  isOwner,
  isStaff,
  isSystemAdmin,
  isStaffBlocked,

  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccess,

  canViewModule,
  canCreateModule,
  canEditModule,
  canDeleteModule,
  canPrintModule,
  canRestoreModule,
  canConvertModule,
  canMergeModule,
  canImportModule,
  canExportModule,
  canAdjustModule,

  saveStoredUser,
  updateStoredUser,
  updateStoredPermissions,
  clearAuthStorage,

  FRONTEND_PERMISSIONS,
};

export default permissionHelper;
