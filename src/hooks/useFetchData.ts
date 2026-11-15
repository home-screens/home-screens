'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslate } from '@/i18n';
import { answerRevision, displayCache } from '@/lib/display-cache';
import { displayFetch } from '@/lib/display-fetch';
import { followedRevision, subscribeRevisions } from '@/lib/display-heartbeat';
import { readFetchError, sameFetchError, transientError, type FetchError } from '@/lib/fetch-error';
import { logger } from '@/lib/logger';

const log = logger('fetch-data');

/**
 * One network request per URL, however many modules want it.
 *
 * Every instance of a module polls on its own interval, and several cards can
 * follow the same feed (three to-do lists, two chore charts). Mounted
 * together they poll together, so without this the hub answers the same
 * question three times every few seconds. Subscribers share whichever request
 * is already in flight and each applies the result to its own state.
 *
 * The shared request is deliberately not abortable by one subscriber: another
 * may still be waiting on it, and the answer is worth caching either way.
 * Unmounted subscribers drop the result instead (see the `aborted` checks).
 *
 * The answer is stored through `displayCache.storeBody`, so one with the same
 * bytes as the last hands back the object already on screen: a poll that
 * changed nothing re-renders nothing.
 */
type SharedResult =
  | { kind: 'ok'; json: unknown }
  | { kind: 'http'; res: Response }
  | { kind: 'network' };

interface SharedRequest {
  promise: Promise<SharedResult>;
  invalidated: boolean;
}
const inFlight = new Map<string, SharedRequest>();
// Every subscriber receives the same invalidation event. Only the first one
// supersedes the old request; the rest join its newly started replacement.
const handledInvalidations = new WeakSet<Event>();

function sharedFetch(url: string, ttlMs: number, timeoutMs: number | undefined): SharedRequest {
  const existing = inFlight.get(url);
  if (existing) return existing;
  // The beat this request answers, taken before it goes out, for an answer
  // that does not carry its own revision (`answerRevision`).
  const revision = followedRevision(url);
  const request = { invalidated: false } as SharedRequest;
  request.promise = (async (): Promise<SharedResult> => {
    try {
      const res = await (timeoutMs === undefined ? displayFetch(url) : displayFetch(url, { timeoutMs }));
      if (!res.ok) return { kind: 'http', res };
      const body = await res.text();
      // A write published newer data while this downloaded (`onReplace`):
      // every subscriber drops this answer, and so must the cache.
      if (request.invalidated) return { kind: 'network' };
      return { kind: 'ok', json: displayCache.storeBody(url, body, ttlMs, answerRevision(res, revision)) };
    } catch {
      return { kind: 'network' };
    }
  })().finally(() => {
    // A superseded request can finish after its replacement has started.
    if (inFlight.get(url) === request) inFlight.delete(url);
  });
  inFlight.set(url, request);
  return request;
}

export interface FetchDataOptions {
  /**
   * URLs sharing a key are one dataset asked for different slices (see
   * below): changing between them keeps the kept payload.
   */
  datasetKey?: string;
  /**
   * Move `updatedAt` on every successful fetch, not only when the data
   * changes. For the plugin SDK, whose modules may print it; it costs a
   * render per poll.
   */
  stampEveryFetch?: boolean;
  /**
   * Stop polling for now and keep what is on screen. Lifting it fetches at
   * once when the cached answer has gone stale, so data a sleeping wall
   * stopped asking for is current again the moment it wakes.
   */
  paused?: boolean;
  /**
   * How long one request may take, for a read the hub cannot always answer
   * inside `DISPLAY_FETCH_TIMEOUT_MS` (a photo list whose album the hub has
   * to read from the cloud first). Subscribers to one URL share a request,
   * so they should agree on this.
   */
  timeoutMs?: number;
}

/**
 * How soon a card with nothing to show asks again after a failed read, one
 * entry per try. A card that has data keeps it through a failure and can
 * wait for its next poll, but an empty one would otherwise say "not updating"
 * for a whole refresh (ten minutes for photos) over a blip, or over a read
 * the hub was still finishing when the request gave up. Three tries, then
 * back to the poll, so a service that stays down is not asked any faster
 * than that for long.
 */
