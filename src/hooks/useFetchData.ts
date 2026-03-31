'use client';

import { useEffect, useState } from 'react';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';

export function useFetchData<T>(url: string, refreshMs: number): [T | null, string | null] {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) { setData(null); setError(null); return; }
    const controller = new AbortController();

    async function fetchAndCache() {
      try {
        const res = await displayFetch(url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (res.ok) {
          const json = await res.json();
          setData(json);
          setError(null);
          displayCache.set(url, json, refreshMs);
        } else {
          let msg = `API error ${res.status}`;
          try {
            const body = await res.json();
            if (body.error) msg = body.error;
          } catch {
            // use default message
          }
          setError(msg);
        }
      } catch {
        // Don't set error state for intentional aborts (unmount / URL change)
        if (controller.signal.aborted) return;
        setError('Failed to fetch data');
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
  }, [url, refreshMs]);

  return [data, error];
}
