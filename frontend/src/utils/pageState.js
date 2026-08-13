// src/utils/pageState.js

import {
  savePersistedState,
  loadPersistedState,
  clearPersistedState,
  deepMergeState,
  createPersistDebounce,
} from './persistStorage';

const DEFAULT_EXPIRY_HOURS = 24;

export const saveState = (
  key,
  data,
  { expiryHours = DEFAULT_EXPIRY_HOURS, type = 'legacy' } = {}
) => {
  return savePersistedState(key, data, {
    expiryHours,
    type,
  });
};

export const loadState = (
  key,
  defaultValue = null,
  { expiryHours = DEFAULT_EXPIRY_HOURS } = {}
) => {
  return loadPersistedState(key, defaultValue, {
    expiryHours,
  });
};

export const clearState = (key) => {
  return clearPersistedState(key);
};

export const deepMerge = (target = {}, source = {}) => {
  return deepMergeState(target, source);
};

export const debounce = (fn, delay = 400) => {
  return createPersistDebounce(fn, delay);
};