export const EMPTY_HANDED_RETRY_MS = [5_000, 15_000, 45_000];

/**
 * Fetch + poll a display data URL. Returns [data, error, updatedAt].
 *
 * `data` keeps the last successful payload across failed refreshes (a Wi-Fi
 * blip must never blank a module); `error` is set while the latest attempt
 * failed, so consumers can mark the kept data as stale. It is classified
 * (see `FetchError`): `setup` when the route says the household still has to
 * add a key or connect a service, `transient` for everything else, so the
 * wall can render a setup card for one and stay quiet for the other.
 *
 * `data` keeps its identity while the answer's bytes do not change, and
 * `updatedAt` is when the data on screen was fetched: it moves when the data
 * changes and, once a failure starts, says when the last fetch that worked
 * was (cache restores carry the cache's original fetch time). A poll that
 * changed nothing therefore renders nothing, which on a wall is most of them.
 *
 * A read the wall's heartbeat reports on (`followedRevision`: the chore
 * history and rewards) is fetched when the beat names a revision the cache
 * does not hold, instead of every `refreshMs`. Where no beat arrives (the
 * editor, or a heartbeat that stopped answering) it polls as usual.
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
  options: FetchDataOptions = {},
): [T | null, FetchError | null, number | null] {
  const { datasetKey, stampEveryFetch = false, paused = false, timeoutMs } = options;
  const t = useTranslate('core');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<FetchError | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  // What `data`, `updatedAt` and `error` would say if they moved on every
  // fetch; state follows them only when something on screen has to change.
  const shown = useRef<T | null>(null);
  const lastSuccessAt = useRef<number | null>(null);
  const failing = useRef(false);
  const lastUrl = useRef(url);
  // Read through a ref so a key change alone never re-runs the effect; it is
  // only consulted at the moment the URL changes.
  const lastDatasetKey = useRef(datasetKey);
  const currentDatasetKey = useRef(datasetKey);
  currentDatasetKey.current = datasetKey;
  const stampRef = useRef(stampEveryFetch);
  stampRef.current = stampEveryFetch;

  useEffect(() => {
    // Early tries made since the last answer (`EMPTY_HANDED_RETRY_MS`).
    let earlyRetries = 0;
    let earlyRetry: ReturnType<typeof setTimeout> | undefined;

    /** Show `next` as data fetched (or published) at `at`, with no failure standing. */
    function show(next: T | null, at: number | null) {
      earlyRetries = 0;
      clearTimeout(earlyRetry);
      const changed = next !== shown.current;
      lastSuccessAt.current = at;
      failing.current = false;
      shown.current = next;
      if (changed) setData(next);
      if (changed || stampRef.current) setUpdatedAt(at);
      setError(null);
    }

    if (!url) {
      show(null, null);
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
      if (!sameDataset) show(null, null);
    }
    const controller = new AbortController();

    async function fetchAndCache() {
      const request = sharedFetch(url, refreshMs, timeoutMs);
      const result = await request.promise;
      // Unmounted, or pointed at another URL, while the request was out.
      if (controller.signal.aborted || request.invalidated) return;
      if (result.kind === 'ok') {
        show(result.json as T, Date.now());
        return;
      }
      if (result.kind === 'http') {
        // Cloned: subscribers sharing this response each read its body.
        const failure = await readFetchError(result.res.clone(), `API error ${result.res.status}`);
        if (!controller.signal.aborted && !request.invalidated) fail(failure);
        return;
      }
      fail(transientError(t('errors.fetchFailed')));
    }

    // The wall never prints the developer-facing message, so it is logged
    // here (once per distinct failure, not per poll). The same identity
    // check keeps a repeated failure from re-rendering the whole display:
    // an unchanged error keeps its previous state object.
    function fail(next: FetchError) {
      // From the first failed attempt on, `updatedAt` says when the kept
      // data was last fetched, however long it went unchanged before.
      if (!failing.current) {
        failing.current = true;
        setUpdatedAt(lastSuccessAt.current);
      }
      setError((prev) => {
        if (sameFetchError(prev, next)) return prev;
        log.warn(`${url}: ${next.message}`);
        return next;
      });
      // Nothing to show, and nothing the household has to fix first: ask
      // again soon instead of at the next poll.
      const worthAnEarlyTry = shown.current === null && next.kind === 'transient' && next.reason !== 'gone';
      if (worthAnEarlyTry && !paused && earlyRetries < EMPTY_HANDED_RETRY_MS.length) {
        clearTimeout(earlyRetry);
        earlyRetry = setTimeout(fetchAndCache, EMPTY_HANDED_RETRY_MS[earlyRetries++]);
      }
    }

    // Re-fetch immediately when this URL's cache is invalidated
    function onInvalidate(e: Event) {
      if ((e as CustomEvent).detail !== url) return;
      if (!handledInvalidations.has(e)) {
        handledInvalidations.add(e);
        const previous = inFlight.get(url);
        if (previous) previous.invalidated = true;
        inFlight.delete(url);
      }
      fetchAndCache();
    }
    // Asked to read again because a newer revision of this read exists
    // (`displayCache.refreshWhere`). Nothing is superseded: a read already
    // out is joined, since its answer says which revision it is at.
    // Cancelling tells the cache a reader took it on, so the entry is kept
    // until an answer replaces it.
    function onRefresh(e: Event) {
      if ((e as CustomEvent).detail !== url) return;
      e.preventDefault();
      fetchAndCache();
    }
    // A write's response is newer than any poll still out for this URL. That
    // poll may have started before the write and answer after it, and its
    // older snapshot must not land on top of what the write just published.
    // Superseding is idempotent, so every subscriber may do it.
    function onReplace(event: Event) {
      const replacement = (event as CustomEvent<{ url: string; data: T; at: number }>).detail;
      if (replacement.url !== url) return;
      const previous = inFlight.get(url);
      if (previous) {
        previous.invalidated = true;
        inFlight.delete(url);
      }
      show(replacement.data, replacement.at);
    }
    window.addEventListener('displaycache:invalidate', onInvalidate);
    window.addEventListener('displaycache:refresh', onRefresh);
    window.addEventListener('displaycache:replace', onReplace);
    // A beat that names a revision the cache does not hold is this read's
    // "something changed". Reads the heartbeat does not report on ignore it.
    // A cache that is current can still hold data this card never showed: a
    // prefetch, or another card's read, stored it while this card's own read
    // was failing. The beat is when it takes that over.
    const unsubscribe = subscribeRevisions(() => {
      if (followedRevision(url) === undefined) return;
      if (displayCache.isStale(url)) {
        fetchAndCache();
        return;
      }
      const held = displayCache.peek<T>(url);
      if (held && held.data !== shown.current) show(held.data, held.fetchedAt);
    });
    // While beats name this read, they decide when it is fetched.
    const interval = paused ? undefined : setInterval(() => {
      if (followedRevision(url) === undefined) fetchAndCache();
    }, refreshMs);

    // Check cache INSIDE the effect (not at render time) to avoid stale closures
    const cached = displayCache.get<T>(url);
    if (cached) show(cached.data, cached.fetchedAt);
    // Cold start or stale: fetch now. A stale entry stays on screen meanwhile.
    if (!paused && (!cached || cached.stale)) fetchAndCache();

    return () => {
      controller.abort();
      clearTimeout(earlyRetry);
      if (interval) clearInterval(interval);
      unsubscribe();
      window.removeEventListener('displaycache:invalidate', onInvalidate);
      window.removeEventListener('displaycache:refresh', onRefresh);
      window.removeEventListener('displaycache:replace', onReplace);
    };
  }, [url, refreshMs, t, paused, timeoutMs]);

  return [data, error, updatedAt];
}
