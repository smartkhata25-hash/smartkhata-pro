// src/hooks/useFormPersist.js

import { useCallback, useEffect, useRef } from 'react';
import useAutoPersist from './useAutoPersist';

const DEFAULT_EXPIRY_HOURS = 24;
const DEFAULT_DELAY = 500;

export default function useFormPersist(
  key,
  formState,
  setFormState,
  {
    enabled = true,
    expiryHours = DEFAULT_EXPIRY_HOURS,
    delay = DEFAULT_DELAY,
    shouldSave = null,
  } = {}
) {
  const setterRef = useRef(setFormState);

  useEffect(() => {
    setterRef.current = setFormState;
  }, [setFormState]);

  const stableSetter = useCallback((value) => {
    if (typeof setterRef.current === 'function') {
      setterRef.current(value);
    }
  }, []);

  const { clear, saveNow, isHydrated } = useAutoPersist(key, formState, stableSetter, {
    enabled,
    expiryHours,
    delay,
    type: 'draft',
    shouldSave,
  });

  return {
    clear,
    saveNow,
    isHydrated,
  };
}
