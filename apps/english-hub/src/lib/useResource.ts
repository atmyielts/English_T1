import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export type Resource<T> = {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
};

/**
 * Loads data for a screen. Keeps the last good value while reloading, ignores
 * responses from superseded requests, and skips loading while `enabled` is false.
 */
export const useResource = <T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList,
  enabled = true,
): Resource<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(enabled);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loadRef.current(controller.signal)
      .then((next) => { if (!controller.signal.aborted) setData(next); })
      .catch((cause) => { if (!controller.signal.aborted) setError(cause); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, tick, ...deps]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { data, error, loading, reload };
};

/** Seconds since the component mounted; used to report honest time-on-task. */
export const useElapsedSeconds = (): (() => number) => {
  const started = useRef(Date.now());
  return useCallback(() => Math.max(1, Math.round((Date.now() - started.current) / 1000)), []);
};
