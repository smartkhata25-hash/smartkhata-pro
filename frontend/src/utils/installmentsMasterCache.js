const entries = new Map();
const inFlight = new Map();
const domainEpochs = new Map();
let activeScope = '';

export const INSTALLMENTS_CACHE_DOMAINS = Object.freeze({
  MEMBERS: 'members',
  MEMBER_DETAIL: 'member-detail',
  MEMBER_CONTEXT: 'member-context',
  SUPPLIERS: 'suppliers',
  SUPPLIER_DETAIL: 'supplier-detail',
  SUPPLIER_CONTEXT: 'supplier-context',
  COMMITTEES: 'committees',
  COMMITTEE_DETAIL: 'committee-detail',
  CATALOG: 'catalog',
  ACCOUNTS: 'accounts',
  PAYMENT_LOOKUPS: 'payment-lookups',
  INVOICES: 'invoices',
  INVOICE_DETAIL: 'invoice-detail',
  COLLECTIONS: 'collections',
  PAYMENT_HISTORY: 'payment-history',
  PAYMENT_DETAIL: 'payment-detail',
  DASHBOARD: 'dashboard',
  REPORT_LOOKUPS: 'report-lookups',
  REPORT_PROFIT: 'report-profit',
  REPORT_COLLECTIONS: 'report-collections',
  REPORT_EXPENSES: 'report-expenses',
  REPORT_BALANCES: 'report-balances',
  REPORT_SAVINGS: 'report-savings',
  EXPENSES: 'expenses',
  EXPENSE_DETAIL: 'expense-detail',
});

export const INSTALLMENTS_STALE_TIME = Object.freeze({
  MASTER: 3 * 60 * 1000,
  CATALOG: 5 * 60 * 1000,
  ACCOUNTS: 3 * 60 * 1000,
  DETAIL: 60 * 1000,
  FINANCIAL: 45 * 1000,
  TODAY: 20 * 1000,
  DASHBOARD: 45 * 1000,
});

const safeUser = () => {
  if (typeof window === 'undefined') return null;
  try {
    return JSON.parse(window.localStorage?.getItem('user') || 'null');
  } catch {
    return null;
  }
};

const currentScope = () => {
  if (typeof window === 'undefined') return 'server';
  const user = safeUser();
  const ownerId = user?.businessOwnerId || user?.businessOwner || user?.ownerId || user?._id || window.localStorage?.getItem('userId') || 'anonymous';
  const actorId = user?._id || user?.id || window.localStorage?.getItem('userId') || 'anonymous';
  const permissions = Array.isArray(user?.permissions) ? [...user.permissions].sort().join(',') : String(user?.accountRole || '');
  return `${ownerId}:${actorId}:${permissions}`;
};

const ensureScope = () => {
  const nextScope = currentScope();
  if (activeScope && activeScope !== nextScope) {
    entries.clear();
    inFlight.clear();
    domainEpochs.clear();
  }
  activeScope = nextScope;
  return nextScope;
};

const normalizeValue = (value) => {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((result, key) => {
    const next = value[key];
    if (next !== undefined && next !== null && next !== '') result[key] = normalizeValue(next);
    return result;
  }, {});
  return value;
};

export const normalizeInstallmentsCacheParams = (params = {}) => normalizeValue(params);

export const getPakistanBusinessDateCacheKey = () => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
};

const cacheKey = (domain, params = {}) => `${ensureScope()}:${domain}:${JSON.stringify(normalizeInstallmentsCacheParams(params))}`;

const isFresh = (entry, staleTime) => Boolean(entry) && Date.now() - entry.savedAt <= staleTime;

const requestWithRetry = async (request, retries) => {
  try {
    return await request();
  } catch (error) {
    const status = Number(error?.response?.status || 0);
    const retryable = !status || status >= 500;
    if (!retryable || retries <= 0) throw error;
    return requestWithRetry(request, retries - 1);
  }
};

export const getCachedInstallmentsValue = (domain, params = {}, staleTime = INSTALLMENTS_STALE_TIME.MASTER) => {
  const entry = entries.get(cacheKey(domain, params));
  return isFresh(entry, staleTime) ? entry.data : undefined;
};

export const getInstallmentsCacheSnapshot = (domain, params = {}, staleTime = INSTALLMENTS_STALE_TIME.MASTER) => {
  const entry = entries.get(cacheKey(domain, params));
  if (!entry) return null;
  return { data: entry.data, savedAt: entry.savedAt, isStale: !isFresh(entry, staleTime) };
};

export const setCachedInstallmentsValue = (domain, params = {}, data) => {
  entries.set(cacheKey(domain, params), { data, savedAt: Date.now() });
  return data;
};

export const cachedInstallmentsRequest = (domain, params, request, options = {}) => {
  const staleTime = Number(options.staleTime ?? INSTALLMENTS_STALE_TIME.MASTER);
  const key = cacheKey(domain, params);
  const cached = entries.get(key);
  const requestEpoch = domainEpochs.get(domain) || 0;

  if (!options.forceRefresh && isFresh(cached, staleTime)) return Promise.resolve(cached.data);
  if (!options.forceRefresh && inFlight.has(key)) return inFlight.get(key);

  const execute = () => requestWithRetry(request, Number(options.retries || 0))
    .then((data) => {
      if ((domainEpochs.get(domain) || 0) === requestEpoch) entries.set(key, { data, savedAt: Date.now() });
      return data;
    })
    .finally(() => inFlight.delete(key));

  if (!options.forceRefresh && options.staleWhileRevalidate && cached) {
    const refresh = execute().catch(() => cached.data);
    inFlight.set(key, refresh);
    return Promise.resolve(cached.data);
  }

  const pending = execute();
  inFlight.set(key, pending);
  return pending;
};

