'use client';

import { useState, useEffect, useCallback } from 'react';
import type { DisplayStatus } from '@/lib/display-commands';
import type { ChoreChartConfig } from '@/types/config';
import { useRemoteStatus } from './hooks';
import StatusBar from './components/StatusBar';
import ConnectionBanner from './components/ConnectionBanner';
import SegmentedControl from './components/SegmentedControl';
import ControlTab from './components/ControlTab';
import ChoresTab from './components/ChoresTab';

interface RemoteInitialData {
  screens: Array<{ id: string; name: string }>;
  profiles: Array<{ id: string; name: string }>;
  activeProfile: string | undefined;
  choreConfig: ChoreChartConfig | null;
}

export default function RemoteClient({ initialData }: { initialData: RemoteInitialData }) {
  const { status, isConnected, lastUpdated, nudge } = useRemoteStatus();

  // Tab state
  const [activeTab, setActiveTab] = useState<string>('control');
  const hasChores = initialData.choreConfig !== null;

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

  const tabs = [
    { id: 'control', label: 'Control' },
    ...(hasChores ? [{ id: 'chores', label: 'Chores' }] : []),
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200">
      {!isConnected && <ConnectionBanner />}

      <header className="sticky top-0 z-10 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-800">
        <div className="px-4 py-3">
          <StatusBar status={effectiveStatus} isConnected={isConnected} lastUpdated={lastUpdated} />
        </div>
        {hasChores && (
          <SegmentedControl tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
        )}
      </header>

      <main className="px-4 pb-8 pt-4">
        {activeTab === 'control' ? (
          <ControlTab
            status={effectiveStatus}
            profiles={initialData.profiles}
            activeProfile={status?.activeProfile ?? initialData.activeProfile ?? null}
            onNav={handleNav}
            onSleepWake={handleSleepWake}
          />
        ) : (
          <ChoresTab config={initialData.choreConfig!} />
        )}
      </main>
    </div>
  );
}
