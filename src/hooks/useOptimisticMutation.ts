'use client';

import { useCallback, useRef } from 'react';

export interface OptimisticOps {
  /** Apply the optimistic overlay change synchronously (before the request). */
  apply: () => void;
  /** Fire the request. Must throw (reject) on failure so rollback runs. */
  request: () => Promise<void>;
  /** Undo the optimistic change. Receives the error that triggered rollback. */
  rollback: (error: unknown) => void;
}

/**
 * Runs a single-key optimistic mutation: apply the optimistic UI change, fire
 * the async request, and roll that key's change back if the request throws.
 * An in-flight `Set` dedupes repeat actions for a key already mid-request
 * (double-tap guard).
 *
 * The hook owns ONLY the apply → request → rollback orchestration and the
 * in-flight dedup — the parts `TodoModule` and `TodoistModule` genuinely share.
 * Each caller keeps its own overlay shape (boolean override map vs hidden-id
 * set) and its own reconciliation against polled data; those embody different
 * concurrency models and stay in the modules where they're legible.
 *
 * `pending` is exposed so a caller's poll-reconcile effect can preserve the
 * optimistic value of keys still in flight.
 */
export function useOptimisticMutation() {
  const pending = useRef<Set<string>>(new Set());

  const run = useCallback(async (key: string, ops: OptimisticOps) => {
    // Ignore a repeat action while this key's request is still in flight.
    if (pending.current.has(key)) return;
    ops.apply();
    pending.current.add(key);
    try {
      await ops.request();
    } catch (err) {
      ops.rollback(err);
    } finally {
      pending.current.delete(key);
    }
  }, []);

  return { run, pending } as const;
}
