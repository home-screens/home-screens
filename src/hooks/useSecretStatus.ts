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
  /** True once any successful response has landed. During a later failed
   *  refetch (`error` true) `status` still holds that last good snapshot,
   *  so consumers should keep trusting it — treat only
   *  `error && !hasStatus` as "status unknown". */
  hasStatus: boolean;
  refetch: () => void;
}

interface StoreState {
  status: Record<string, boolean>;
  responded: boolean;
  error: boolean;
  succeeded: boolean;
}

// Module-scoped store: all mounted hooks share one cache and one in-flight
// request, so an editor screen with several secret-gated panels issues a
// single GET /api/secrets instead of one per component. A refetch() from any
// consumer (e.g. SecretField's onSaved) updates every consumer.
let state: StoreState = { status: EMPTY, responded: false, error: false, succeeded: false };
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

function statusEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k]);
}

function markFailed(): void {
  // Repeated failures keep the same state object — no listener churn — and
  // the last good status (if any) stays in place under the error flag.
  if (!state.responded || !state.error) setState({ ...state, responded: true, error: true });
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
        const status: Record<string, boolean> = await res.json();
        // Skip the publish when nothing changed: consumers keep the same
        // status object identity, so memos and effects keyed on it (e.g.
        // usePreviewData's weather fan-out) don't re-fire on a refetch that
        // confirmed the same keys.
        if (!state.succeeded || state.error || !statusEqual(status, state.status)) {
          setState({ status, responded: true, error: false, succeeded: true });
        }
        // Only a success refreshes the TTL: a failure must not serve an
        // authoritative empty status to consumers mounting inside the
        // window — they should get to retry.
        fetchedAt = Date.now();
      } else {
        markFailed();
      }
    } catch (e) {
      // A 401 is already redirecting to login; don't surface it as an error.
      if (!isSessionExpired(e)) markFailed();
    } finally {
      inFlight = null;
    }
  })();
}

/** Test-only: clear the module-level cache so specs start cold. */
export function __resetSecretStatusForTests(): void {
  state = { status: EMPTY, responded: false, error: false, succeeded: false };
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
    return { status: EMPTY, loading: false, error: false, hasStatus: false, refetch };
  }
  return {
    status: snap.status,
    loading: !snap.responded,
    error: snap.error,
    hasStatus: snap.succeeded,
    refetch,
  };
}
