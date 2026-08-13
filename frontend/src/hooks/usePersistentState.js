// src/hooks/usePersistentState.js

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  savePersistedState,
  loadPersistedState,
  clearPersistedState,
  deepMergeState,
} from '../utils/persistStorage';

const DEFAULT_DELAY = 400;
const DEFAULT_EXPIRY_HOURS = 24;

const resolveInitialValue = (initialValue) => {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
};

const mergeSavedState = (initialValue, savedValue, merge) => {
  if (savedValue === null || savedValue === undefined) {
    return initialValue;
  }

  if (
    merge &&
    initialValue &&
    savedValue &&
    typeof initialValue === 'object' &&
    typeof savedValue === 'object' &&
    !Array.isArray(initialValue) &&
    !Array.isArray(savedValue)
  ) {
    return deepMergeState(initialValue, savedValue);
  }

  return savedValue;
};

export default function usePersistentState(
  key,
  initialValue,
  {
    enabled = true,
    expiryHours = DEFAULT_EXPIRY_HOURS,
    delay = DEFAULT_DELAY,
    type = 'page',
    merge = true,
  } = {}
) {
  const initialValueRef = useRef(resolveInitialValue(initialValue));
  const saveTimerRef = useRef(null);

  const latestStateRef = useRef(null);
  const latestKeyRef = useRef(key);
  const dirtyRef = useRef(false);
  const clearedRef = useRef(false);

  const getHydratedValue = useCallback(
    (storageKey = key) => {
      const defaults = initialValueRef.current;

      if (!enabled || !storageKey) {
        return defaults;
      }

      const saved = loadPersistedState(storageKey, null, {
        expiryHours,
      });

      return mergeSavedState(defaults, saved, merge);
    },
    [key, enabled, expiryHours, merge]
  );

  const [state, setInternalState] = useState(() => getHydratedValue(key));

  const [isHydrated, setIsHydrated] = useState(true);

  latestStateRef.current = state;
  latestKeyRef.current = key;

  const cancelPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, []);

  const persistValue = useCallback(
    (value, storageKey = latestKeyRef.current) => {
      if (!enabled || !storageKey || clearedRef.current) {
        return false;
      }

      const saved = savePersistedState(storageKey, value, {
        expiryHours,
        type,
      });

      if (saved) {
        dirtyRef.current = false;
      }

      return saved;
    },
    [enabled, expiryHours, type]
  );

  const previousKeyRef = useRef(key);

  useEffect(() => {
    if (previousKeyRef.current === key) {
      return;
    }

    cancelPendingSave();

    previousKeyRef.current = key;
    latestKeyRef.current = key;

    clearedRef.current = false;
    dirtyRef.current = false;

    setIsHydrated(false);

    const nextState = getHydratedValue(key);

    latestStateRef.current = nextState;
    setInternalState(nextState);

    setIsHydrated(true);
  }, [key, getHydratedValue, cancelPendingSave]);

  useEffect(() => {
    if (!enabled || !key || !isHydrated) {
      return undefined;
    }

    latestStateRef.current = state;

    if (clearedRef.current) {
      return undefined;
    }

    dirtyRef.current = true;

    cancelPendingSave();

    saveTimerRef.current = setTimeout(
      () => {
        persistValue(state, key);
        saveTimerRef.current = null;
      },
      Math.max(0, Number(delay) || DEFAULT_DELAY)
    );

    return cancelPendingSave;
  }, [key, state, enabled, delay, isHydrated, persistValue, cancelPendingSave]);

  const update = useCallback((value) => {
    clearedRef.current = false;

    setInternalState((previousState) => {
      const nextState = typeof value === 'function' ? value(previousState) : value;

      latestStateRef.current = nextState;

      return nextState;
    });
  }, []);

  const saveNow = useCallback(
    (value = latestStateRef.current) => {
      if (!enabled || !key) {
        return false;
      }

      cancelPendingSave();

      clearedRef.current = false;

      return persistValue(value, key);
    },
    [key, enabled, persistValue, cancelPendingSave]
  );

  const clear = useCallback(() => {
    cancelPendingSave();

    dirtyRef.current = false;
    clearedRef.current = true;

    if (!key) {
      return false;
    }

    return clearPersistedState(key);
  }, [key, cancelPendingSave]);

  const reset = useCallback(() => {
    cancelPendingSave();

    if (key) {
      clearPersistedState(key);
    }

    const nextValue = resolveInitialValue(initialValueRef.current);

    clearedRef.current = false;
    dirtyRef.current = true;

    latestStateRef.current = nextValue;
    setInternalState(nextValue);

    return nextValue;
  }, [key, cancelPendingSave]);

  const reload = useCallback(() => {
    cancelPendingSave();

    setIsHydrated(false);

    const nextState = getHydratedValue(key);

    clearedRef.current = false;
    dirtyRef.current = false;

    latestStateRef.current = nextState;
    setInternalState(nextState);

    setIsHydrated(true);

    return nextState;
  }, [key, getHydratedValue, cancelPendingSave]);

  useEffect(() => {
    const flushLatestState = () => {
      if (!dirtyRef.current) return;
      if (clearedRef.current) return;
      if (!latestKeyRef.current) return;

      cancelPendingSave();

      persistValue(latestStateRef.current, latestKeyRef.current);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushLatestState();
      }
    };

    window.addEventListener('pagehide', flushLatestState);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pagehide', flushLatestState);

      document.removeEventListener('visibilitychange', handleVisibilityChange);

      flushLatestState();
    };
  }, [persistValue, cancelPendingSave]);

  return useMemo(
    () => ({
      state,
      setState: update,
      isHydrated,
      saveNow,
      clear,
      reset,
      reload,
    }),
    [state, update, isHydrated, saveNow, clear, reset, reload]
  );
}
