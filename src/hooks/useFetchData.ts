'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { readFetchError, sameFetchError, transientError, type FetchError } from '@/lib/fetch-error';
import { logger } from '@/lib/logger';

const log = logger('fetch-data');

/**
 * Fetch + poll a display data URL. Returns [data, error, updatedAt].
 *
 * `data` keeps the last successful payload across failed refreshes (a Wi-Fi
 * blip must never blank a module); `error` is set while the latest attempt
 * failed, so consumers can mark the kept data as stale. It is classified
 * (see `FetchError`): `setup` when the route says the household still has to
 * add a key or connect a service, `transient` for everything else, so the
 * wall can render a setup card for one and stay quiet for the other.
 * `updatedAt` is when
 * the kept data was last successfully fetched (cache restores carry the
 * cache's original fetch time).
 *
 * A different `url` is a different dataset: the kept payload is dropped (and
 * restored from the display cache when that URL has one) so a module never
 * renders the new request's shape against the old request's data. The
 * exception is a URL change within one `datasetKey`: URLs sharing a key are
 * the same feed asked for a different slice (the calendar's date window
 * advances at midnight), so the change is treated like a poll and the kept
 * payload, its fetch time and any standing error carry over. Without that, a
 * day rollover during an outage dropped the events the display already
 * held and showed "can't load" until the hub came back.
 */
export function useFetchData<T>(
  url: string,
  refreshMs: number,
  datasetKey?: string,
): [T | null, FetchError | null, number | null] {
  const t = useTranslate('core');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const lastUrl = useRef(url);
  // Read through a ref so a key change alone never re-runs the effect; it is
  // only consulted at the moment the URL changes.
  const lastDatasetKey = useRef(datasetKey);
  const currentDatasetKey = useRef(datasetKey);
  currentDatasetKey.current = datasetKey;

  useEffect(() => {
    if (!url) {
      setData(null); setError(null); setUpdatedAt(null);
      lastUrl.current = url;
      lastDatasetKey.current = currentDatasetKey.current;
      return;
    }
    if (lastUrl.current !== url) {
      // Only on a real URL change, not on a refreshMs/translator re-run,
      // so a settings tweak never blinks a module that keeps its URL.
      const key = currentDatasetKey.current;
      const sameDataset = key !== undefined && key === lastDatasetKey.current;
      lastUrl.current = url;
      lastDatasetKey.current = key;
      if (!sameDataset) {
        setData(null);
        setError(null);
        setUpdatedAt(null);
      }
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
          fail(await readFetchError(res, `API error ${res.status}`));
        }
      } catch {
        // Don't set error state for intentional aborts (unmount / URL change)
        if (controller.signal.aborted) return;
        fail(transientError(t('errors.fetchFailed')));
      }
    }

    // The wall never prints the developer-facing message, so it is logged
    // here (once per distinct failure, not per poll). The same identity
    // check keeps a repeated failure from re-rendering the whole display:
    // an unchanged error keeps its previous state object.
    function fail(next: FetchError) {
      setError((prev) => {
        if (sameFetchError(prev, next)) return prev;
        log.warn(`${url}: ${next.message}`);
        return next;
      });
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