export const invalidateInstallmentsCache = (domains = []) => {
  ensureScope();
  const targets = new Set(Array.isArray(domains) ? domains : [domains]);
  targets.forEach((domain) => domainEpochs.set(domain, (domainEpochs.get(domain) || 0) + 1));
  [...entries.keys()].forEach((key) => {
    if ([...targets].some((domain) => key.includes(`:${domain}:`))) entries.delete(key);
  });
  [...inFlight.keys()].forEach((key) => {
    if ([...targets].some((domain) => key.includes(`:${domain}:`))) inFlight.delete(key);
  });
};

export const clearInstallmentsMasterCache = () => {
  entries.clear();
  inFlight.clear();
  domainEpochs.clear();
  activeScope = currentScope();
};

const D = INSTALLMENTS_CACHE_DOMAINS;
const financialReports = [D.REPORT_PROFIT, D.REPORT_COLLECTIONS, D.REPORT_EXPENSES, D.REPORT_BALANCES, D.REPORT_SAVINGS];

export const invalidateInstallmentsMemberData = () => invalidateInstallmentsCache([
  D.MEMBERS, D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.PAYMENT_LOOKUPS, D.REPORT_LOOKUPS, D.COMMITTEES, D.COMMITTEE_DETAIL, D.REPORT_BALANCES, D.DASHBOARD,
]);

export const invalidateInstallmentsSupplierData = () => invalidateInstallmentsCache([
  D.SUPPLIERS, D.SUPPLIER_DETAIL, D.SUPPLIER_CONTEXT, D.PAYMENT_LOOKUPS, D.REPORT_LOOKUPS, D.REPORT_BALANCES, D.DASHBOARD,
]);

export const invalidateInstallmentsCommitteeData = () => invalidateInstallmentsCache([
  D.COMMITTEES, D.COMMITTEE_DETAIL, D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.PAYMENT_LOOKUPS, D.REPORT_LOOKUPS, D.COLLECTIONS, D.REPORT_COLLECTIONS, D.REPORT_SAVINGS, D.DASHBOARD,
]);

export const invalidateInstallmentsInvoiceData = () => invalidateInstallmentsCache([
  D.INVOICES, D.INVOICE_DETAIL, D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.SUPPLIER_DETAIL, D.SUPPLIER_CONTEXT, D.COMMITTEES, D.COMMITTEE_DETAIL,
  D.ACCOUNTS, D.PAYMENT_HISTORY, D.COLLECTIONS, D.DASHBOARD, D.REPORT_LOOKUPS, ...financialReports,
]);

export const invalidateInstallmentsReceiptData = () => invalidateInstallmentsCache([
  D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.COMMITTEES, D.COMMITTEE_DETAIL, D.ACCOUNTS, D.PAYMENT_HISTORY, D.PAYMENT_DETAIL,
  D.COLLECTIONS, D.DASHBOARD, D.REPORT_COLLECTIONS, D.REPORT_BALANCES, D.REPORT_SAVINGS,
]);

export const invalidateInstallmentsSupplierPaymentData = () => invalidateInstallmentsCache([
  D.SUPPLIER_DETAIL, D.SUPPLIER_CONTEXT, D.ACCOUNTS, D.PAYMENT_HISTORY, D.PAYMENT_DETAIL, D.DASHBOARD, D.REPORT_BALANCES,
]);

export const invalidateInstallmentsPayoutData = () => invalidateInstallmentsCache([
  D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.COMMITTEES, D.COMMITTEE_DETAIL, D.ACCOUNTS, D.PAYMENT_HISTORY, D.PAYMENT_DETAIL,
  D.DASHBOARD, D.REPORT_BALANCES, D.REPORT_SAVINGS,
]);

export const invalidateInstallmentsPaymentReversalData = () => invalidateInstallmentsCache([
  D.MEMBER_DETAIL, D.MEMBER_CONTEXT, D.SUPPLIER_DETAIL, D.SUPPLIER_CONTEXT, D.COMMITTEES, D.COMMITTEE_DETAIL,
  D.ACCOUNTS, D.PAYMENT_HISTORY, D.PAYMENT_DETAIL, D.COLLECTIONS, D.DASHBOARD,
  D.REPORT_COLLECTIONS, D.REPORT_BALANCES, D.REPORT_SAVINGS,
]);

export const invalidateInstallmentsExpenseData = () => invalidateInstallmentsCache([
  D.EXPENSES, D.EXPENSE_DETAIL, D.ACCOUNTS, D.DASHBOARD, D.REPORT_PROFIT, D.REPORT_EXPENSES,
]);

export const invalidateInstallmentsCatalogData = () => invalidateInstallmentsCache([
  D.CATALOG, D.REPORT_LOOKUPS, D.REPORT_PROFIT,
]);

export const invalidateInstallmentsAccountData = () => invalidateInstallmentsCache([
  D.ACCOUNTS, D.PAYMENT_LOOKUPS, D.REPORT_LOOKUPS, D.DASHBOARD, D.REPORT_BALANCES,
]);
