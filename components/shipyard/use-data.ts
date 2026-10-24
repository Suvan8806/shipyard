'use client';
// Client data hooks for the dashboard (pages are client components; see stack-notes on cacheComponents).
import { useCallback, useEffect, useRef, useState } from 'react';

export interface DataState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => Promise<void>;
  /** Replace the data locally (optimistic updates). */
  setData: (updater: T | ((prev: T | null) => T)) => void;
}

/**
 * Loads data once (and again whenever `key` changes). With `pollMs`, refetches on an interval while
 * `shouldPoll(data)` returns true (default: always).
 */
export function useData<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts: { pollMs?: number; shouldPoll?: (data: T | null) => boolean } = {},
): DataState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  const optsRef = useRef(opts);
  useEffect(() => {
    fetcherRef.current = fetcher;
    optsRef.current = opts;
  });

  const refetch = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setDataState(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setLoading(true);
    const tick = async () => {
      let latest: T | null = null;
      try {
        latest = await fetcherRef.current();
        if (cancelled) return;
        setDataState(latest);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (!cancelled) setLoading(false);
      }
      const { pollMs, shouldPoll } = optsRef.current;
      if (!cancelled && pollMs && (shouldPoll ? shouldPoll(latest) : true)) {
        timer = setTimeout(tick, pollMs);
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key]);

  const setData = useCallback((updater: T | ((prev: T | null) => T)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T)(prev) : updater));
  }, []);

  return { data, error, loading, refetch, setData };
}

/** Re-renders every `ms` (for ticking elapsed timers and relative times). */
export function useNow(ms = 1000, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
  return now;
}
