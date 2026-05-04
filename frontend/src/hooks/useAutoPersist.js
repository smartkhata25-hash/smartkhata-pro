// 📁 src/hooks/useAutoPersist.js

import { useEffect, useRef } from 'react';
import { saveState, loadState, deepMerge, debounce } from '../utils/pageState';

export default function useAutoPersist(key, state, setState) {
  const isLoaded = useRef(false);

  const debouncedSave = useRef(
    debounce((value) => {
      saveState(key, value);
    }, 500)
  ).current;

  // 🔹 LOAD (پہلی بار)
  useEffect(() => {
    const saved = loadState(key, null);

    if (saved && typeof saved === 'object') {
      setState((prev) => deepMerge(prev || {}, saved));
    }

    isLoaded.current = true;
  }, [key, setState]);

  // 🔹 SAVE (ہر change پر)
  useEffect(() => {
    if (!isLoaded.current) return;

    debouncedSave(state);
  }, [state, debouncedSave]);

  // 🔹 clear function
  const clear = () => {
    saveState(key, null);
  };

  return { clear };
}
