'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import type { DisplayStatus } from '@/lib/display-commands';
import type { DisplayApiEntry, DisplaysApiResponse } from '@/lib/displays-api-types';

// ---------------------------------------------------------------------------
// useCommand — tracks async command execution state
// ---------------------------------------------------------------------------

type CommandState = 'idle' | 'pending' | 'success' | 'error';

export function useCommand() {
  const [state, setState] = useState<CommandState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const execute = useCallback(async (fn: () => Promise<Response | null>) => {
    clearTimeout(timeoutRef.current);
    setState('pending');
    setError(null);
    try {
      const res = await fn();
      if (!res) throw new Error('No response');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setState('success');
      timeoutRef.current = setTimeout(() => setState('idle'), 1000);
      return res;
    } catch (e) {
      // editorFetch already kicked off a /login redirect; don't flash an error UI
      // on the way out the door. Reset state so the calling button doesn't stay
      // visually pending during the redirect window.
      if (isSessionExpired(e)) {
        setState('idle');
        return null;
      }
      const msg = e instanceof Error ? e.message : 'Failed';
      setError(msg);
      setState('error');
      timeoutRef.current = setTimeout(() => setState('idle'), 3000);
      return null;
    }
  }, []);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return { state, error, execute };
}

// ---------------------------------------------------------------------------
// useRemoteStatus — polls display status with burst-polling after commands
// ---------------------------------------------------------------------------

export function useRemoteStatus(pollMs = 5000, displayId?: string) {
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  // True once the hub answers 404 for this display: it exists in the
  // registry but has never posted a heartbeat. Distinct from "waiting for
  // the first poll" (status null, neverConnected false) so the hero can say
  // "hasn't connected yet" instead of waiting forever.
  const [neverConnected, setNeverConnected] = useState(false);
  // Whether the most recent poll failed at the network level. `isConnected`
  // only flips after three failures; this flips on the first, so a
  // user-initiated hub restart can watch for "went away, then came back".
  const [lastPollFailed, setLastPollFailed] = useState(false);
  const failuresRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const poll = useCallback(async () => {
    try {
      const url = displayId
        ? `/api/display/status?display=${encodeURIComponent(displayId)}`
        : '/api/display/status';
      const res = await editorFetch(url);
      if (res.ok) {
        const data: DisplayStatus = await res.json();
        setStatus(data);
        setLastUpdated(new Date());
        setNeverConnected(false);
        failuresRef.current = 0;
        setIsConnected(true);
        setLastPollFailed(false);
      } else if (res.status === 404) {
        failuresRef.current = 0;
        setIsConnected(true);
        setLastPollFailed(false);
        setStatus(null);
        setNeverConnected(true);
      }
    } catch (e) {
      // 401 already triggered a /login redirect; don't count it as a network
      // failure or the "disconnected" banner would flash on the way out.
      if (isSessionExpired(e)) return;
      failuresRef.current++;
      setLastPollFailed(true);
      if (failuresRef.current >= 3) setIsConnected(false);
    }
  }, [displayId]);

  useEffect(() => {
    // Reset status whenever the target display changes so the UI doesn't
    // show stale data from the previous target.
    setStatus(null);
    setLastUpdated(null);
    setNeverConnected(false);
    poll();
    intervalRef.current = setInterval(poll, pollMs);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(burstTimerRef.current);
    };
  }, [poll, pollMs]);

  const nudge = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(burstTimerRef.current);
    poll();
    intervalRef.current = setInterval(poll, 1000);
    burstTimerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, pollMs);
    }, 10_000);
  }, [poll, pollMs]);

  return { status, isConnected, lastUpdated, neverConnected, lastPollFailed, nudge };
}

// ---------------------------------------------------------------------------
// useAllDisplayStatuses — every registered display's heartbeat, for All mode
// ---------------------------------------------------------------------------

/**
 * Polls `/api/displays` so the remote can show one line per display when
 * "All" is selected, and confirm broadcast commands against every display
 * rather than a representative one. `entries` is null until the first poll
 * lands (so "not loaded yet" is never mistaken for "never connected").
 * Disabled entirely in single-display installs, which have no registry.
 */
export function useAllDisplayStatuses(enabled: boolean, pollMs = 5000) {
  const [entries, setEntries] = useState<DisplayApiEntry[] | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const poll = useCallback(async () => {
    try {
      const res = await editorFetch('/api/displays');
      if (!res.ok) return;
      const data = (await res.json()) as DisplaysApiResponse;
      setEntries(data.displays);
    } catch {
      // Hub reachability is tracked by useRemoteStatus; keep the last list.
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setEntries(null);
      return;
    }
    poll();
    intervalRef.current = setInterval(poll, pollMs);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(burstTimerRef.current);
    };
  }, [enabled, poll, pollMs]);

  const nudge = useCallback(() => {
    if (!enabled) return;
    clearInterval(intervalRef.current);
    clearTimeout(burstTimerRef.current);
    poll();
    intervalRef.current = setInterval(poll, 1000);
    burstTimerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, pollMs);
    }, 10_000);
  }, [enabled, poll, pollMs]);

  return { entries, nudge };
}

// ---------------------------------------------------------------------------
// usePendingCommand — optimistic value that reverts unless confirmed in time
// ---------------------------------------------------------------------------

/**
 * The remote shows a command's result the instant it is sent (the button
 * flips, the slider moves). That optimism must expire: an offline display
 * never answers, and a remote that keeps saying "Asleep" about a display
 * that is still lit is lying. `start(expected)` opens a window; the caller
 * calls `settle()` when the display's heartbeat agrees, and `onTimeout`
 * fires (with the value that never arrived) if the window closes first.
 */
export function usePendingCommand<E>(timeoutMs: number, onTimeout: (expected: E) => void) {
  const [expected, setExpected] = useState<E | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  const settle = useCallback(() => {
    clearTimeout(timerRef.current);
    setExpected(null);
  }, []);

  const start = useCallback((value: E) => {
    clearTimeout(timerRef.current);
    setExpected(value);
    timerRef.current = setTimeout(() => {
      setExpected(null);
      onTimeoutRef.current(value);
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { expected, start, settle };
}
