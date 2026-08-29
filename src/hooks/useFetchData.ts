'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';

/**
 * Fetch + poll a display data URL. Returns [data, error, updatedAt].
 *
 * `data` keeps the last successful payload across failed refreshes (a Wi-Fi
 * blip must never blank a module); `error` is set while the latest attempt
 * failed, so consumers can mark the kept data as stale; `updatedAt` is when
 * the kept data was last successfully fetched (cache restores carry the
 * cache's original fetch time).
 *
 * A different `url` is a different dataset: the kept payload is dropped (and
 * restored from the display cache when that URL has one) so a module never
 * renders the new request's shape against the old request's data.
 */
export function useFetchData<T>(url: string, refreshMs: number): [T | null, string | null, number | null] {
  const t = useTranslate('core');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastUrl = useRef(url);

  useEffect(() => {
    if (!url) { setData(null); setError(null); setUpdatedAt(null); lastUrl.current = url; return; }
    if (lastUrl.current !== url) {
      // Only on a real URL change, not on a refreshMs/translator re-run,
      // so a settings tweak never blinks a module that keeps its URL.
      lastUrl.current = url;
      setData(null);
      setError(null);
      setUpdatedAt(null);
    }
    const controller = new AbortController();

    async function fetchAndCache() {
      try {
        const res = await displayFetch(url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setError(null);
          setUpdatedAt(Date.now());
          displayCache.set(url, json, refreshMs);
        } else {
          let msg = `API error ${res.status}`;
          try {
            const body = await res.json();
            if (body.error) msg = body.error;
            if (body.detail) msg = `${msg}: ${body.detail}`;
          } catch {
            // use default message
          }
          setError(msg);
        }
      } catch {
        // Don't set error state for intentional aborts (unmount / URL change)
        if (controller.signal.aborted) return;
        setError(t('errors.fetchFailed'));
      }
    }

    // Re-fetch immediately when this URL's cache is invalidated
    function onInvalidate(e: Event) {
      if ((e as CustomEvent).detail === url) fetchAndCache();
    }
    window.addEventListener('displaycache:invalidate', onInvalidate);

    // Check cache INSIDE the effect (not at render time) to avoid stale closures
    const cached = displayCache.get<T>(url);
    if (cached) {
      setData(cached.data);
      setError(null);
      setUpdatedAt(cached.fetchedAt);
      if (!cached.stale) {
        // Fresh cache — skip initial fetch, just set up polling
        const interval = setInterval(fetchAndCache, refreshMs);
        return () => { controller.abort(); clearInterval(interval); window.removeEventListener('displaycache:invalidate', onInvalidate); };
      }
      // Stale cache — show stale data, revalidate in background
    }

    // Cold start or stale: fetch now
    fetchAndCache();
    const interval = setInterval(fetchAndCache, refreshMs);
    return () => { controller.abort(); clearInterval(interval); window.removeEventListener('displaycache:invalidate', onInvalidate); };
  }, [url, refreshMs, t]);

  return [data, error, updatedAt];
}
