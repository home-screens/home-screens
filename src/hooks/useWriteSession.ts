'use client';

import { useCallback, useRef, useState } from 'react';
import { isSessionExpired } from '@/lib/editor-fetch';
import { WriteSession, type Mutation, type RequestOf, type ResolveId } from '@/lib/write-session';
import { usePolledFetch } from './usePolledFetch';

export interface UseWriteSessionOptions<T, R, C> {
  /** What is shown before the hub has answered. */
  initial: T;
  /** The hub's copy, or `null` when the answer is unusable (a failed load, never an empty copy). */
  load: () => Promise<T | null>;
  /** Send one request; resolves with the hub's copy after it and whatever the route says it made, rejects with the refusal. */
  send: (request: R) => Promise<{ data: T; created?: C }>;
  /** How often the hub is asked again while the surface is mounted. Omit to read once. */
  pollMs?: number;
  /** How long polls are held off after a write; defaults to the poll period. */
  holdMs?: number;
  /** A pending change the newer hub copy no longer allows is skipped when this says so (see `WriteSession`). */
  tolerates?: (err: unknown) => boolean;
  /** A write was refused, before or after it was sent. Never for an expired session. */
  onRefused: (err: unknown) => void;
  /** A write went through (clear an earlier refusal, say). */
  onSaved?: () => void;
}

/**
 * A `WriteSession` (`lib/write-session.ts`) as React state: the copy to
 * show, whether anything has loaded, and the writes. The hub is read on
 * mount and, with `pollMs`, every so often while the tab is in view and
 * again when the device comes back online; a poll's answer is dropped while
 * a write is out or has just landed.
 *
 * `loadError` is set when a load fails, before or after anything loaded; a
 * surface that has something to show may keep showing it. `retry` reads
 * again at once.
 */
export function useWriteSession<T, R, C = unknown>(options: UseWriteSessionOptions<T, R, C>) {
  // Read when an answer lands, so the surface's latest words and builders are used.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [data, setData] = useState<T>(options.initial);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [session] = useState(() => new WriteSession<T, R, C>({
    load: () => optionsRef.current.load(),
    send: (request) => optionsRef.current.send(request),
    holdMs: options.holdMs ?? options.pollMs ?? 0,
    tolerates: (err) => optionsRef.current.tolerates?.(err) ?? false,
    expired: isSessionExpired,
    onChange: setData,
    onLoad: (outcome) => {
      if (outcome === 'adopted') {
        setLoaded(true);
        setLoadError(false);
      } else if (outcome === 'failed') {
        setLoadError(true);
      }
    },
    onRefused: (err) => optionsRef.current.onRefused(err),
    onSaved: () => optionsRef.current.onSaved?.(),
  }, options.initial));

  usePolledFetch(
    () => { void session.refresh(); },
    [session],
    { intervalMs: options.pollMs, pauseWhenHidden: options.pollMs !== undefined },
  );

  const write = useCallback(
    (apply: Mutation<T> | null, request: RequestOf<R>, onSuccess?: (created?: C) => void) =>
      session.write(apply, request, onSuccess),
    [session],
  );
  const retry = useCallback(() => { void session.refresh(true); }, [session]);
  const mapId = useCallback((temp: string, real: string) => session.mapId(temp, real), [session]);
  const resolveId = useCallback<ResolveId>((id) => session.resolveId(id), [session]);

  return { data, loaded, loadError, retry, write, mapId, resolveId, session };
}
