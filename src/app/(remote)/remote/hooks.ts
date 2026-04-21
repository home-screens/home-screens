'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { editorFetch, isSessionExpired } from '@/lib/editor-fetch';
import type { DisplayStatus } from '@/lib/display-commands';

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
        failuresRef.current = 0;
        setIsConnected(true);
      } else if (res.status === 404) {
        failuresRef.current = 0;
        setIsConnected(true);
        setStatus(null);
      }
    } catch (e) {
      // 401 already triggered a /login redirect; don't count it as a network
      // failure or the "disconnected" banner would flash on the way out.
      if (isSessionExpired(e)) return;
      failuresRef.current++;
      if (failuresRef.current >= 3) setIsConnected(false);
    }
  }, [displayId]);

  useEffect(() => {
    // Reset status whenever the target display changes so the UI doesn't
    // show stale data from the previous target.
    setStatus(null);
    setLastUpdated(null);
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

  return { status, isConnected, lastUpdated, nudge };
}
