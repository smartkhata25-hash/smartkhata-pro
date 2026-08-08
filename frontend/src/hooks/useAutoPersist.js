// 📁 src/hooks/useAutoPersist.js

import { useEffect, useRef } from 'react';
import { saveState, loadState, deepMerge } from '../utils/pageState';

export default function useAutoPersist(key, state, setState) {
  const isLoaded = useRef(false);

  // ✅ debounce timer
  const debounceTimer = useRef(null);

  // ✅ safe debounced save
  const debouncedSave = useRef();

  debouncedSave.current = (value) => {
    clearTimeout(debounceTimer.current);

    debounceTimer.current = setTimeout(() => {
      saveState(key, value);
    }, 500);
  };

  useEffect(() => {
    if (!key) {
      isLoaded.current = false;
      return;
    }

    isLoaded.current = false;

    const saved = loadState(key, null);

    if (saved && typeof saved === 'object') {
      setState((prev) => deepMerge(prev || {}, saved));
    }

    const timer = setTimeout(() => {
      isLoaded.current = true;
    }, 0);

    return () => clearTimeout(timer);
  }, [key, setState]);

  useEffect(() => {
    if (!key || !isLoaded.current) return;

    const hasCustomer =
      state?.customerName?.trim() || state?.supplierName?.trim() || state?.formData?.supplier;

    const hasItems =
      state?.items?.some((i) => i.name || i.search || i.productId || i.quantity || i.rate) ||
      state?.paymentEntries?.some((p) => p.account || p.amount);

    if (!hasCustomer && !hasItems) {
      return;
    }

    debouncedSave.current(state);
  }, [key, state]);

  // ✅ cleanup pending save
  useEffect(() => {
    return () => {
      clearTimeout(debounceTimer.current);
    };
  }, []);

  // 🔹 clear function
  const clear = () => {
    clearTimeout(debounceTimer.current);

    if (!key) return;

    localStorage.removeItem(`app_state_${key}`);
  };

  return { clear };
}
