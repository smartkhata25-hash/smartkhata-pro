// 📁 src/utils/pageState.js

const PREFIX = 'app_state_';
const VERSION = 1;
const EXPIRY_HOURS = 24;

const isExpired = (timestamp) => {
  const now = Date.now();
  return now - timestamp > EXPIRY_HOURS * 60 * 60 * 1000;
};

export const saveState = (key, data) => {
  try {
    const payload = {
      v: VERSION,
      t: Date.now(),
      data,
    };

    localStorage.setItem(PREFIX + key, JSON.stringify(payload));
  } catch (err) {
    console.error('saveState error', err);
  }
};

export const loadState = (key, defaultValue = null) => {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return defaultValue;

    const parsed = JSON.parse(raw);

    if (parsed.v !== VERSION) return defaultValue;
    if (isExpired(parsed.t)) {
      localStorage.removeItem(PREFIX + key);
      return defaultValue;
    }

    return parsed.data ?? defaultValue;
  } catch (err) {
    console.error('loadState error', err);
    return defaultValue;
  }
};

export const clearState = (key) => {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch (err) {
    console.error('clearState error', err);
  }
};

// 🔹 Deep merge (nested objects بھی محفوظ)
export const deepMerge = (target = {}, source = {}) => {
  if (!target || typeof target !== 'object') target = {};
  if (!source || typeof source !== 'object') return { ...target };

  const output = { ...target };

  Object.keys(source).forEach((key) => {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (Array.isArray(sourceVal)) {
      output[key] = sourceVal;
    } else if (sourceVal && typeof sourceVal === 'object') {
      output[key] = deepMerge(targetVal || {}, sourceVal);
    } else {
      output[key] = sourceVal;
    }
  });

  return output;
};

// 🔹 Debounce (smooth saving)
export const debounce = (fn, delay = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};
