'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useRemoteStatus(pollMs = 5000) {
  const [status, setStatus] = useState<DisplayStatus | null>(null);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const failuresRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/display/status');
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
    } catch {
      failuresRef.current++;
      if (failuresRef.current >= 3) setIsConnected(false);
    }
  }, []);

  useEffect(() => {
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
