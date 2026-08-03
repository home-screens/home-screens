'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';

/** How long a fetched status stays fresh — hooks mounting inside this window
 *  reuse the cached result instead of issuing another GET. */
const SECRET_STATUS_TTL_MS = 15_000;

// Stable identity so `status` can sit in useMemo/useEffect deps while empty.
const EMPTY: Record<string, boolean> = {};

export interface SecretStatusResult {
  /** Configured flag per secret key ({} until the first response lands). */
  status: Record<string, boolean>;
  /** True only until the first response or failure ever lands. Once any
   *  response has arrived, later refetches update in place — consumers'
   *  loading UIs never re-enter. */
  loading: boolean;
  /** True when the most recent request failed (the last good status, if any,
   *  stays visible). */
  error: boolean;
  refetch: () => void;
}

interface StoreState {
  status: Record<string, boolean>;
  responded: boolean;
  error: boolean;
}

// Module-scoped store: all mounted hooks share one cache and one in-flight
// request, so an editor screen with several secret-gated panels issues a
// single GET /api/secrets instead of one per component. A refetch() from any
// consumer (e.g. SecretField's onSaved) updates every consumer.
let state: StoreState = { status: EMPTY, responded: false, error: false };
let fetchedAt = 0;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: StoreState) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return state;
}

function refresh(force: boolean): void {
  if (inFlight) {
    // A forced refresh during an in-flight request must not be dropped — the
    // in-flight response may predate the write that triggered it.
    if (force) inFlight.then(() => refresh(true));
    return;
  }
  if (!force && fetchedAt && Date.now() - fetchedAt < SECRET_STATUS_TTL_MS) return;
  inFlight = (async () => {
    try {
      const res = await editorFetch('/api/secrets');
      if (res.ok) {
        setState({ status: await res.json(), responded: true, error: false });
      } else {
        setState({ ...state, responded: true, error: true });
      }
    } catch (e) {
      // A 401 is already redirecting to login; don't surface it as an error.
      if (!isSessionExpired(e)) setState({ ...state, responded: true, error: true });
    } finally {
      fetchedAt = Date.now();
      inFlight = null;
    }
  })();
}

/** Test-only: clear the module-level cache so specs start cold. */
export function __resetSecretStatusForTests(): void {
  state = { status: EMPTY, responded: false, error: false };
  fetchedAt = 0;
  inFlight = null;
}

/**
 * Configured/not-configured status for every API key, from `GET /api/secrets`
 * (booleans only — the endpoint never returns secret values). The one shared
 * read path for secret status; writes stay in `SecretField`.
 *
 * Pass `enabled: false` to opt a consumer out (e.g. a modal mode that never
 * shows key-gated UI): it triggers no request and reads `{}` / `loading:
 * false` regardless of what the shared cache holds.
 */
export function useSecretStatus(enabled = true): SecretStatusResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (enabled) refresh(false);
  }, [enabled]);

  const refetch = useCallback(() => refresh(true), []);

  if (!enabled) {
    return { status: EMPTY, loading: false, error: false, refetch };
  }
  return {
    status: snap.status,
    loading: !snap.responded,
    error: snap.error,
    refetch,
  };
}
