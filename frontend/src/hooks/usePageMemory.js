// src/hooks/usePageMemory.js

import { useCallback, useMemo } from 'react';
import usePersistentState from './usePersistentState';

const DEFAULT_EXPIRY_HOURS = 24;

const resolveDefaults = (defaults) => {
  return typeof defaults === 'function' ? defaults() : defaults || {};
};

export default function usePageMemory(
  key,
  defaults,
  { enabled = true, expiryHours = DEFAULT_EXPIRY_HOURS, delay = 350 } = {}
) {
  const initialState = useMemo(() => resolveDefaults(defaults), [defaults]);

  const { state, setState, isHydrated, saveNow, clear, reset, reload } = usePersistentState(
    key,
    initialState,
    {
      enabled,
      expiryHours,
      delay,
      type: 'page',
      merge: true,
    }
  );

  const updateField = useCallback(
    (field, value) => {
      if (!field) return;

      setState((previousState) => ({
        ...(previousState || {}),
        [field]: typeof value === 'function' ? value(previousState?.[field]) : value,
      }));
    },
    [setState]
  );

  const updateFields = useCallback(
    (changes) => {
      if (!changes || typeof changes !== 'object') return;

      setState((previousState) => ({
        ...(previousState || {}),
        ...changes,
      }));
    },
    [setState]
  );

  const resetField = useCallback(
    (field) => {
      if (!field) return;

      const defaultValue = initialState?.[field];

      setState((previousState) => ({
        ...(previousState || {}),
        [field]: defaultValue,
      }));
    },
    [initialState, setState]
  );

  const clearAndReset = useCallback(() => {
    clear();
    reset();
  }, [clear, reset]);

  const resetFields = useCallback(
    (fields = []) => {
      if (!Array.isArray(fields) || fields.length === 0) return;

      setState((previousState) => {
        const nextState = {
          ...(previousState || {}),
        };

        fields.forEach((field) => {
          if (!field) return;

          nextState[field] = initialState?.[field];
        });

        return nextState;
      });
    },
    [initialState, setState]
  );

  const preserveFieldsAndReset = useCallback(
    (fieldsToPreserve = []) => {
      const preserved = {};

      fieldsToPreserve.forEach((field) => {
        if (!field) return;

        preserved[field] = state?.[field];
      });

      const nextState = {
        ...initialState,
        ...preserved,
      };

      setState(nextState);
      saveNow(nextState);

      return nextState;
    },
    [initialState, state, setState, saveNow]
  );

  return {
    state: state || initialState,

    setState,

    updateField,

    updateFields,

    resetField,

    resetFields,

    preserveFieldsAndReset,

    clear,

    reset,

    clearAndReset,

    saveNow,

    reload,

    isHydrated,
  };
}
