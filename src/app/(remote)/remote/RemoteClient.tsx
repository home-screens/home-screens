'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { DisplayStatus } from '@/lib/display-commands';
import StatusBar from './components/StatusBar';
import ScreenControls from './components/ScreenControls';
import ProfileSwitcher from './components/ProfileSwitcher';
import AlertSender from './components/AlertSender';
import SystemInfo from './components/SystemInfo';
import PowerControls from './components/PowerControls';
import ConnectionBanner from './components/ConnectionBanner';

interface RemoteInitialData {
  screens: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | undefined;
}

// ---------------------------------------------------------------------------
// Hooks
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

function useRemoteStatus(pollMs = 5000) {
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

  // Start the normal polling interval
  useEffect(() => {
    poll();
    intervalRef.current = setInterval(poll, pollMs);
    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(burstTimerRef.current);
    };
  }, [poll, pollMs]);

  // Nudge: switch to fast 1s polling for 10s after a command, then revert
  const nudge = useCallback(() => {
    clearInterval(intervalRef.current);
    clearTimeout(burstTimerRef.current);
    // Immediate poll + fast interval
    poll();
    intervalRef.current = setInterval(poll, 1000);
    burstTimerRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(poll, pollMs);
    }, 10_000);
  }, [poll, pollMs]);

  return { status, isConnected, lastUpdated, nudge };
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function RemoteClient({ initialData }: { initialData: RemoteInitialData }) {
  const { status, isConnected, lastUpdated, nudge } = useRemoteStatus();

  // Optimistic overrides — applied on top of polled status for instant feedback
  const [optimistic, setOptimistic] = useState<{
    displayState?: 'active' | 'asleep';
    screenIndex?: number;
  }>({});

  // Clear optimistic overrides once real status catches up
  useEffect(() => {
    if (!status) return;
    setOptimistic((prev) => {
      const next = { ...prev };
      if (prev.displayState && status.displayState === prev.displayState) delete next.displayState;
      if (prev.screenIndex !== undefined && status.currentScreen.index === prev.screenIndex) delete next.screenIndex;
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [status]);

  // Build the effective status by merging optimistic overrides
  const effectiveStatus: DisplayStatus | null = status
    ? {
        ...status,
        displayState: optimistic.displayState ?? status.displayState,
        currentScreen:
          optimistic.screenIndex !== undefined
            ? {
                ...status.currentScreen,
                index: optimistic.screenIndex,
                name: initialData.screens[optimistic.screenIndex]?.name ?? status.currentScreen.name,
              }
            : status.currentScreen,
      }
    : null;

  const handleNav = useCallback((direction: 'next' | 'prev') => {
    nudge();
    if (!status) return;
    const count = status.screenCount;
    const cur = optimistic.screenIndex ?? status.currentScreen.index;
    const next = direction === 'next' ? (cur + 1) % count : (cur - 1 + count) % count;
    setOptimistic((prev) => ({ ...prev, screenIndex: next }));
  }, [nudge, status, optimistic.screenIndex]);

  const handleSleepWake = useCallback((asleep: boolean) => {
    nudge();
    setOptimistic((prev) => ({ ...prev, displayState: asleep ? 'active' : 'asleep' }));
  }, [nudge]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      {!isConnected && <ConnectionBanner />}

      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800 px-4 py-3">
        <StatusBar status={effectiveStatus} isConnected={isConnected} lastUpdated={lastUpdated} />
      </header>

      <main className="px-4 pb-8 space-y-6 pt-4">
        <ScreenControls
          status={effectiveStatus}
          onNav={handleNav}
          onSleepWake={handleSleepWake}
        />

        {initialData.profiles.length > 0 && (
          <ProfileSwitcher
            profiles={initialData.profiles}
            activeProfile={status?.activeProfile ?? initialData.activeProfile ?? null}
          />
        )}

        <AlertSender />

        <SystemInfo />

        <PowerControls />
      </main>
    </div>
  );
}
