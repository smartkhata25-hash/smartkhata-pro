// src/utils/persistStorage.js

const STORAGE_PREFIX = 'app_state_';

const STORAGE_VERSION = 2;

const DEFAULT_EXPIRY_HOURS = 24;

const getStorageKey = (key) => {
  if (!key) return '';

  return `${STORAGE_PREFIX}${key}`;
};

const isObject = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

const isExpired = (timestamp, expiryHours = DEFAULT_EXPIRY_HOURS) => {
  if (!timestamp) return true;

  const expiryMs = Number(expiryHours || DEFAULT_EXPIRY_HOURS) * 60 * 60 * 1000;

  return Date.now() - Number(timestamp) > expiryMs;
};

const sanitizeValue = (value) => {
  if (value === undefined) {
    return null;
  }

  if (value instanceof File) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    const output = {};

    Object.entries(value).forEach(([key, item]) => {
      const safeValue = sanitizeValue(item);

      if (safeValue !== undefined) {
        output[key] = safeValue;
      }
    });

    return output;
  }

  return value;
};

export const savePersistedState = (
  key,
  data,
  { expiryHours = DEFAULT_EXPIRY_HOURS, storage = localStorage, type = 'page' } = {}
) => {
  if (!key || !storage) return false;

  try {
    const safeData = sanitizeValue(data);

    const payload = {
      version: STORAGE_VERSION,
      savedAt: Date.now(),
      expiryHours,
      type,
      data: safeData,
    };

    storage.setItem(getStorageKey(key), JSON.stringify(payload));

    return true;
  } catch (error) {
    console.error(`Persist save failed: ${key}`, error);

    return false;
  }
};

export const loadPersistedState = (
  key,
  defaultValue = null,
  { storage = localStorage, expiryHours = DEFAULT_EXPIRY_HOURS } = {}
) => {
  if (!key || !storage) return defaultValue;

  try {
    const raw = storage.getItem(getStorageKey(key));

    if (!raw) {
      return defaultValue;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      storage.removeItem(getStorageKey(key));

      return defaultValue;
    }

    if (parsed.version !== STORAGE_VERSION) {
      storage.removeItem(getStorageKey(key));

      return defaultValue;
    }

    const effectiveExpiryHours = Number(parsed.expiryHours || expiryHours);

    if (isExpired(parsed.savedAt, effectiveExpiryHours)) {
      storage.removeItem(getStorageKey(key));

      return defaultValue;
    }

    return parsed.data ?? defaultValue;
  } catch (error) {
    console.error(`Persist load failed: ${key}`, error);

    try {
      storage.removeItem(getStorageKey(key));
    } catch {
      // ignore cleanup error
    }

    return defaultValue;
  }
};

export const clearPersistedState = (key, { storage = localStorage } = {}) => {
  if (!key || !storage) return false;

  try {
    storage.removeItem(getStorageKey(key));

    return true;
  } catch (error) {
    console.error(`Persist clear failed: ${key}`, error);

    return false;
  }
};

export const hasPersistedState = (key, { storage = localStorage } = {}) => {
  if (!key || !storage) return false;

  try {
    return Boolean(storage.getItem(getStorageKey(key)));
  } catch {
    return false;
  }
};

export const deepMergeState = (target = {}, source = {}) => {
  if (!isObject(target)) {
    target = {};
  }

  if (!isObject(source)) {
    return { ...target };
  }

  const output = { ...target };

  Object.keys(source).forEach((key) => {
    const sourceValue = source[key];
    const targetValue = target[key];

    if (Array.isArray(sourceValue)) {
      output[key] = [...sourceValue];

      return;
    }

    if (isObject(sourceValue)) {
      output[key] = deepMergeState(isObject(targetValue) ? targetValue : {}, sourceValue);

      return;
    }

    output[key] = sourceValue;
  });

  return output;
};

export const createPersistDebounce = (callback, delay = 400) => {
  let timer = null;

  const debounced = (...args) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      callback(...args);
      timer = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  debounced.flush = (...args) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    callback(...args);
  };

  return debounced;
};

export const clearExpiredPersistedStates = ({ storage = localStorage } = {}) => {
  if (!storage) return;

  try {
    const keysToRemove = [];

    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key || !key.startsWith(STORAGE_PREFIX)) {
        continue;
      }

      try {
        const raw = storage.getItem(key);

        if (!raw) continue;

        const parsed = JSON.parse(raw);

        if (
          !parsed ||
          parsed.version !== STORAGE_VERSION ||
          isExpired(parsed.savedAt, parsed.expiryHours || DEFAULT_EXPIRY_HOURS)
        ) {
          keysToRemove.push(key);
        }
      } catch {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      storage.removeItem(key);
    });
  } catch (error) {
    console.error('Persist cleanup failed', error);
  }
};

export const PERSIST_CONFIG = {
  prefix: STORAGE_PREFIX,
  version: STORAGE_VERSION,
  defaultExpiryHours: DEFAULT_EXPIRY_HOURS,
};
