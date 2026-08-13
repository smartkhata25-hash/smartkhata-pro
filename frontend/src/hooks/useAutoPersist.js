// src/hooks/useAutoPersist.js

import { useCallback, useEffect, useRef } from 'react';

import { saveState, loadState, clearState, deepMerge } from '../utils/pageState';

const DEFAULT_DELAY = 500;
const DEFAULT_EXPIRY_HOURS = 24;

export default function useAutoPersist(
  key,
  state,
  setState,
  {
    enabled = true,
    delay = DEFAULT_DELAY,
    expiryHours = DEFAULT_EXPIRY_HOURS,
    type = 'draft',
    shouldSave = null,
  } = {}
) {
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef(null);

  const latestStateRef = useRef(state);
  const latestKeyRef = useRef(key);
  const latestEnabledRef = useRef(enabled);
  const latestShouldSaveRef = useRef(shouldSave);

  const dirtyRef = useRef(false);
  const clearedRef = useRef(false);

  latestStateRef.current = state;
  latestKeyRef.current = key;
  latestEnabledRef.current = enabled;
  latestShouldSaveRef.current = shouldSave;

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const canSaveValue = useCallback((value) => {
    const validator = latestShouldSaveRef.current;

    if (typeof validator === 'function') {
      return Boolean(validator(value));
    }

    return true;
  }, []);

  const persistLatestState = useCallback(() => {
    const activeKey = latestKeyRef.current;

    if (!latestEnabledRef.current || !activeKey) {
      return false;
    }

    if (!hydratedRef.current) {
      return false;
    }

    if (clearedRef.current) {
      return false;
    }

    const latestState = latestStateRef.current;

    if (!canSaveValue(latestState)) {
      return false;
    }

    const saved = saveState(activeKey, latestState, {
      expiryHours,
      type,
    });

    if (saved) {
      dirtyRef.current = false;
    }

    return saved;
  }, [canSaveValue, expiryHours, type]);

  useEffect(() => {
    cancelPendingSave();

    hydratedRef.current = false;
    dirtyRef.current = false;
    clearedRef.current = false;

    if (!enabled || !key) {
      return undefined;
    }

    const saved = loadState(key, null, {
      expiryHours,
    });

    if (saved !== null && saved !== undefined && typeof setState === 'function') {
      setState((previousState) => {
        if (
          previousState &&
          saved &&
          typeof previousState === 'object' &&
          typeof saved === 'object' &&
          !Array.isArray(previousState) &&
          !Array.isArray(saved)
        ) {
          return deepMerge(previousState, saved);
        }

        return saved;
      });
    }

    hydratedRef.current = true;

    return undefined;
  }, [key, enabled, expiryHours, setState, cancelPendingSave]);

  useEffect(() => {
    latestStateRef.current = state;

    if (!enabled || !key || !hydratedRef.current) {
      return undefined;
    }

    const validForSave = canSaveValue(state);

    if (!validForSave) {
      dirtyRef.current = false;
      cancelPendingSave();
      return undefined;
    }

    clearedRef.current = false;
    dirtyRef.current = true;

    cancelPendingSave();

    saveTimerRef.current = setTimeout(
      () => {
        persistLatestState();
        saveTimerRef.current = null;
      },
      Math.max(0, Number(delay) || DEFAULT_DELAY)
    );

    return () => {
      cancelPendingSave();
    };
  }, [key, state, enabled, delay, canSaveValue, persistLatestState, cancelPendingSave]);

  const saveNow = useCallback(
    (value = latestStateRef.current) => {
      const activeKey = latestKeyRef.current;

      if (!latestEnabledRef.current || !activeKey) {
        return false;
      }

      cancelPendingSave();

      if (!canSaveValue(value)) {
        return false;
      }

      clearedRef.current = false;

      const saved = saveState(activeKey, value, {
        expiryHours,
        type,
      });

      if (saved) {
        dirtyRef.current = false;
      }

      return saved;
    },
    [expiryHours, type, canSaveValue, cancelPendingSave]
  );

  const clear = useCallback(() => {
    const activeKey = latestKeyRef.current;

    cancelPendingSave();

    dirtyRef.current = false;
    clearedRef.current = true;

    if (!activeKey) {
      return false;
    }

    return clearState(activeKey);
  }, [cancelPendingSave]);

  useEffect(() => {
    const flushBeforeLeaving = () => {
      if (!dirtyRef.current) return;
      if (clearedRef.current) return;

      cancelPendingSave();
      persistLatestState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushBeforeLeaving();
      }
    };

    window.addEventListener('pagehide', flushBeforeLeaving);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushBeforeLeaving);

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      if (dirtyRef.current && !clearedRef.current) {
        cancelPendingSave();
        persistLatestState();
      } else {
        cancelPendingSave();
      }
    };
  }, [persistLatestState, cancelPendingSave]);

  return {
    clear,
    saveNow,
    isHydrated: () => hydratedRef.current,
  };
}
