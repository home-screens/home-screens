'use client';

import { useCallback, useEffect, useState } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

export interface EditorData<T> {
  data: T | null;
  error: boolean;
  loading: boolean;
  refetch: () => void;
}

/**
 * One-shot editor-side data load into local state. Built on `editorFetch`
 * (so a 401 redirects to login instead of surfacing here), for the common
 * "GET this endpoint on mount / when the URL changes into some local state"
 * pattern that config sections hand-roll as
 * `editorFetch(url).then(...).catch(() => {})`.
 *
 * NOT a polling hook — for the display side's cached/interval loop use
 * `useFetchData`. Pass `null` to disable: no request fires and `data`/`error`
 * reset. Errors are swallowed into the boolean `error` flag, matching the
 * call sites this replaces (which mostly `.catch(() => {})`). Call `refetch()`
 * to re-run the current URL without changing it (e.g. after a modal closes).
 */
export function useEditorData<T>(url: string | null): EditorData<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  // Bumped by refetch() to re-run the effect without a URL change.
  const [reloadTick, setReloadTick] = useState(0);

  const refetch = useCallback(() => setReloadTick((n) => n + 1), []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(false);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(false);

    editorFetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (controller.signal.aborted) return;
        if (res.ok) {
          const json = (await res.json()) as T;
          if (controller.signal.aborted) return;
          setData(json);
          setError(false);
        } else {
          setError(true);
        }
      })
      .catch((e) => {
        // Intentional aborts (unmount / URL change) aren't errors, and a 401
        // is already redirecting to login — don't flash an error for either.
        if (controller.signal.aborted || isSessionExpired(e)) return;
        setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [url, reloadTick]);

  return { data, error, loading, refetch };
}
