// src/utils/customerCache.js

const CUSTOMERS_CACHE_KEY = 'customers_cache_v1';
const CUSTOMERS_VERSION_KEY = 'customers_cache_version_v1';

const isBrowser = () => {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
};

const safeParse = (value, fallback = null) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.error('Customer cache parse failed:', error);
    return fallback;
  }
};

const normalizeCustomers = (customers) => {
  return Array.isArray(customers) ? customers : [];
};

export const getCachedCustomers = () => {
  if (!isBrowser()) {
    return [];
  }

  try {
    const raw = localStorage.getItem(CUSTOMERS_CACHE_KEY);

    const parsed = safeParse(raw, []);

    return normalizeCustomers(parsed);
  } catch (error) {
    console.error('Customer cache read failed:', error);

    return [];
  }
};

export const hasCustomerCache = () => {
  if (!isBrowser()) {
    return false;
  }

  try {
    const raw = localStorage.getItem(CUSTOMERS_CACHE_KEY);

    if (raw === null) {
      return false;
    }

    const parsed = safeParse(raw, null);

    return Array.isArray(parsed);
  } catch (error) {
    console.error('Customer cache check failed:', error);

    return false;
  }
};

export const setCachedCustomers = (customers = []) => {
  if (!isBrowser()) {
    return false;
  }

  try {
    const safeCustomers = normalizeCustomers(customers);

    localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(safeCustomers));

    return true;
  } catch (error) {
    console.error('Customer cache save failed:', error);

    return false;
  }
};

export const clearCustomerCache = () => {
  if (!isBrowser()) {
    return false;
  }

  try {
    localStorage.removeItem(CUSTOMERS_CACHE_KEY);
    localStorage.removeItem(CUSTOMERS_VERSION_KEY);

    return true;
  } catch (error) {
    console.error('Customer cache clear failed:', error);

    return false;
  }
};

export const getCustomerVersion = () => {
  if (!isBrowser()) {
    return null;
  }

  try {
    return localStorage.getItem(CUSTOMERS_VERSION_KEY);
  } catch (error) {
    console.error('Customer version read failed:', error);

    return null;
  }
};

export const setCustomerVersion = (version) => {
  if (!isBrowser()) {
    return false;
  }

  try {
    if (version === null || version === undefined || version === '') {
      localStorage.removeItem(CUSTOMERS_VERSION_KEY);

      return true;
    }

    localStorage.setItem(CUSTOMERS_VERSION_KEY, String(version));

    return true;
  } catch (error) {
    console.error('Customer version save failed:', error);

    return false;
  }
};

export const isCustomerVersionChanged = (serverVersion) => {
  if (serverVersion === null || serverVersion === undefined) {
    return true;
  }

  const cachedVersion = getCustomerVersion();

  if (cachedVersion === null) {
    return true;
  }

  return String(cachedVersion) !== String(serverVersion);
};

export const addCachedCustomer = (customer) => {
  if (!customer?._id) {
    return false;
  }

  const customers = getCachedCustomers();

  const existingIndex = customers.findIndex((item) => String(item?._id) === String(customer._id));

  if (existingIndex !== -1) {
    customers[existingIndex] = {
      ...customers[existingIndex],
      ...customer,
    };

    return setCachedCustomers(customers);
  }

  return setCachedCustomers([...customers, customer]);
};

export const updateCachedCustomer = (customer) => {
  if (!customer?._id) {
    return false;
  }

  const customers = getCachedCustomers();

  const index = customers.findIndex((item) => String(item?._id) === String(customer._id));

  if (index === -1) {
    return false;
  }

  customers[index] = {
    ...customers[index],
    ...customer,
  };

  return setCachedCustomers(customers);
};

export const removeCachedCustomer = (customerId) => {
  if (!customerId) {
    return false;
  }

  const customers = getCachedCustomers();

  const nextCustomers = customers.filter(
    (customer) => String(customer?._id) !== String(customerId)
  );

  return setCachedCustomers(nextCustomers);
};

export const getCachedCustomerById = (customerId) => {
  if (!customerId) {
    return null;
  }

  const customers = getCachedCustomers();

  return customers.find((customer) => String(customer?._id) === String(customerId)) || null;
};

export const updateCachedCustomerBalance = (customerId, balance) => {
  if (!customerId) {
    return false;
  }

  const numericBalance = Number(balance);

  if (!Number.isFinite(numericBalance)) {
    return false;
  }

  const customers = getCachedCustomers();

  const index = customers.findIndex((customer) => String(customer?._id) === String(customerId));

  if (index === -1) {
    return false;
  }

  customers[index] = {
    ...customers[index],
    balance: numericBalance,
  };

  return setCachedCustomers(customers);
};
