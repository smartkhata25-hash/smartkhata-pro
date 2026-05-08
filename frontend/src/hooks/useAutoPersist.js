// 📁 src/hooks/useAutoPersist.js

import { useEffect, useRef } from 'react';
import { saveState, loadState, deepMerge, debounce } from '../utils/pageState';

export default function useAutoPersist(key, state, setState) {
  const isLoaded = useRef(false);

  const debouncedSave = useRef(
    debounce((value) => {
      console.log('💾 SAVING STATE FULL:', JSON.stringify(value, null, 2));

      saveState(key, value);
    }, 500)
  ).current;

  // 🔹 LOAD (پہلی بار)
  useEffect(() => {
    const saved = loadState(key, null);

    console.log('📥 LOADED STATE FULL:', JSON.stringify(saved, null, 2));

    if (saved && typeof saved === 'object') {
      setState((prev) => deepMerge(prev || {}, saved));
    }

    isLoaded.current = true;
  }, [key, setState]);

  // 🔹 SAVE (ہر change پر)
  useEffect(() => {
    if (!isLoaded.current) return;

    const hasCustomer =
      state?.customerName?.trim() || state?.supplierName?.trim() || state?.formData?.supplier;

    const hasItems =
      state?.items?.some((i) => i.name || i.search || i.productId || i.quantity || i.rate) ||
      state?.paymentEntries?.some((p) => p.account || p.amount);

    if (!hasCustomer && !hasItems) {
      return;
    }

    debouncedSave(state);
  }, [state, debouncedSave]);

  // 🔹 clear function
  const clear = () => {
    saveState(key, null);
  };

  return { clear };
}
