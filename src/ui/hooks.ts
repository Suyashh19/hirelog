import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { getVersion, subscribe } from '../db/repo';

/** Re-runs a synchronous SQLite query whenever any local write happens. */
export function useLive<T>(fn: () => T, deps: unknown[] = []): T {
  const v = useSyncExternalStore(subscribe, getVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cb = useCallback(fn, deps);
  const [, setTick] = useState(0);
  useEffect(() => setTick((x) => x + 1), [v]);
  return cb();
}

/** Ticks every second while `active`, for running timers. */
export function useNow(active = true) {
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(i);
  }, [active]);
  return t;
}
